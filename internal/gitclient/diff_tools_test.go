package gitclient

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExternalDiffSnapshots(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "shared.txt", "base\n", "base")
	base := strings.TrimSpace(git(t, p, "rev-parse", "HEAD"))
	info, err := s.CommitInfo(p, base)
	if err != nil || info.Hash != base || info.Subject != "base" {
		t.Fatalf("commit info: %+v %v", info, err)
	}
	write(t, p, "shared.txt", "index\n")
	git(t, p, "add", "shared.txt")
	write(t, p, "shared.txt", "worktree\n")
	capture := filepath.Join(t.TempDir(), "captured")
	command := `cat "$LOCAL" > '` + capture + `.before'; cat "$REMOTE" > '` + capture + `.after'; printf edited > "$REMOTE"`
	trustedTool(t, p, "mergetool.capture.cmd", command)
	for _, c := range []struct{ area, rev, left, right string }{
		{"staged", "", "base\n", "index\n"},
		{"unstaged", "", "index\n", "worktree\n"},
		{"commit", base, "", "base\n"},
	} {
		t.Run(c.area, func(t *testing.T) {
			out, err := s.RunDiffTool(p, "shared.txt", c.area, c.rev, "capture")
			requireOK(t, out, err)
			for _, f := range []struct{ suffix, expected string }{{".before", c.left}, {".after", c.right}} {
				actual, err := os.ReadFile(capture + f.suffix)
				if err != nil || string(actual) != f.expected {
					t.Fatalf("%s: %q, %v", f.suffix, actual, err)
				}
			}
			actual, _ := os.ReadFile(filepath.Join(p, "shared.txt"))
			if string(actual) != "worktree\n" {
				t.Fatal("viewer edited working file")
			}
			if strings.TrimSpace(git(t, p, "show", ":shared.txt")) != "index" {
				t.Fatal("viewer edited index")
			}
		})
	}
	write(t, p, "new.txt", "new\n")
	out, err := s.RunDiffTool(p, "new.txt", "untracked", "", "capture")
	requireOK(t, out, err)
	left, _ := os.ReadFile(capture + ".before")
	right, _ := os.ReadFile(capture + ".after")
	if len(left) != 0 || string(right) != "new\n" {
		t.Fatal("incorrect untracked snapshots")
	}
	state, err := s.WorkingState(p)
	if err != nil || len(state.Files) != 2 || state.Operation != "" {
		t.Fatalf("working state: %+v %v", state, err)
	}
}

func TestExternalDiffRenameAndDeletion(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "old.txt", "original\nline2\nline3\nline4\n", "base")
	git(t, p, "mv", "old.txt", "new.txt")
	write(t, p, "new.txt", "original\nline2\nline3\nchanged\n")
	git(t, p, "add", "new.txt")
	capture := filepath.Join(t.TempDir(), "before")
	trustedTool(t, p, "mergetool.capture.cmd", `cat "$LOCAL" > '`+capture+`'`)
	out, err := s.RunDiffTool(p, "new.txt", "staged", "", "capture")
	requireOK(t, out, err)
	content, _ := os.ReadFile(capture)
	if string(content) != "original\nline2\nline3\nline4\n" {
		t.Fatalf("rename preimage: %q", content)
	}
	git(t, p, "commit", "-m", "rename")
	rev := strings.TrimSpace(git(t, p, "rev-parse", "HEAD"))
	out, err = s.RunDiffTool(p, "new.txt", "commit", rev, "capture")
	requireOK(t, out, err)
	// The committed rename must still compare against its old path.
	content, _ = os.ReadFile(capture)
	if string(content) != "original\nline2\nline3\nline4\n" {
		t.Fatal("commit rename preimage missing")
	}
	git(t, p, "rm", "new.txt")
	out, err = s.RunDiffTool(p, "new.txt", "staged", "", "capture")
	requireOK(t, out, err)
	content, _ = os.ReadFile(capture)
	if string(content) != "original\nline2\nline3\nchanged\n" {
		t.Fatal("deleted preimage missing")
	}
}

func TestExternalDiffRejectsInvalidRequests(t *testing.T) {
	p, s := conflicted(t)
	trustedTool(t, p, "mergetool.capture.cmd", "true")
	for _, c := range []struct{ file, area, rev, tool string }{{"shared", "unstaged", "", "capture"}, {"../outside", "untracked", "", "capture"}, {"shared", "unknown", "", "capture"}, {"shared", "commit", "invalid", "capture"}, {"shared", "commit", "HEAD", "absent"}} {
		if _, err := s.RunDiffTool(p, c.file, c.area, c.rev, c.tool); err == nil {
			t.Fatalf("accepted invalid request: %+v", c)
		}
	}
}

func TestExternalDiffToolFailure(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "file", "old\n", "base")
	write(t, p, "file", "new\n")
	trustedTool(t, p, "mergetool.failure.cmd", "exit 1")
	if _, err := s.RunDiffTool(p, "file", "unstaged", "", "failure"); err == nil {
		t.Fatal("failed viewer reported success")
	}
}
