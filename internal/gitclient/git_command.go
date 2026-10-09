package gitclient

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

// Keep user authentication settings, but never inherit another repository's
// location, index, object database or command-scope configuration.
func gitEnvironment() []string {
	blocked := map[string]bool{
		"GIT_DIR": true, "GIT_WORK_TREE": true, "GIT_COMMON_DIR": true,
		"GIT_INDEX_FILE": true, "GIT_OBJECT_DIRECTORY": true,
		"GIT_ALTERNATE_OBJECT_DIRECTORIES": true, "GIT_NAMESPACE": true,
		"GIT_EXEC_PATH": true, "GIT_PREFIX": true, "GIT_CONFIG": true, "GIT_CONFIG_PARAMETERS": true,
		"GIT_CONFIG_COUNT": true, "GIT_SHALLOW_FILE": true,
		"GIT_GLOB_PATHSPECS": true, "GIT_NOGLOB_PATHSPECS": true,
		"GIT_ICASE_PATHSPECS": true, "GIT_LITERAL_PATHSPECS": true,
	}
	env := []string{}
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !blocked[key] && !strings.HasPrefix(key, "GIT_CONFIG_KEY_") && !strings.HasPrefix(key, "GIT_CONFIG_VALUE_") {
			env = append(env, entry)
		}
	}
	return append(env, "GIT_TERMINAL_PROMPT=0", "GIT_LITERAL_PATHSPECS=1", "LC_ALL=C", "GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true")
}

func gitCommand(ctx context.Context, path string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-c", "core.fsmonitor=false"}, args...)...)
	cmd.Dir = path
	cmd.Env = gitEnvironment()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	// Kill the entire process group, including hooks, helpers and SSH. A helper
	// must not keep inherited output pipes open after cancellation.
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if err == syscall.ESRCH {
			return os.ErrProcessDone
		}
		return err
	}
	cmd.WaitDelay = time.Second
	return cmd
}

func gitReadCommand(command string) bool {
	switch command {
	case "status", "log", "diff", "show", "rev-parse", "symbolic-ref", "for-each-ref", "ls-files", "ls-tree", "cat-file", "blame", "diff-tree", "check-ref-format":
		return true
	}
	return false
}

func gitTimeout(command string) time.Duration {
	if gitReadCommand(command) || command == "config" {
		return 3 * time.Minute
	}
	// Network transfers, signing and user hooks routinely take longer than reads.
	return 30 * time.Minute
}

func longGitCommand(command string) bool {
	switch command {
	case "commit", "push", "pull", "fetch", "merge", "rebase", "cherry-pick", "revert", "stash":
		return true
	}
	return false
}
