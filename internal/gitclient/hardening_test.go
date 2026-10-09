package gitclient

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRepositoryPathsCannotEscape(t *testing.T) {
	for _, path := range []string{"", "..", "./..", "a/../..", "/tmp/file", "a\x00b"} {
		if validatePaths([]string{path}) == nil {
			t.Errorf("accepted %q", path)
		}
	}
	// Returning to the repository root does not escape it.
	for _, path := range []string{"a/..", ".", "a[1].txt", "-file"} {
		if err := validatePaths([]string{path}); err != nil {
			t.Errorf("rejected %q: %v", path, err)
		}
	}
}

func TestRepositoryEnvironmentCannotRedirectCommands(t *testing.T) {
	first, second := repository(t), repository(t)
	write(t, first, "ours", "ours")
	write(t, second, "theirs", "theirs")
	t.Setenv("GIT_DIR", filepath.Join(second, ".git"))
	t.Setenv("GIT_WORK_TREE", second)
	t.Setenv("GIT_INDEX_FILE", filepath.Join(second, ".git", "index"))
	t.Setenv("GIT_CONFIG_COUNT", "1")
	t.Setenv("GIT_CONFIG_KEY_0", "core.worktree")
	t.Setenv("GIT_CONFIG_VALUE_0", second)
	s := NewService()
	state, err := s.WorkingState(first)
	if err != nil || len(state.Files) != 1 || state.Files[0].Path != "ours" {
		t.Fatalf("redirected status: %+v %v", state, err)
	}
	if _, err := s.Stage(first, []string{"ours"}); err != nil {
		t.Fatal(err)
	}
	// Check the second index directly, without invoking a test helper with the
	// intentionally poisoned environment.
	if _, err := os.Stat(filepath.Join(second, ".git", "index")); !os.IsNotExist(err) {
		t.Fatalf("second index changed: %v", err)
	}
}

func TestRepositoryFsmonitorIsDisabled(t *testing.T) {
	p := repository(t)
	hook := filepath.Join(t.TempDir(), "monitor")
	marker := filepath.Join(p, ".git", "monitor-ran")
	if err := os.WriteFile(hook, []byte("#!/bin/sh\ntouch '"+marker+"'\nprintf 'token\\0'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	git(t, p, "config", "core.fsmonitor", hook)
	if _, err := NewService().WorkingState(p); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("repository hook executed: %v", err)
	}
}

func TestLimitedBufferStreaming(t *testing.T) {
	var buffer limitedBuffer
	n, err := buffer.ReadFrom(strings.NewReader(strings.Repeat("x", 4*1024*1024+100)))
	if err != nil || n != 4*1024*1024+100 || buffer.Len() != 4*1024*1024 || !buffer.truncated {
		t.Fatalf("stream limit bypassed: read=%d stored=%d truncated=%v err=%v", n, buffer.Len(), buffer.truncated, err)
	}
}

func TestStructuredOutputLimitAndBlameMarker(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "marker", "[Preview truncated at 4 MiB]\n", "base")
	lines, err := s.Blame(p, "marker", "HEAD")
	if err != nil || len(lines) != 1 {
		t.Fatalf("literal preview marker rejected: %+v %v", lines, err)
	}
	large := strings.Repeat("x", 4*1024*1024+1)
	write(t, p, "message", large)
	git(t, p, "commit", "--allow-empty", "-F", "message")
	out, err := s.run(p, "", "log", "-1", "-z", "--format=%B")
	if err == nil || out != "" || !strings.Contains(err.Error(), "exceeds 4 MiB") {
		t.Fatalf("partial output returned: %d %v", len(out), err)
	}
}

func TestUntrackedPreviewRejectsFIFO(t *testing.T) {
	p := repository(t)
	fifo := filepath.Join(p, "fifo")
	if err := syscall.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	s := NewService()
	done := make(chan error, 1)
	go func() { _, err := s.Diff(p, "fifo", "untracked", ""); done <- err }()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "regular file") {
			t.Fatalf("FIFO accepted: %v", err)
		}
	case <-time.After(2 * time.Second):
		// Release a broken blocking reader, so a regression cannot leak a goroutine.
		fd, err := syscall.Open(fifo, syscall.O_WRONLY|syscall.O_NONBLOCK, 0)
		if err == nil {
			syscall.Close(fd)
		}
		t.Fatal("FIFO preview blocked")
	}
}

