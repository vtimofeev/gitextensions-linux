package gitclient

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiscardChanges(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "tracked", "base\n", "base")
	write(t, p, "tracked", "staged\n")
	git(t, p, "add", "tracked")
	write(t, p, "tracked", "working\n")
	out, err := s.Discard(p, []string{"tracked"}, false)
	requireOK(t, out, err)
	if git(t, p, "status", "--porcelain") != "" {
		t.Fatal("discard must clear staged and working changes")
	}
	data, _ := os.ReadFile(filepath.Join(p, "tracked"))
	if string(data) != "base\n" {
		t.Fatal("discard did not restore HEAD")
	}
	write(t, p, "new", "new")
	out, err = s.Discard(p, []string{"new"}, false)
	requireOK(t, out, err)
	if _, err = os.Stat(filepath.Join(p, "new")); !os.IsNotExist(err) {
		t.Fatal("untracked file not removed")
	}
	write(t, p, "added", "new")
	git(t, p, "add", "added")
	out, err = s.Discard(p, []string{"added"}, false)
	requireOK(t, out, err)
	if _, err = os.Stat(filepath.Join(p, "added")); !os.IsNotExist(err) {
		t.Fatal("staged addition not removed")
	}
	git(t, p, "mv", "tracked", "renamed")
	out, err = s.Discard(p, []string{"renamed"}, false)
	requireOK(t, out, err)
	if git(t, p, "status", "--porcelain") != "" {
		t.Fatal("renamed paths not restored")
	}
	git(t, p, "rm", "tracked")
	out, err = s.Discard(p, []string{"tracked"}, false)
	requireOK(t, out, err)
	if _, err = os.Stat(filepath.Join(p, "tracked")); err != nil {
		t.Fatal("deleted file not restored")
	}
	if _, err = s.Discard(p, []string{"../outside"}, false); err == nil {
		t.Fatal("invalid path accepted")
	}
	if _, err = s.Discard(p, []string{"tracked"}, false); err == nil {
		t.Fatal("unchanged file accepted")
	}
}
func TestDiscardUnbornAndSymlink(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "new", "new")
	git(t, p, "add", "new")
	out, err := s.Discard(p, []string{"new"}, false)
	requireOK(t, out, err)
	outside := t.TempDir()
	write(t, outside, "secret", "keep")
	if err := os.Symlink(filepath.Join(outside, "secret"), filepath.Join(p, "link")); err != nil {
		t.Fatal(err)
	}
	out, err = s.Discard(p, []string{"link"}, false)
	requireOK(t, out, err)
	data, err := os.ReadFile(filepath.Join(outside, "secret"))
	if err != nil || string(data) != "keep" {
		t.Fatal("symlink target was modified")
	}
}

func TestDiscardWorktreeSelectionKeepsIndex(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "tracked", "base\n", "base")
	commitFile(t, p, "second", "base\n", "second")
	write(t, p, "tracked", "staged\n")
	git(t, p, "add", "tracked")
	write(t, p, "tracked", "working\n")
	write(t, p, "second", "working\n")
	write(t, p, "new", "new\n")
	index := git(t, p, "diff", "--cached")
	out, err := s.Discard(p, []string{"tracked", "second", "new"}, true)
	requireOK(t, out, err)
	for _, name := range []string{"tracked", "second", "new"} {
		if !strings.Contains(out, name) {
			t.Fatalf("missing reverted path: %s", out)
		}
	}
	if git(t, p, "diff", "--cached") != index {
		t.Fatal("worktree revert changed index")
	}
	if git(t, p, "diff") != "" {
		t.Fatal("working changes remain")
	}
	data, err := os.ReadFile(filepath.Join(p, "tracked"))
	if err != nil || string(data) != "staged\n" {
		t.Fatal("staged content was not restored")
	}
	if _, err := os.Stat(filepath.Join(p, "new")); !os.IsNotExist(err) {
		t.Fatal("untracked file remains")
	}
}

func TestDiscardWorktreeIndexedRename(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "old", "base\n", "base")
	git(t, p, "mv", "old", "new")
	write(t, p, "new", "edit\n")
	out, err := s.Discard(p, []string{"new"}, true)
	requireOK(t, out, err)
	if git(t, p, "diff") != "" {
		t.Fatal("working edit remains")
	}
	if !strings.Contains(git(t, p, "status", "--porcelain"), "R  old -> new") {
		t.Fatal("staged rename was lost")
	}
}

func TestDiscardFullSelectionAndValidation(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "first", "base\n", "first")
	commitFile(t, p, "second", "base\n", "second")
	write(t, p, "first", "changed\n")
	write(t, p, "second", "changed\n")
	git(t, p, "add", "first", "second")
	if _, err := s.Discard(p, []string{"first", "missing"}, false); err == nil {
		t.Fatal("missing path accepted")
	}
	if git(t, p, "diff", "--cached") == "" {
		t.Fatal("selection validation mutated index")
	}
	if _, err := s.Discard(p, []string{"first", "../outside"}, true); err == nil {
		t.Fatal("outside path accepted")
	}
	out, err := s.Discard(p, []string{"first", "second"}, false)
	requireOK(t, out, err)
	if git(t, p, "status", "--porcelain") != "" {
		t.Fatal("full revert left changes")
	}
}

func TestDiscardRefusesConflicts(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "conflicted", "base\n", "base")
	// Build real unmerged index entries without switching the test repository.
	base := git(t, p, "rev-parse", "HEAD:conflicted")
	cmd := exec.Command("git", "update-index", "--index-info")
	cmd.Dir = p
	cmd.Stdin = strings.NewReader("0 " + strings.Repeat("0", 40) + "\tconflicted\n" +
		"100644 " + base + " 1\tconflicted\n" + "100644 " + base + " 2\tconflicted\n" + "100644 " + base + " 3\tconflicted\n")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("unmerged fixture: %s: %v", out, err)
	}
	write(t, p, "new", "keep\n")
	for _, only := range []bool{true, false} {
		if _, err := s.Discard(p, []string{"new", "conflicted"}, only); err == nil {
			t.Fatal("conflict accepted")
		}
		if _, err := os.Stat(filepath.Join(p, "new")); err != nil {
			t.Fatal("changed file before rejecting conflict")
		}
	}
}
