package gitclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
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

// Executable paths and shell commands must come from user/system settings,
// never from the repository being opened. Repository defaults may select a name.
func (s *Service) trustedToolSettings(root string) map[string]string {
	settings := map[string]string{}
	// Apply system settings first; user settings, including empty values, win.
	for _, scope := range []string{"--system", "--global"} {
		out, _ := s.run(root, "", "config", scope, "--includes", "--null", "--get-regexp", `^(merge|diff)tool\.`)
		for _, record := range strings.Split(out, "\x00") {
			key, value, ok := strings.Cut(record, "\n")
			if ok {
				settings[key] = value
			}
		}
	}
	return settings
}

func (s *Service) trustedToolConfig(root, key string) string {
	return s.trustedToolSettings(root)[key]
}

// Override every executable setting Git would otherwise read locally, including
// a local command shadowing a built-in tool with a trusted executable path.
func (s *Service) toolConfigArgs(root, name, kind string) []string {
	settings := s.trustedToolSettings(root)
	command := settings[kind+"."+name+".cmd"]
	if kind == "difftool" && command == "" {
		if merge := settings["mergetool."+name+".cmd"]; merge != "" {
			command = `BASE="$LOCAL"; MERGED="$REMOTE"; ` + merge
		}
	}
	path := settings["mergetool."+name+".path"]
	if path == "" {
		if binary, ok := guiTools[name]; ok {
			path, _ = exec.LookPath(binary)
		}
	}
	return []string{"-c", kind + "." + name + ".cmd=" + command,
		"-c", kind + "." + name + ".path=" + path,
		"-c", kind + "." + name + ".trustExitCode=" + settings["mergetool."+name+".trustexitcode"]}
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
	settings := s.trustedToolSettings(root)
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
	for key := range settings {
		parts := strings.Split(key, ".")
		if len(parts) >= 3 && parts[0] == "mergetool" && (parts[len(parts)-1] == "cmd" || parts[len(parts)-1] == "path") {
			name := strings.Join(parts[1:len(parts)-1], ".")
			if toolName.MatchString(name) {
				names[name] = true
			}
		}
	}
	tools := []MergeTool{}
	for name := range names {
		path := settings["mergetool."+name+".path"]
		command := settings["mergetool."+name+".cmd"]
		if path == "" {
			if binary, known := guiTools[name]; known {
				path, _ = exec.LookPath(binary)
			}
		}
		tools = append(tools, MergeTool{Name: name, Path: path, Available: command != "" || executable(path), Configured: command != "" || settings["mergetool."+name+".path"] != "", Default: name == defaultTool, Custom: command != "", TrustExit: settings["mergetool."+name+".trustexitcode"] == "true"})
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
		if !known && s.trustedToolConfig(root, "mergetool."+name+".cmd") == "" {
			return "", errors.New("custom tools require mergetool.<name>.cmd in global or system Git config")
		}
		if binary != "" {
			if !known {
				return "", errors.New("a custom tool uses its existing Git command")
			}
			if !filepath.IsAbs(binary) || !executable(binary) {
				return "", errors.New("choose an absolute path to an executable file")
			}
			if _, err := s.run(root, "", "config", "--global", "mergetool."+name+".path", binary); err != nil {
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
		_, err := s.run(root, "", "config", "--global", "mergetool."+name+".trustExitCode", fmt.Sprint(trustExit))
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

	return s.withRepository(path, repositoryTool, func(root string) (string, error) {
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

		full, err := safeParent(root, file)
		if err != nil {
			return "", err
		}
		original, err := readToolFile(full)
		if err != nil {
			return "", err
		}
		backup, err := os.CreateTemp(filepath.Dir(full), ".gitextensions-merge-backup-*")
		if err != nil {
			return "", err
		}
		backupPath := backup.Name()
		_, writeErr := backup.Write(original)
		closeErr := backup.Close()
		if writeErr != nil || closeErr != nil {
			_ = os.Remove(backupPath)
			return "", errors.Join(writeErr, closeErr)
		}
		// Never overwrite a pre-existing .orig. Keep this backup on failure/cancel,
		// since restoring it could overwrite newer edits made outside the app.
		cmd, cleanup, err := s.mergeToolCommand(ctx, root, full, name, backupPath, state)
		if err != nil {
			return "", fmt.Errorf("prepare merge tool (backup: %s): %w", backupPath, err)
		}
		defer cleanup()
		// Never automatically answer yes to a tool's unchanged-result prompt.
		cmd.Stdin = strings.NewReader("n\n")
		var out, stderr limitedBuffer
		cmd.Stdout = &out
		cmd.Stderr = &stderr
		s.mu.Unlock()
		err = cmd.Run()
		s.mu.Lock()
		if ctx.Err() != nil {
			return "", fmt.Errorf("external merge tool cancelled; original saved at %s", backupPath)
		}
		if err != nil {
			return "", fmt.Errorf("merge tool (backup: %s): %s %s: %w", backupPath, out.String(), stderr.String(), err)
		}
		data, err := readToolFile(full)
		if err != nil {
			return "", fmt.Errorf("read tool result (backup: %s): %w", backupPath, err)
		}
		if !bytes.ContainsRune(data, 0) && utf8.Valid(data) && conflictMarkers.Match(data) {
			return "", fmt.Errorf("external tool left conflict markers; file remains unresolved (backup: %s)", backupPath)
		}
		// The helper only edits the worktree. Do not restore an old index if a
		// separate Git client changed the conflict while the tool was open.
		raw, err := s.run(root, "", "ls-files", "-u", "-z", "--", file)
		if err != nil {
			return "", err
		}
		if raw != state.raw {
			return "", fmt.Errorf("conflict index changed while the tool was open; inspect repository state (backup: %s)", backupPath)
		}
		if _, err = s.runPaths(root, []string{file}, "add"); err != nil {
			return "", err
		}
		if s.config(root, "mergetool.keepBackup") == "false" {
			_ = os.Remove(backupPath)
			return out.String() + stderr.String(), nil
		}
		return out.String() + stderr.String() + "Original saved at: " + backupPath, nil
	})
}

// Invoke Git's tool library directly. Its outer mergetool script splits a
// name-only file list and cannot represent every legal repository filename.
// The fixed shell code below receives every path as argv/environment data.
func (s *Service) mergeToolCommand(ctx context.Context, root, merged, name, backup string, state conflictState) (*exec.Cmd, func(), error) {
	directory, err := s.run(root, "", "--exec-path")
	if err != nil {
		return nil, nil, err
	}
	directory = strings.TrimSuffix(directory, "\n")
	temp, err := os.MkdirTemp("", "gitextensions-merge-")
	if err != nil {
		return nil, nil, err
	}
	cleanup := func() { _ = os.RemoveAll(temp) }
	versions := map[string]string{"1": "base", "2": "ours", "3": "theirs"}
	for stage, label := range versions {
		data := ""
		if hash := state.stages[stage]; hash != "" {
			data, err = s.run(root, "", "cat-file", "blob", hash)
			if err != nil {
				cleanup()
				return nil, nil, err
			}
		}
		if err := os.WriteFile(filepath.Join(temp, label), []byte(data), 0600); err != nil {
			cleanup()
			return nil, nil, err
		}
	}
	cmd := gitCommand(ctx, root)
	cmd.Path = "/bin/sh"
	const script = `TOOL_MODE=merge; . "$1/git-mergetool--lib"; initialize_merge_tool "$2" && run_merge_tool "$2" "$3"`
	cmd.Args = []string{"sh", "-f", "-c", script, "gitextensions-mergetool", directory, name, strconv.FormatBool(state.stages["1"] != "")}
	cmd.Env = append(cmd.Env, "GIT_EXEC_PATH="+directory, "MERGE_TOOLS_DIR="+filepath.Join(directory, "mergetools"), "GIT_MERGETOOL_GUI=false",
		"BASE="+filepath.Join(temp, "base"), "LOCAL="+filepath.Join(temp, "ours"), "REMOTE="+filepath.Join(temp, "theirs"), "MERGED="+merged, "BACKUP="+backup)
	settings := append([]string{"-c", "core.fsmonitor=false"}, s.toolConfigArgs(root, name, "mergetool")...)
	cmd.Env = append(cmd.Env, "GIT_CONFIG_COUNT="+strconv.Itoa(len(settings)/2))
	for i := 0; i < len(settings); i += 2 {
		key, value, _ := strings.Cut(settings[i+1], "=")
		index := strconv.Itoa(i / 2)
		cmd.Env = append(cmd.Env, "GIT_CONFIG_KEY_"+index+"="+key, "GIT_CONFIG_VALUE_"+index+"="+value)
	}
	return cmd, cleanup, nil
}