func TestLocalToolCommandsCannotOverrideTrustedTool(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "before\n", "base")
	write(t, p, "file", "after\n")
	trustedTool(t, p, "mergetool.capture.cmd", "true")
	git(t, p, "config", "mergetool.capture.cmd", `touch "$PWD/.git/untrusted-merge"`)
	git(t, p, "config", "difftool.capture.cmd", `touch "$PWD/.git/untrusted-diff"`)
	git(t, p, "config", "mergetool.evil.cmd", `touch "$PWD/.git/untrusted-evil"`)
	git(t, p, "config", "merge.tool", "evil")
	tools, err := s.MergeTools(p)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range tools {
		if tool.Name == "evil" && tool.Available {
			t.Fatal("local command trusted")
		}
	}
	if _, err := s.RunDiffTool(p, "file", "unstaged", "", "evil"); err == nil {
		t.Fatal("local-only tool launched")
	}
	if _, err := s.RunDiffTool(p, "file", "unstaged", "", "capture"); err != nil {
		t.Fatal(err)
	}
	for _, marker := range []string{"untrusted-merge", "untrusted-diff", "untrusted-evil"} {
		if _, err := os.Stat(filepath.Join(p, ".git", marker)); !os.IsNotExist(err) {
			t.Fatalf("local command executed: %s", marker)
		}
	}
}

func TestLocalToolPathCannotOverrideBuiltin(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "before\n", "base")
	write(t, p, "file", "after\n")
	binary := filepath.Join(t.TempDir(), "meld")
	marker := filepath.Join(p, ".git", "trusted-path")
	if err := os.WriteFile(binary, []byte("#!/bin/sh\ntouch '"+marker+"'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	trustedTool(t, p, "mergetool.meld.path", binary)
	git(t, p, "config", "mergetool.meld.cmd", `touch "$PWD/.git/untrusted"`)
	git(t, p, "config", "difftool.meld.cmd", `touch "$PWD/.git/untrusted"`)
	git(t, p, "config", "difftool.meld.path", "/missing/untrusted")
	if _, err := s.RunDiffTool(p, "file", "unstaged", "", "meld"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("trusted binary not launched: %v", err)
	}
	if _, err := os.Stat(filepath.Join(p, ".git", "untrusted")); !os.IsNotExist(err) {
		t.Fatal("local override executed")
	}
}

func TestGitCommandCancellationKillsChildren(t *testing.T) {
	p := repository(t)
	started := filepath.Join(p, ".git", "started")
	late := filepath.Join(p, ".git", "late")
	hook := "#!/bin/sh\ntouch '" + started + "'\n(sleep 2; touch '" + late + "') &\nwait\n"
	if err := os.WriteFile(filepath.Join(p, ".git", "hooks", "pre-commit"), []byte(hook), 0700); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cmd := gitCommand(ctx, p, "commit", "--allow-empty", "-m", "cancel")
	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()
	waitForFile(t, started)
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled command succeeded")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("child kept Git output pipes open")
	}
	time.Sleep(2200 * time.Millisecond)
	if _, err := os.Stat(late); !os.IsNotExist(err) {
		t.Fatal("hook child survived cancellation")
	}
}

func waitForFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("process did not start: %s", path)
}

func TestReviewPromptCacheExpiry(t *testing.T) {
	directory := t.TempDir()
	now := time.Now()
	for _, name := range []string{"prompt-old.txt", "prompt-recent.txt", "keep.txt"} {
		write(t, directory, name, "private prompt")
		if name != "prompt-recent.txt" {
			old := now.Add(-31 * 24 * time.Hour)
			if err := os.Chtimes(filepath.Join(directory, name), old, old); err != nil {
				t.Fatal(err)
			}
		}
	}
	cleanupReviewPrompts(directory, now)
	if _, err := os.Stat(filepath.Join(directory, "prompt-old.txt")); !os.IsNotExist(err) {
		t.Fatal("old prompt retained")
	}
	for _, name := range []string{"prompt-recent.txt", "keep.txt"} {
		if _, err := os.Stat(filepath.Join(directory, name)); err != nil {
			t.Fatalf("removed %s: %v", name, err)
		}
	}
}

