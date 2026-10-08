package gitclient

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestReviewTemplate(t *testing.T) {
	prompt := "spaces 'quotes' \"double\"\n$(touch /tmp/never) `id`; {target}"
	args, err := reviewArgv(`codex review "{prompt}" '--literal={target}' "" escaped\ space`, map[string]string{"prompt": prompt, "target": "abc"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"codex", "review", prompt, "--literal=abc", "", "escaped space"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("%q != %q", args, want)
	}
	for _, invalid := range []string{"", `tool "unterminated`, `tool trailing\`, "tool\x00arg"} {
		if _, err := parseReviewTemplate(invalid); err == nil {
			t.Fatalf("accepted %q", invalid)
		}
	}
}
func TestReviewPrompt(t *testing.T) {
	c := &Commit{Hash: strings.Repeat("a", 40), Subject: "Fix a bug", Author: "Reviewer", Date: "2026-10-01"}
	want := "instructions\n\n## Target\nRepository: /repo with spaces\nCommit: " + c.Hash + " — Fix a bug   (Reviewer, 2026-10-01)\nInspect it with: git show --stat --patch " + c.Hash + "\n\n## Task details\nticket"
	if got := composeReviewPrompt("/repo with spaces", "instructions", "ticket", c); got != want {
		t.Fatalf("%q", got)
	}
	want = "instructions\n\n## Target\nRepository: /repo\nUncommitted changes\nInspect it with: git diff HEAD; git status\n\n## Task details\nNone provided"
	if got := composeReviewPrompt("/repo", "instructions", "  ", nil); got != want {
		t.Fatalf("%q", got)
	}
}
func fakeReviewExecutable(t *testing.T, directory, name, body string) string {
	t.Helper()
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, []byte("#!/bin/bash\n"+body), 0700); err != nil {
		t.Fatal(err)
	}
	return path
}
func TestReviewTerminalOrder(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	for _, terminal := range reviewTerminals {
		fakeReviewExecutable(t, dir, terminal[0], "exit 0")
	}
	command := []string{"tool", "a b", "$(literal)"}
	candidates, err := terminalArgv("auto", command)
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != len(reviewTerminals) {
		t.Fatal(candidates)
	}
	for i, candidate := range candidates {
		want := append([]string{filepath.Join(dir, reviewTerminals[i][0])}, reviewTerminals[i][1:]...)
		want = append(want, command...)
		if !reflect.DeepEqual(candidate, want) {
			t.Fatalf("%q != %q", candidate, want)
		}
	}
	if err := os.Remove(filepath.Join(dir, "x-terminal-emulator")); err != nil {
		t.Fatal(err)
	}
	candidates, err = terminalArgv("auto", command)
	if err != nil || filepath.Base(candidates[0][0]) != "gnome-terminal" {
		t.Fatalf("%v %v", candidates, err)
	}
	candidates, err = terminalArgv(`kitty --title "Code review" {command}`, command)
	if err != nil || !reflect.DeepEqual(candidates[0], []string{"kitty", "--title", "Code review", "tool", "a b", "$(literal)"}) {
		t.Fatalf("%v %v", candidates, err)
	}
	for _, template := range []string{`kitty`, `kitty x{command}`, `{command}`, `kitty {command} {command}`} {
		if _, err := terminalArgv(template, command); err == nil {
			t.Fatalf("accepted %s", template)
		}
	}
}
func TestStartReviewWithoutReviewToolOnPath(t *testing.T) {
	root := repository(t)
	gitBinary, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.Symlink(gitBinary, filepath.Join(dir, "git")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	terminal := fakeReviewExecutable(t, dir, "terminal", `printf '%s\0' "$PWD" "$@" > "$REVIEW_CAPTURE"`)
	tests := []struct {
		name, tool, template, executable, wantCommand string
	}{
		{"codex", "codex", "", "", "codex"},
		{"claude", "claude", "", "", "claude"},
		{"qwen", "qwen", "", "", "qwen"},
		{"opencode", "opencode", "", "", "opencode"},
		{"wrapper", "codex", `user-review-wrapper -- "{prompt}"`, "", "user-review-wrapper"},
		{"custom path", "claude", "", filepath.Join(dir, "custom cli"), filepath.Join(dir, "custom cli")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := exec.LookPath(tt.wantCommand); err == nil {
				t.Fatal("test requires a review command absent from the application PATH")
			}
			capture := filepath.Join(t.TempDir(), "capture")
			t.Setenv("REVIEW_CAPTURE", capture)
			out, err := NewService().StartReview(root, ReviewOptions{
				Tool: tt.tool, Template: tt.template, Executable: tt.executable,
				Terminal: `"` + terminal + `" {command}`, Instructions: "Review only",
			})
			if err != nil || out != tt.tool {
				t.Fatalf("%s %v", out, err)
			}
			args := captureArgs(t, capture)
			if args[0] != root || args[1] != tt.wantCommand {
				t.Fatalf("terminal received %q", args)
			}
		})
	}
	if _, err := NewService().StartReview(root, ReviewOptions{
		Tool: "codex", Executable: "codex\x00bad", Terminal: `"` + terminal + `" {command}`,
	}); err == nil {
		t.Fatal("accepted executable containing NUL")
	}
}

func TestStartReviewDetachedArgv(t *testing.T) {
	root := repository(t)
	write(t, root, "file.txt", "before\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "Review subject")
	hash := git(t, root, "rev-parse", "HEAD")
	dir := t.TempDir()
	cache := t.TempDir()
	t.Setenv("XDG_CACHE_HOME", cache)
	capture := filepath.Join(dir, "capture")
	t.Setenv("REVIEW_CAPTURE", capture)
	terminal := fakeReviewExecutable(t, dir, "terminal", `printf '%s\0' "$PWD" "$@" > "$REVIEW_CAPTURE"`)
	binary := fakeReviewExecutable(t, dir, "codex", "exit 0")
	// The fake terminal captures argv without executing a CLI or accessing an account.
	s := NewService()
	nested := filepath.Join(root, "nested")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	out, err := s.StartReview(nested, ReviewOptions{Tool: "codex", Executable: binary, Terminal: `"` + terminal + `" {command}`, Commit: hash, Instructions: "Do not edit $(touch nope)", Details: "Ticket 123"})
	if err != nil || out != "codex" {
		t.Fatalf("%s %v", out, err)
	}
	// Default: interactive chat, argv passed straight to the terminal.
	args := captureArgs(t, capture)
	if len(args) < 4 || args[0] != root || args[1] != binary || args[2] != "--" {
		t.Fatalf("captured %q", args)
	}
	if !strings.Contains(args[3], "git show --stat --patch "+hash) || !strings.Contains(args[3], "Ticket 123") || !strings.Contains(args[3], "$(touch nope)") {
		t.Fatal(args[3])
	}
	// A custom one-shot `codex review` template keeps the terminal open afterwards.
	if err := os.Remove(capture); err != nil {
		t.Fatal(err)
	}
	if _, err := s.StartReview(nested, ReviewOptions{Tool: "codex", Executable: binary, Template: `codex review -- "{prompt}"`, Terminal: `"` + terminal + `" {command}`, Commit: hash, Instructions: "Do not edit $(touch nope)", Details: "Ticket 123"}); err != nil {
		t.Fatal(err)
	}
	args = captureArgs(t, capture)
	if len(args) < 10 || args[1] != "bash" || args[2] != "-c" || args[4] != "_" || args[5] != binary || args[6] != "review" {
		t.Fatalf("captured %q", args)
	}
	if strings.Contains(args[3], "Ticket") {
		t.Fatal("prompt interpolated into script")
	}
	if _, err := os.Stat(filepath.Join(root, "nope")); !os.IsNotExist(err) {
		t.Fatal("shell interpolation")
	}
	if git(t, root, "status", "--porcelain") != "" {
		t.Fatal("review modified repository")
	}
}
func TestReviewLongPromptAndPrivateFile(t *testing.T) {
	root := repository(t)
	dir := t.TempDir()
	t.Setenv("XDG_CACHE_HOME", dir)
	terminal := fakeReviewExecutable(t, dir, "terminal", "exit 0")
	binary := fakeReviewExecutable(t, dir, "qwen", "exit 0")
	opts := ReviewOptions{Tool: "qwen", Executable: binary, Terminal: `"` + terminal + `" {command}`, Instructions: "Review", Details: strings.Repeat("task ", 30000)}
	out, err := NewService().StartReview(root, opts)
	if err != nil || out != "details-truncated" {
		t.Fatalf("%s %v", out, err)
	}
	opts.Template = `qwen --file "{promptFile}"`
	out, err = NewService().StartReview(root, opts)
	if err != nil || out != "qwen" {
		t.Fatalf("%s %v", out, err)
	}
	files, err := filepath.Glob(filepath.Join(dir, "gitextensions-linux", "reviews", "prompt-*.txt"))
	if err != nil || len(files) == 0 {
		t.Fatalf("%v %v", files, err)
	}
	found := false
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			continue
		} // normal argv prompt is reaped asynchronously
		if info.Mode().Perm() != 0600 {
			t.Fatal(info.Mode())
		}
		data, err := os.ReadFile(file)
		if err == nil && strings.Contains(string(data), opts.Details) {
			found = true
		}
	}
	if !found {
		t.Fatal("file template lost full prompt")
	}
	opts.Template = ""
	opts.Details = ""
	opts.Instructions = strings.Repeat("a", reviewArgLimit+1)
	if _, err := NewService().StartReview(root, opts); err == nil {
		t.Fatal("accepted oversized instructions")
	}
}

func captureArgs(t *testing.T, capture string) []string {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(capture); err == nil && len(data) > 0 {
			return strings.Split(string(data), "\x00")
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("terminal was not launched")
	return nil
}
