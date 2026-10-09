package gitclient

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Read blob bytes without text conversion or preview truncation.
func (s *Service) diffBlob(root, tree, file string) ([]byte, error) {
	var out string
	var err error
	if tree == ":" {
		out, err = s.run(root, "", "ls-files", "-s", "-z", "--", file)
	} else {
		out, err = s.run(root, "", "ls-tree", "-z", tree, "--", file)
	}
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []byte{}, nil
	}
	record := strings.Split(out, "\x00")[0]
	fields := strings.Fields(strings.SplitN(record, "\t", 2)[0])
	if len(fields) != 3 {
		return nil, errors.New("invalid file entry")
	}
	hash := fields[2]
	if tree == ":" {
		if fields[2] != "0" {
			return nil, errors.New("file has conflicts; use the conflict merge tool")
		}
		hash = fields[1]
	}
	if fields[0] == "160000" {
		return []byte(hash + "\n"), nil
	}
	data, err := s.run(root, "", "cat-file", "blob", hash)
	if err != nil {
		return nil, err
	}
	return []byte(data), nil
}

// RunDiffTool compares isolated snapshots, never auto-staging or editing repository files.
func (s *Service) RunDiffTool(path, file, area, revision, name string) (string, error) {
	ctx, cancel := context.WithCancel(context.Background())
	s.toolMu.Lock()
	if s.toolCancel != nil {
		s.toolMu.Unlock()
		cancel()
		return "", errors.New("an external tool is already running")
	}
	s.toolCancel = cancel
	s.toolMu.Unlock()
	defer func() { cancel(); s.toolMu.Lock(); s.toolCancel = nil; s.toolMu.Unlock() }()
	return s.withRepository(path, repositoryTool, func(root string) (string, error) {
		if err := validatePaths([]string{file}); err != nil {
			return "", err
		}
		if !toolName.MatchString(name) {
			return "", errors.New("choose a merge tool")
		}
		var tool *MergeTool
		for _, entry := range s.mergeTools(root) {
			if entry.Name == name && entry.Available {
				copy := entry
				tool = &copy
				break
			}
		}
		if tool == nil {
			return "", errors.New("external tool is not installed or configured")
		}
		var left, right []byte
		var err error
		original := file
		status, err := s.run(root, "", "status", "--porcelain=v1", "-z", "--untracked-files=all")
		if err != nil {
			return "", err
		}
		files, err := parseStatus(status)
		if err != nil {
			return "", err
		}
		for _, entry := range files {
			if entry.Path == file {
				if entry.Conflict && area != "commit" {
					return "", errors.New("file has conflicts; use the conflict merge tool")
				}
				if entry.OriginalPath != "" && ((area == "staged" && entry.Index == "R") || (area == "unstaged" && entry.Worktree == "R")) {
					original = entry.OriginalPath
				}
			}
		}
		switch area {
		case "staged":
			if s.hasHead(root) {
				left, err = s.diffBlob(root, "HEAD", original)
			}
			if err == nil {
				right, err = s.diffBlob(root, ":", file)
			}
		case "unstaged", "untracked":
			if area == "unstaged" {
				left, err = s.diffBlob(root, ":", original)
			}
			if err == nil {
				full, e := safeParent(root, file)
				if e != nil {
					return "", e
				}
				info, e := os.Lstat(full)
				if os.IsNotExist(e) {
					right = []byte{}
				} else if e != nil {
					return "", e
				} else if info.Mode()&os.ModeSymlink != 0 {
					target, e := os.Readlink(full)
					right, err = []byte(target), e
				} else if !info.Mode().IsRegular() {
					return "", errors.New("external comparison requires an individual file")
				} else if info.Size() > 4*1024*1024 {
					return "", errors.New("file versions above 4 MiB are not supported")
				} else {
					right, err = os.ReadFile(full)
				}
			}
		case "commit":
			rev, e := s.revision(root, revision)
			if e != nil {
				return "", e
			}
			if parent, e := s.revision(root, rev+"^1"); e == nil {
				// Match renamed paths on the first-parent diff used by the built-in viewer.
				names, e := s.run(root, "", "diff-tree", "-r", "-M", "--name-status", "-z", parent, rev)
				if e != nil {
					return "", e
				}
				changes, e := parseNameStatus(names)
				if e != nil {
					return "", e
				}
				for _, change := range changes {
					if change.Path == file && change.OriginalPath != "" {
						original = change.OriginalPath
					}
				}
				left, err = s.diffBlob(root, parent, original)
			}
			if err == nil {
				right, err = s.diffBlob(root, rev, file)
			}
		default:
			return "", errors.New("invalid diff area")
		}
		if err != nil {
			return "", err
		}
		temp, err := os.MkdirTemp("", "gitextensions-diff-")
		if err != nil {
			return "", err
		}
		defer os.RemoveAll(temp)
		before, after := filepath.Join(temp, "before", filepath.Base(file)), filepath.Join(temp, "after", filepath.Base(file))
		for _, destination := range []string{before, after} {
			if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
				return "", err
			}
		}
		if err := os.WriteFile(before, left, 0600); err != nil {
			return "", err
		}
		if err := os.WriteFile(after, right, 0600); err != nil {
			return "", err
		}
		args := s.toolConfigArgs(root, name, "difftool")
		args = append(args, "difftool", "--no-index", "--no-prompt", "--trust-exit-code", "--tool="+name, "--", before, after)
		cmd := gitCommand(ctx, root, args...)
		var stdout, stderr limitedBuffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		s.mu.Unlock()
		err = cmd.Run()
		s.mu.Lock()
		if ctx.Err() != nil {
			return "", errors.New("external comparison cancelled")
		}
		// --no-index exits 1 for a difference even when the viewer succeeds.
		if err != nil {
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != 1 {
				return "", fmt.Errorf("diff tool: %s: %w", stderr.String(), err)
			}
		}
		return "External comparison closed: " + file, nil
	})
}