func TestMergeToolUsesLiteralFilename(t *testing.T) {
	p := repository(t)
	s := NewService()
	for _, file := range []string{"a[1].txt", "a1.txt"} {
		write(t, p, file, "base\n")
	}
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "base")
	git(t, p, "switch", "-c", "topic")
	for _, file := range []string{"a[1].txt", "a1.txt"} {
		write(t, p, file, "topic\n")
	}
	git(t, p, "commit", "-am", "topic")
	git(t, p, "switch", "main")
	for _, file := range []string{"a[1].txt", "a1.txt"} {
		write(t, p, file, "main\n")
	}
	git(t, p, "commit", "-am", "main")
	if _, err := s.RefAction(p, RefOptions{Action: "merge", Target: "topic", Mode: "no-ff"}); err == nil {
		t.Fatal("expected conflict")
	}
	trustedTool(t, p, "mergetool.custom.cmd", `cp "$REMOTE" "$MERGED"`)
	if _, err := s.ConfigureMergeTool(p, "custom", "", true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RunMergeTool(p, "a[1].txt", "custom"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Conflict(p, "a1.txt"); err != nil {
		t.Fatalf("tool resolved another path: %v", err)
	}
	if git(t, p, "show", ":a[1].txt") != "topic" {
		t.Fatal("wrong file resolved")
	}
}

func TestExternalDiffAllowsReadsAndRejectsConcurrentMutations(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "before\n", "base")
	write(t, p, "file", "after\n")
	trustedTool(t, p, "mergetool.slow.cmd", `touch "$PWD/.git/diff-started"; sleep 30`)
	done := make(chan error, 1)
	go func() { _, err := s.RunDiffTool(p, "file", "unstaged", "", "slow"); done <- err }()
	t.Cleanup(s.CancelMergeTool)
	waitForFile(t, filepath.Join(p, ".git", "diff-started"))
	reads := make(chan error, 1)
	go func() { _, err := s.Snapshot(p, 10); reads <- err }()
	select {
	case err := <-reads:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("diff viewer blocked reads")
	}
	if _, err := s.Stage(p, []string{"file"}); err == nil {
		t.Fatal("mutation raced viewer")
	}
	if _, err := s.RunDiffTool(p, "file", "unstaged", "", "slow"); err == nil {
		t.Fatal("second viewer started")
	}
	// Review launch is read-only and may run alongside a viewer. Its tool is
	// still resolved by the terminal rather than checked against our PATH.
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	if _, err := s.StartReview(p, ReviewOptions{Tool: "codex", Terminal: "/bin/true {command}"}); err != nil {
		t.Fatalf("review blocked by viewer: %v", err)
	}
	s.CancelMergeTool()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancellation reported success")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancellation did not return")
	}
	if _, err := s.Stage(p, []string{"file"}); err != nil {
		t.Fatalf("mutation still blocked after cancellation: %v", err)
	}
}

func TestLongCommitAllowsReadsAndRejectsConcurrentWriters(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "before\n", "base")
	write(t, p, "file", "after\n")
	git(t, p, "add", "file")
	started, release := filepath.Join(p, ".git", "commit-started"), filepath.Join(p, ".git", "commit-release")
	hook := "#!/bin/sh\ntouch .git/commit-started\nwhile test ! -f .git/commit-release; do sleep 0.02; done\n"
	if err := os.WriteFile(filepath.Join(p, ".git", "hooks", "pre-commit"), []byte(hook), 0700); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := s.Commit(p, "slow commit", false); done <- err }()
	t.Cleanup(func() { _ = os.WriteFile(release, nil, 0600) })
	waitForFile(t, started)
	read := make(chan error, 1)
	go func() { _, err := s.WorkingState(p); read <- err }()
	select {
	case err := <-read:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("hook blocked reads")
	}
	if _, err := s.Stage(p, []string{"file"}); err == nil {
		t.Fatal("parallel writer accepted")
	}
	if _, err := s.RunDiffTool(p, "file", "staged", "", "meld"); err == nil || !strings.Contains(err.Error(), "operation") {
		t.Fatalf("viewer raced writer: %v", err)
	}
	if err := os.WriteFile(release, nil, 0600); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("commit did not finish")
	}
	if _, err := s.Stage(p, []string{"file"}); err != nil {
		t.Fatalf("writer remained busy: %v", err)
	}
}

