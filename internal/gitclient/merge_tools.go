package gitclient

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"
)

type MergeTool struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Available  bool   `json:"available"`
	Configured bool   `json:"configured"`
	Default    bool   `json:"default"`
	Custom     bool   `json:"custom"`
	TrustExit  bool   `json:"trustExit"`
}

var toolName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
var guiTools = map[string]string{"meld": "meld", "kdiff3": "kdiff3", "diffuse": "diffuse", "bcompare": "bcompare", "p4merge": "p4merge", "xxdiff": "xxdiff", "tkdiff": "tkdiff"}

func (s *Service) config(root, key string) string {
	out, _ := s.run(root, "", "config", "--get", key)
	return strings.TrimSpace(out)
}
func executable(path string) bool {
	if path == "" {
		return false
	}
	resolved, err := exec.LookPath(path)
	if err != nil {
		return false
	}
	info, err := os.Stat(resolved)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0111 != 0
}
func (s *Service) mergeTools(root string) []MergeTool {
	names := map[string]bool{}
	for name := range guiTools {
		names[name] = true
	}
	defaultTool := s.config(root, "merge.guitool")
	if defaultTool == "" {
		defaultTool = s.config(root, "merge.tool")
	}
	if toolName.MatchString(defaultTool) {
		names[defaultTool] = true
	}
	configured, _ := s.run(root, "", "config", "--name-only", "--get-regexp", `^mergetool\..*\.(cmd|path)$`)
	for _, key := range strings.Split(configured, "\n") {
		parts := strings.Split(key, ".")
		if len(parts) >= 3 {
			name := strings.Join(parts[1:len(parts)-1], ".")
			if toolName.MatchString(name) {
				names[name] = true
			}
		}
	}
	tools := []MergeTool{}
	for name := range names {
		path := s.config(root, "mergetool."+name+".path")
		command := s.config(root, "mergetool."+name+".cmd")
		if path == "" {
			if binary, known := guiTools[name]; known {
				path, _ = exec.LookPath(binary)
			}
		}
		tools = append(tools, MergeTool{Name: name, Path: path, Available: command != "" || executable(path), Configured: command != "" || s.config(root, "mergetool."+name+".path") != "", Default: name == defaultTool, Custom: command != "", TrustExit: s.config(root, "mergetool."+name+".trustExitCode") == "true"})
	}
	sort.Slice(tools, func(i, j int) bool {
		if tools[i].Default != tools[j].Default {
			return tools[i].Default
		}
		if tools[i].Available != tools[j].Available {
			return tools[i].Available
		}
		return tools[i].Name < tools[j].Name
	})
	return tools
}
func (s *Service) MergeTools(path string) ([]MergeTool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	return s.mergeTools(root), nil
}
func (s *Service) ConfigureMergeTool(path, name, binary string, trustExit bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if !toolName.MatchString(name) {
			return "", errors.New("invalid merge-tool name")
		}
		_, known := guiTools[name]
		if !known && s.config(root, "mergetool."+name+".cmd") == "" {
			return "", errors.New("custom tools must have a mergetool.<name>.cmd in Git config")
		}
		if binary != "" {
			if !known {
				return "", errors.New("a custom tool uses its existing Git command")
			}
			if !filepath.IsAbs(binary) || !executable(binary) {
				return "", errors.New("choose an absolute path to an executable file")
			}
			if _, err := s.run(root, "", "config", "--local", "mergetool."+name+".path", binary); err != nil {
				return "", err
			}
		}
		ready := false
		for _, tool := range s.mergeTools(root) {
			if tool.Name == name && tool.Available {
				ready = true
			}
		}
		if !ready {
			return "", errors.New("merge tool is not installed; specify its executable path")
		}
		if _, err := s.run(root, "", "config", "--local", "merge.tool", name); err != nil {
			return "", err
		}
		if _, err := s.run(root, "", "config", "--local", "merge.guitool", name); err != nil {
			return "", err
		}
		_, err := s.run(root, "", "config", "--local", "mergetool."+name+".trustExitCode", fmt.Sprint(trustExit))
		return "Saved repository merge tool: " + name, err
	})
}
func (s *Service) CancelMergeTool() {
	s.toolMu.Lock()
	defer s.toolMu.Unlock()
	if s.toolCancel != nil {
		s.toolCancel()
	}
}
func (s *Service) RunMergeTool(path, file, name string) (string, error) {
	ctx, cancel := context.WithCancel(context.Background())
	s.toolMu.Lock()
	if s.toolCancel != nil {
		s.toolMu.Unlock()
		cancel()
		return "", errors.New("an external merge tool is already running")
	}
	s.toolCancel = cancel
	s.toolMu.Unlock()
	defer func() { cancel(); s.toolMu.Lock(); s.toolCancel = nil; s.toolMu.Unlock() }()

	return s.mutation(path, func(root string) (string, error) {
		if ctx.Err() != nil {
			return "", errors.New("external merge tool cancelled")
		}
		if !toolName.MatchString(name) {
			return "", errors.New("choose a merge tool")
		}
		ready := false
		for _, tool := range s.mergeTools(root) {
			if tool.Name == name && tool.Available {
				ready = true
			}
		}
		if !ready {
			return "", errors.New("merge tool is not installed or configured")
		}
		state, err := s.conflict(root, file)
		if err != nil {
			return "", err
		}
		if !state.data.ExternalSupported {
			return "", errors.New("external merge tools require regular file conflicts; use keep-side or delete actions")
		}
		if !state.data.OursPresent || !state.data.TheirsPresent {
			return "", errors.New("resolve modify/delete conflicts using keep-side or delete actions")
		}

		cmd := exec.CommandContext(ctx, "git", "mergetool", "--tool="+name, "--no-prompt", "--", file)
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C", "GIT_EDITOR=true")
		// Never automatically answer yes to a tool's unchanged-result prompt.
		cmd.Stdin = strings.NewReader("n\n")
		var out, stderr limitedBuffer
		cmd.Stdout = &out
		cmd.Stderr = &stderr
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		cmd.Cancel = func() error {
			if cmd.Process == nil {
				return nil
			}
			return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		cmd.WaitDelay = time.Second
		err = cmd.Run()
		if ctx.Err() != nil {
			return "", errors.New("external merge tool cancelled; inspect repository state")
		}
		if err != nil {
			return "", fmt.Errorf("merge tool: %s %s: %w", out.String(), stderr.String(), err)
		}
		// A misconfigured tool must not silently stage remaining conflict markers.
		full, e := safeParent(root, file)
		if e == nil {
			info, e := os.Lstat(full)
			if e == nil && info.Mode().IsRegular() && info.Size() <= 1024*1024 {
				data, e := os.ReadFile(full)
				if e == nil && conflictMarkers.Match(data) {
					raw, _ := s.run(root, "", "ls-files", "-u", "-z", "--", file)
					if raw == "" {
						hashLength := 40
						for _, hash := range state.stages {
							hashLength = len(hash)
							break
						}
						index := "0 " + strings.Repeat("0", hashLength) + "\t" + file + "\x00"
						index += state.raw
						if _, e = s.run(root, index, "update-index", "-z", "--index-info"); e != nil {
							return "", e
						}
					}
					return "", errors.New("external tool left conflict markers; file remains unresolved")
				}
			}
		}
		return out.String() + stderr.String(), nil
	})
}
