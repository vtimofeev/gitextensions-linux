package gitclient

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// Discard reverts current status entries, optionally preserving the index.
func (s *Service) Discard(path string, requested []string, worktreeOnly bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := validatePaths(requested); err != nil {
			return "", err
		}
		out, err := s.run(root, "", "status", "--porcelain=v1", "-z", "--untracked-files=all")
		if err != nil {
			return "", err
		}
		files, err := parseStatus(out)
		if err != nil {
			return "", err
		}
		// Validate the entire selection before changing any file.
		entries := make(map[string]*FileStatus, len(files))
		for i := range files {
			entries[files[i].Path] = &files[i]
		}
		selected := make([]FileStatus, 0, len(requested))
		seen := map[string]bool{}
		for _, file := range requested {
			if seen[file] {
				continue
			}
			seen[file] = true
			entry := entries[file]
			if entry == nil {
				return "", errors.New("file is no longer changed; refresh repository: " + file)
			}
			if entry.Conflict {
				return "", errors.New("resolve conflicts before discarding individual files: " + file)
			}
			if entry.OriginalPath != "" {
				if err := validatePaths([]string{entry.OriginalPath}); err != nil {
					return "", err
				}
			}
			selected = append(selected, *entry)
		}
		remove := func(name string) error {
			full := filepath.Join(root, name)
			parent, err := filepath.EvalSymlinks(filepath.Dir(full))
			if err != nil {
				return err
			}
			canonical, err := filepath.EvalSymlinks(root)
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(canonical, parent)
			if err != nil || rel == ".." || strings.HasPrefix(rel, "../") {
				return errors.New("file parent points outside repository")
			}
			info, err := os.Lstat(full)
			if os.IsNotExist(err) {
				return nil
			}
			if err != nil {
				return err
			}
			if info.IsDir() {
				return errors.New("only individual files can be removed")
			}
			return os.Remove(full)
		}

		var reverted, names, untracked []string
		for _, entry := range selected {
			reverted = append(reverted, entry.Path)
			if entry.Untracked {
				untracked = append(untracked, entry.Path)
				continue
			}
			names = append(names, entry.Path)
			if entry.OriginalPath != "" && (!worktreeOnly || entry.Worktree == "R" || entry.Worktree == "C") {
				names = append(names, entry.OriginalPath)
			}
		}
		if !worktreeOnly && len(names) > 0 {
			args := []string{"reset", "HEAD"}
			if !s.hasHead(root) {
				args = []string{"rm", "--cached"}
			}
			if _, err := s.runPaths(root, names, args...); err != nil {
				return "", err
			}
		}
		indexed, err := s.runPaths(root, names, "ls-files", "-z")
		if err != nil {
			return "", err
		}
		tracked := make(map[string]bool)
		for _, name := range strings.Split(indexed, "\x00") {
			tracked[name] = true
		}
		var restore []string
		for _, name := range names {
			if tracked[name] {
				restore = append(restore, name)
			} else {
				untracked = append(untracked, name)
			}
		}
		if _, err := s.runPaths(root, restore, "restore", "--worktree"); err != nil {
			return "", err
		}
		for _, name := range untracked {
			if err := remove(name); err != nil {
				return "", err
			}
		}
		return "Reverted changes to " + strings.Join(reverted, ", "), nil
	})
}