func TestMergeToolHandlesQuotedAndControlFilenames(t *testing.T) {
	for _, file := range []string{"quote\"name.txt", "back\\slash.txt", "line\nbreak.txt", "tab\tname.txt", "a[1].txt"} {
		t.Run(file, func(t *testing.T) {
			p := repository(t)
			s := NewService()
			commitFile(t, p, file, "base\n", "base")
			git(t, p, "switch", "-c", "topic")
			commitFile(t, p, file, "topic\n", "topic")
			git(t, p, "switch", "main")
			commitFile(t, p, file, "main\n", "main")
			if _, err := s.RefAction(p, RefOptions{Action: "merge", Target: "topic", Mode: "no-ff"}); err == nil {
				t.Fatal("expected conflict")
			}
			trustedTool(t, p, "mergetool.custom.cmd", `cp "$REMOTE" "$MERGED"`)
			if _, err := s.ConfigureMergeTool(p, "custom", "", true); err != nil {
				t.Fatal(err)
			}
			if _, err := s.RunMergeTool(p, file, "custom"); err != nil {
				t.Fatal(err)
			}
			if git(t, p, "show", ":"+file) != "topic" {
				t.Fatal("wrong merge result")
			}
		})
	}
}

func TestMergeToolPreservesBackupAndExternalIndexChanges(t *testing.T) {
	p, s := conflicted(t)
	original, err := os.ReadFile(filepath.Join(p, "shared"))
	if err != nil {
		t.Fatal(err)
	}
	write(t, p, "shared.orig", "existing backup\n")
	trustedTool(t, p, "mergetool.custom.cmd", `touch .git/tool-started; while test ! -f .git/tool-release; do sleep 0.02; done; cp "$REMOTE" "$MERGED"`)
	if _, err := s.ConfigureMergeTool(p, "custom", "", true); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := s.RunMergeTool(p, "shared", "custom"); done <- err }()
	t.Cleanup(s.CancelMergeTool)
	waitForFile(t, filepath.Join(p, ".git", "tool-started"))
	write(t, p, "shared", "resolved in another client\n")
	git(t, p, "add", "shared")
	write(t, p, ".git/tool-release", "")
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "index changed") {
			t.Fatalf("external index change not detected: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("tool did not finish")
	}
	if got := git(t, p, "show", ":shared"); got != "resolved in another client" {
		t.Fatalf("external index was overwritten: %q", got)
	}
	backups, err := filepath.Glob(filepath.Join(p, ".gitextensions-merge-backup-*"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("missing original backup: %v %v", backups, err)
	}
	data, err := os.ReadFile(backups[0])
	if err != nil || string(data) != string(original) {
		t.Fatalf("backup changed: %q %v", data, err)
	}
	data, err = os.ReadFile(filepath.Join(p, "shared.orig"))
	if err != nil || string(data) != "existing backup\n" {
		t.Fatal("existing backup overwritten")
	}
}

func TestVerboseCommitDoesNotReportFailureAfterSuccess(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "before\n", "base")
	write(t, p, "file", "after\n")
	git(t, p, "add", "file")
	hook := "#!/bin/sh\nhead -c 5000000 /dev/zero >&2\n"
	if err := os.WriteFile(filepath.Join(p, ".git", "hooks", "pre-commit"), []byte(hook), 0700); err != nil {
		t.Fatal(err)
	}
	out, err := s.Commit(p, "verbose commit", false)
	if err != nil || !strings.Contains(out, "Command output truncated") {
		t.Fatalf("successful commit reported failure or silent truncation: %v", err)
	}
	if got := git(t, p, "log", "-1", "--format=%s"); got != "verbose commit" {
		t.Fatalf("commit did not complete: %s", got)
	}
}
