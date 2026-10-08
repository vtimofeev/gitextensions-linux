package gitclient

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

type ConflictData struct {
	Path              string `json:"path"`
	Token             string `json:"token"`
	Binary            bool   `json:"binary"`
	OursPresent       bool   `json:"oursPresent"`
	TheirsPresent     bool   `json:"theirsPresent"`
	ExternalSupported bool   `json:"externalSupported"`
}
type conflictState struct {
	data     ConflictData
	stages   map[string]string
	modes    map[string]string
	mode     os.FileMode
	result   string
	writable bool
	raw      string
}

func safeParent(root, file string) (string, error) {
	if err := validatePaths([]string{file}); err != nil {
		return "", err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(filepath.Join(root, file)))
	if err != nil {
		return "", err
	}
	canonical, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(canonical, parent)
	if err != nil || rel == ".." || strings.HasPrefix(rel, "../") {
		return "", errors.New("file parent points outside repository")
	}
	return filepath.Join(parent, filepath.Base(file)), nil
}
func (s *Service) conflict(root, file string) (conflictState, error) {
	full, err := safeParent(root, file)
	if err != nil {
		return conflictState{}, err
	}
	out, err := s.run(root, "", "ls-files", "-u", "-z", "--", file)
	if err != nil {
		return conflictState{}, err
	}
	state := conflictState{data: ConflictData{Path: file, ExternalSupported: true}, stages: map[string]string{}, modes: map[string]string{}, mode: 0644, writable: true, raw: out}
	digest := sha256.New()
	io.WriteString(digest, out)
	for _, entry := range strings.Split(out, "\x00") {
		if entry == "" {
			continue
		}
		parts := strings.SplitN(entry, "\t", 2)
		if len(parts) != 2 || parts[1] != file {
			continue
		}
		fields := strings.Fields(parts[0])
		if len(fields) != 3 {
			continue
		}
		state.stages[fields[2]] = fields[1]
		state.modes[fields[2]] = fields[0]
		if fields[0] != "100644" && fields[0] != "100755" {
			state.writable = false
			state.data.ExternalSupported = false
		}
		if fields[0] == "100755" {
			state.mode = 0755
		}
	}
	if len(state.stages) == 0 {
		return state, errors.New("file is no longer conflicted; refresh repository")
	}
	readBlob := func(stage string) (string, error) {
		if mode := state.modes[stage]; mode != "100644" && mode != "100755" {
			return "", nil
		}
		hash := state.stages[stage]
		if hash == "" {
			return "", nil
		}
		size, err := s.run(root, "", "cat-file", "-s", hash)
		if err != nil {
			return "", err
		}
		var length int64
		if _, err = fmt.Sscanf(size, "%d", &length); err != nil {
			return "", err
		}
		if length > 1024*1024 {
			state.data.Binary = true
			state.writable = false
			return "", nil
		}
		value, err := s.run(root, "", "cat-file", "blob", hash)
		if err != nil {
			return "", err
		}
		if strings.ContainsRune(value, 0) || !utf8.ValidString(value) {
			state.data.Binary = true
			state.writable = false
			return "", nil
		}
		return value, nil
	}
	_, err = readBlob("1")
	if err != nil {
		return state, err
	}
	_, err = readBlob("2")
	if err != nil {
		return state, err
	}
	_, err = readBlob("3")
	if err != nil {
		return state, err
	}
	state.data.OursPresent = state.stages["2"] != ""
	state.data.TheirsPresent = state.stages["3"] != ""
	info, err := os.Lstat(full)
	if os.IsNotExist(err) {
		io.WriteString(digest, "missing")
	} else if err != nil {
		return state, err
	} else {
		io.WriteString(digest, info.Mode().String())
		if !info.Mode().IsRegular() {
			state.writable = false
			state.data.ExternalSupported = false
			if info.Mode()&os.ModeSymlink != 0 {
				link, err := os.Readlink(full)
				if err != nil {
					return state, err
				}
				io.WriteString(digest, link)
			}
		} else {
			state.mode = info.Mode().Perm()
			f, err := os.Open(full)
			if err != nil {
				return state, err
			}
			_, err = io.Copy(digest, f)
			if err != nil {
				f.Close()
				return state, err
			}
			if _, err = f.Seek(0, 0); err != nil {
				f.Close()
				return state, err
			}
			if info.Size() <= 1024*1024 {
				data, err := io.ReadAll(f)
				if err != nil {
					f.Close()
					return state, err
				}
				if bytes.ContainsRune(data, 0) || !utf8.Valid(data) {
					state.data.Binary = true
					state.writable = false
				} else {
					state.result = string(data)
				}
			} else {
				state.data.Binary = true
				state.writable = false
			}
			f.Close()
		}
	}
	state.data.Token = hex.EncodeToString(digest.Sum(nil))
	return state, nil
}
func (s *Service) Conflict(path, file string) (ConflictData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return ConflictData{}, err
	}
	state, err := s.conflict(root, file)
	return state.data, err
}

var conflictMarkers = regexp.MustCompile(`(?m)^(<{7}( |$)|={7}$|>{7}( |$)|\|{7}( |$))`)

func (s *Service) ResolveConflict(path, file, token, mode string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		state, err := s.conflict(root, file)
		if err != nil {
			return "", err
		}
		if token != state.data.Token {
			return "", errors.New("conflict changed outside the app; reload before resolving")
		}
		switch mode {
		case "ours", "theirs":
			stage := "2"
			if mode == "theirs" {
				stage = "3"
			}
			if state.stages[stage] == "" {
				return "", errors.New("this side deleted the file; choose resolve as deleted")
			}
			if state.modes[stage] == "160000" {
				return s.run(root, "", "update-index", "--add", "--cacheinfo", "160000,"+state.stages[stage]+","+file)
			}
			if _, err = s.run(root, "", "checkout", "--"+mode, "--", file); err != nil {
				return "", err
			}
		case "delete":
			return s.run(root, "", "rm", "-f", "--", file)
		case "mark":
			if state.writable && conflictMarkers.MatchString(state.result) {
				return "", errors.New("conflict markers remain in the working file")
			}
		default:
			return "", errors.New("invalid conflict resolution mode")
		}
		return s.run(root, "", "add", "--", file)
	})
}
