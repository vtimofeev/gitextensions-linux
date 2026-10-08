package gitclient

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStashIndexUntrackedAndImmutableIdentity(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "file", "base\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "base")
	write(t, p, "file", "staged\n")
	git(t, p, "add", "file")
	write(t, p, "file", "worktree\n")
	write(t, p, "new", "untracked\n")
	if _, err := s.StashAction(p, "create", "", "first stash", true, false, false); err != nil {
		t.Fatal(err)
	}
	entries, err := s.Stashes(p)
	if err != nil || len(entries) != 1 {
		t.Fatalf("stashes: %#v %v", entries, err)
	}
	first := entries[0].Hash
	if _, err = os.Stat(filepath.Join(p, "new")); !os.IsNotExist(err) {
		t.Fatal("untracked not stashed")
	}
	write(t, p, "file", "second\n")
	if _, err := s.StashAction(p, "create", "", "second", false, false, false); err != nil {
		t.Fatal(err)
	}
	// The original stash moved to stash@{1}; hash-based pop must still restore it.
	if _, err := s.StashAction(p, "pop", first, "", false, false, true); err != nil {
		t.Fatal(err)
	}
	if got := git(t, p, "show", ":file"); got != "staged" {
		t.Fatalf("index: %s", got)
	}
	data, _ := os.ReadFile(filepath.Join(p, "file"))
	if string(data) != "worktree\n" {
		t.Fatalf("worktree %s", data)
	}
	data, _ = os.ReadFile(filepath.Join(p, "new"))
	if string(data) != "untracked\n" {
		t.Fatalf("untracked %s", data)
	}
	entries, err = s.Stashes(p)
	if err != nil || len(entries) != 1 || entries[0].Hash == first {
		t.Fatalf("wrong stash popped: %#v %v", entries, err)
	}
	if _, err = s.StashAction(p, "drop", first, "", false, false, false); err == nil {
		t.Fatal("accepted stale stash")
	}
}
func TestStashConflictKeepsEntry(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "file", "base\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "base")
	write(t, p, "file", "stash\n")
	if _, err := s.StashAction(p, "create", "", "conflict", false, false, false); err != nil {
		t.Fatal(err)
	}
	entries, _ := s.Stashes(p)
	write(t, p, "file", "other\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "other")
	if _, err := s.StashAction(p, "pop", entries[0].Hash, "", false, false, false); err == nil {
		t.Fatal("expected conflict")
	}
	remaining, _ := s.Stashes(p)
	if len(remaining) != 1 {
		t.Fatal("conflicting stash removed")
	}
	state, err := s.WorkingState(p)
	if err != nil || len(state.Files) != 1 || !state.Files[0].Conflict {
		t.Fatalf("conflict state %#v %v", state, err)
	}
}
func TestResetModesAndReflogRecovery(t *testing.T) {
	for _, mode := range []string{"soft", "mixed", "hard"} {
		t.Run(mode, func(t *testing.T) {
			p := repository(t)
			s := NewService()
			write(t, p, "file", "base\n")
			git(t, p, "add", ".")
			git(t, p, "commit", "-m", "base")
			base := git(t, p, "rev-parse", "HEAD")
			write(t, p, "file", "tip\n")
			git(t, p, "add", ".")
			git(t, p, "commit", "-m", "tip")
			tip := git(t, p, "rev-parse", "HEAD")
			write(t, p, "file", "index\n")
			git(t, p, "add", ".")
			write(t, p, "file", "work\n")
			if _, err := s.Reset(p, base, mode); err != nil {
				t.Fatal(err)
			}
			if git(t, p, "rev-parse", "HEAD") != base {
				t.Fatal("HEAD unchanged")
			}
			wantIndex, wantWork := "index", "work\n"
			if mode != "soft" {
				wantIndex = "base"
			}
			if mode == "hard" {
				wantWork = "base\n"
			}
			if git(t, p, "show", ":file") != wantIndex {
				t.Fatal("wrong index")
			}
			data, _ := os.ReadFile(filepath.Join(p, "file"))
			if string(data) != wantWork {
				t.Fatal("wrong worktree")
			}
			entries, err := s.Reflog(p)
			if err != nil || len(entries) < 3 || entries[0].Hash != base || entries[1].Hash != tip {
				t.Fatalf("reflog %#v %v", entries, err)
			}
			if _, err := s.Reset(p, entries[1].Hash, "hard"); err != nil {
				t.Fatal(err)
			}
			if git(t, p, "rev-parse", "HEAD") != tip {
				t.Fatal("recovery failed")
			}
			if _, err = s.Reset(p, base, "invalid"); err == nil {
				t.Fatal("invalid mode")
			}
		})
	}
}
func TestFileInspectionRenameBlameFullMetadataAndAuthorFilter(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "old.txt", "one\ntwo\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "Первый коммит\n\nFull body\nwith details")
	first := git(t, p, "rev-parse", "HEAD")
	git(t, p, "mv", "old.txt", "new.txt")
	git(t, p, "commit", "-m", "rename")
	rename := git(t, p, "rev-parse", "HEAD")
	write(t, p, "new.txt", "one\nchanged\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "--author", "Second Author <second@example.test>", "-m", "changed")
	tip := git(t, p, "rev-parse", "HEAD")
	history, err := s.FileHistory(p, "new.txt", tip)
	if err != nil || len(history) != 3 || history[0].File != "new.txt" || history[1].Commit.Hash != rename || history[2].File != "old.txt" {
		t.Fatalf("rename history %#v %v", history, err)
	}
	blame, err := s.Blame(p, "new.txt", tip)
	if err != nil || len(blame) != 2 || blame[0].Hash != first || blame[1].Hash != tip || blame[1].Author != "Second Author" || blame[1].Text != "changed" || blame[1].Line != 2 {
		t.Fatalf("blame %#v %v", blame, err)
	}
	full, err := s.FileContent(p, "old.txt", "commit", first)
	if err != nil || full.Text != "one\ntwo\n" {
		t.Fatalf("full %#v %v", full, err)
	}
	write(t, p, "new.txt", "index\n")
	git(t, p, "add", ".")
	write(t, p, "new.txt", "worktree\n")
	indexed, err := s.FileContent(p, "new.txt", "staged", "")
	if err != nil || indexed.Text != "index\n" {
		t.Fatal("index preview")
	}
	working, err := s.FileContent(p, "new.txt", "unstaged", "")
	if err != nil || working.Text != "worktree\n" {
		t.Fatal("worktree preview")
	}
	details, err := s.CommitDetails(p, first)
	if err != nil || details.AuthorEmail != "mvp@example.test" || details.Committer != "MVP Test" || !strings.Contains(details.Message, "Full body\nwith details") || details.Subject != "Первый коммит" {
		t.Fatalf("details %#v %v", details, err)
	}
	filtered, err := s.HistorySnapshot(p, 1, "SECOND@EXAMPLE.TEST")
	if err != nil || len(filtered.Commits) != 1 || filtered.Commits[0].Hash != tip {
		t.Fatalf("author filter %#v %v", filtered.Commits, err)
	}
	filtered, err = s.HistorySnapshot(p, 1, "mvp@example.test")
	if err != nil || len(filtered.Commits) != 1 || filtered.Commits[0].Hash != rename {
		t.Fatalf("author outside history window %#v %v", filtered.Commits, err)
	}
	write(t, p, "binary", string([]byte{0, 1, 2}))
	binary, err := s.FileContent(p, "binary", "untracked", "")
	if err != nil || !binary.Binary {
		t.Fatal("binary preview")
	}
	if err = os.Symlink("/etc/passwd", filepath.Join(p, "link")); err != nil {
		t.Fatal(err)
	}
	link, err := s.FileContent(p, "link", "untracked", "")
	if err != nil || link.Text != "/etc/passwd" {
		t.Fatal("symlink preview followed target")
	}
	if _, err = s.FileContent(p, "../outside", "unstaged", ""); err == nil {
		t.Fatal("path escape accepted")
	}
}

func TestStashKeepIndexAndDrop(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "file", "base\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "base")
	write(t, p, "file", "staged\n")
	git(t, p, "add", ".")
	write(t, p, "file", "unstaged\n")
	if _, err := s.StashAction(p, "create", "", "keep index", false, true, false); err != nil {
		t.Fatal(err)
	}
	if git(t, p, "show", ":file") != "staged" {
		t.Fatal("index changed")
	}
	data, _ := os.ReadFile(filepath.Join(p, "file"))
	if string(data) != "staged\n" {
		t.Fatal("staged changes did not remain")
	}
	entries, _ := s.Stashes(p)
	if len(entries) != 1 {
		t.Fatal("missing stash")
	}
	if _, err := s.StashAction(p, "drop", entries[0].Hash, "", false, false, false); err != nil {
		t.Fatal(err)
	}
	entries, _ = s.Stashes(p)
	if len(entries) != 0 {
		t.Fatal("stash not dropped")
	}
}

func TestFileDiffRootChangeRenameFullContextAndBinary(t *testing.T) {
	p := repository(t)
	s := NewService()
	git(t, p, "config", "color.ui", "always")
	content := "start\n" + strings.Repeat("unchanged\n", 20) + "old\nend\n"
	write(t, p, "old[1].txt", content)
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "root")
	root := git(t, p, "rev-parse", "HEAD")
	diff, err := s.FileDiff(p, "old[1].txt", root, false)
	if err != nil || !strings.Contains(diff, "@@ -0,0 +1,23 @@") || !strings.Contains(diff, "+start") {
		t.Fatalf("root diff: %s %v", diff, err)
	}
	write(t, p, "old[1].txt", strings.Replace(content, "old\n", "new\n", 1))
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "edit")
	edit := git(t, p, "rev-parse", "HEAD")
	diff, err = s.FileDiff(p, "old[1].txt", "HEAD", false)
	if err != nil || !strings.Contains(diff, "-old\n+new") || strings.Contains(diff, " start") {
		t.Fatalf("change diff: %s %v", diff, err)
	}
	full, err := s.FileDiff(p, "old[1].txt", "HEAD", true)
	if err != nil || !strings.Contains(full, " start") || strings.Count(full, " unchanged\n") != 20 || !strings.Contains(full, " end") {
		t.Fatalf("full diff: %s %v", full, err)
	}
	git(t, p, "mv", "old[1].txt", "new.txt")
	write(t, p, "new.txt", strings.Replace(content, "old\n", "renamed\n", 1))
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "rename and edit")
	diff, err = s.FileDiff(p, "new.txt", "HEAD", false)
	if err != nil || !strings.Contains(diff, "rename from old[1].txt") || !strings.Contains(diff, "-new\n+renamed") {
		t.Fatalf("rename diff: %s %v", diff, err)
	}
	merge := git(t, p, "commit-tree", git(t, p, "rev-parse", "HEAD^{tree}"), "-p", edit, "-p", root, "-m", "merge rename")
	mergeDiff, mergeErr := s.FileDiff(p, "new.txt", merge, false)
	if mergeErr != nil || !strings.Contains(mergeDiff, "rename from old[1].txt") || !strings.Contains(mergeDiff, "-new\n+renamed") {
		t.Fatalf("merge first-parent diff: %s %v", mergeDiff, mergeErr)
	}

	history, err := s.FileHistory(p, "new.txt", "HEAD")
	if err != nil || history[0].OriginalPath != "old[1].txt" || history[1].File != "old[1].txt" {
		t.Fatalf("rename history: %#v %v", history, err)
	}
	git(t, p, "mv", "new.txt", "pure.txt")
	git(t, p, "commit", "-m", "pure rename")
	full, err = s.FileDiff(p, "pure.txt", "HEAD", true)
	if err != nil || !strings.Contains(full, " start") || !strings.Contains(full, " renamed") {
		t.Fatalf("pure rename full: %s %v", full, err)
	}
	write(t, p, "text", "Binary files are documented here\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "text containing binary summary words")
	diff, err = s.FileDiff(p, "text", "HEAD", false)
	if err != nil || !strings.Contains(diff, "+Binary files are documented here") || strings.Contains(diff, "\x1b") {
		t.Fatalf("text mistaken for binary or colored: %q %v", diff, err)
	}

	write(t, p, "binary", "\x00\x01\x02")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "binary")
	for _, fullContext := range []bool{false, true} {
		diff, err = s.FileDiff(p, "binary", "HEAD", fullContext)
		if err != nil || diff != "Binary file" {
			t.Fatalf("binary: %q %v", diff, err)
		}
	}
	if _, err = s.FileDiff(p, "../outside", "HEAD", false); err == nil {
		t.Fatal("accepted path escape")
	}
}
