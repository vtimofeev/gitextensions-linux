package gitclient

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func git(t *testing.T, path string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = path
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %s: %v", args, out, err)
	}
	return strings.TrimSpace(string(out))
}
func repository(t *testing.T) string {
	t.Helper()
	p := t.TempDir()
	git(t, p, "init", "-b", "main")
	git(t, p, "config", "user.name", "MVP Test")
	git(t, p, "config", "user.email", "mvp@example.test")
	git(t, p, "config", "commit.gpgsign", "false")
	return p
}
func write(t *testing.T, root, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}
func requireOK(t *testing.T, _ string, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func TestLocalWorkflow(t *testing.T) {
	p := repository(t)
	s := NewService()
	snap, err := s.Snapshot(p, 150)
	if err != nil || len(snap.Commits) != 0 || snap.Branch != "main" {
		t.Fatalf("empty repository: %+v %v", snap, err)
	}
	name := "odd [file]\nname.txt"
	write(t, p, name, "first\n")
	out, err := s.Stage(p, []string{name})
	requireOK(t, out, err)
	snap, err = s.Snapshot(p, 150)
	if err != nil || snap.Files[0].Index != "A" {
		t.Fatalf("stage: %+v %v", snap, err)
	}
	out, err = s.Unstage(p, []string{name})
	requireOK(t, out, err)
	if _, err = os.Stat(filepath.Join(p, name)); err != nil {
		t.Fatal("unstage removed working file")
	}
	out, err = s.Stage(p, []string{name})
	requireOK(t, out, err)
	out, err = s.Commit(p, "Initial commit\n\nBody", false)
	requireOK(t, out, err)
	write(t, p, name, "second\n")
	out, err = s.Diff(p, name, "unstaged", "")
	if err != nil || !strings.Contains(out, "+second") {
		t.Fatalf("diff: %s %v", out, err)
	}
	out, err = s.Stage(p, []string{name})
	requireOK(t, out, err)
	write(t, p, name, "third\n")
	out, err = s.Commit(p, "Staged only", false)
	requireOK(t, out, err)
	if got := git(t, p, "show", "HEAD:"+name); got != "second" {
		t.Fatalf("committed unstaged content: %s", got)
	}
	snap, err = s.Snapshot(p, 150)
	if err != nil || len(snap.Commits) != 2 || snap.Files[0].Worktree != "M" {
		t.Fatalf("commit: %+v %v", snap, err)
	}
	files, err := s.CommitFiles(p, snap.Commits[0].Hash)
	if err != nil || len(files) != 1 || files[0] != name {
		t.Fatalf("commit files: %v %v", files, err)
	}
	out, err = s.Diff(p, name, "commit", snap.Commits[0].Hash)
	if err != nil || !strings.Contains(out, "+second") {
		t.Fatalf("commit diff: %s %v", out, err)
	}
	out, err = s.Unstage(p, []string{name})
	requireOK(t, out, err)
	out, err = s.Commit(p, "Amended subject", true)
	requireOK(t, out, err)
	if got := git(t, p, "log", "-1", "--format=%s"); got != "Amended subject" {
		t.Fatal(got)
	}
}
func TestBranchesAndDirtyCheckout(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "a", "base")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "base")
	out, err := s.CreateBranch(p, "feature", "", true)
	requireOK(t, out, err)
	write(t, p, "a", "feature")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "feature")
	out, err = s.Checkout(p, "main")
	requireOK(t, out, err)
	write(t, p, "a", "dirty")
	if _, err = s.Checkout(p, "feature"); err == nil {
		t.Fatal("dirty checkout should fail")
	}
	if data, _ := os.ReadFile(filepath.Join(p, "a")); string(data) != "dirty" {
		t.Fatal("checkout lost local changes")
	}
	if _, err = s.DeleteBranch(p, "feature", false); err == nil {
		t.Fatal("unmerged delete should fail")
	}
	out, err = s.DeleteBranch(p, "feature", true)
	requireOK(t, out, err)
	for _, name := range []string{"-D", "@{-1}", "bad name"} {
		if _, err = s.CreateBranch(p, name, "", false); err == nil {
			t.Fatalf("accepted %s", name)
		}
	}
	if _, err = s.Stage(p, []string{"../outside"}); err == nil {
		t.Fatal("accepted traversal")
	}
}
func TestRemotes(t *testing.T) {
	remote := t.TempDir()
	git(t, remote, "init", "--bare", "-b", "main")
	p := repository(t)
	s := NewService()
	git(t, p, "remote", "add", "origin", remote)
	write(t, p, "a", "one")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "one")
	out, err := s.Push(p, PushOptions{Remote: "origin", Branch: "main", SetUpstream: true})
	requireOK(t, out, err)
	if got := git(t, p, "rev-parse", "--abbrev-ref", "@{upstream}"); got != "origin/main" {
		t.Fatal(got)
	}
	git(t, p, "tag", "v1")
	out, err = s.Push(p, PushOptions{Remote: "origin", Tags: true, DryRun: true})
	requireOK(t, out, err)
	if got := git(t, remote, "tag"); got != "" {
		t.Fatal("dry run changed remote")
	}
	out, err = s.Push(p, PushOptions{Remote: "origin", Tags: true})
	requireOK(t, out, err)
	if got := git(t, remote, "tag"); got != "v1" {
		t.Fatal(got)
	}
	other := repository(t)
	git(t, other, "remote", "add", "origin", remote)
	git(t, other, "fetch", "origin")
	git(t, other, "reset", "--hard", "origin/main")
	write(t, other, "a", "two")
	git(t, other, "add", "a")
	git(t, other, "commit", "-m", "two")
	git(t, other, "push", "origin", "main")
	out, err = s.FetchAll(p, true)
	requireOK(t, out, err)
	out, err = s.Pull(p, "origin", "main", "ff-only")
	requireOK(t, out, err)
	if got := git(t, p, "show", "HEAD:a"); got != "two" {
		t.Fatal(got)
	}
	// A stale tracking ref must reject a lease and preserve the remote tip.
	write(t, other, "a", "three")
	git(t, other, "add", "a")
	git(t, other, "commit", "-m", "three")
	git(t, other, "push", "origin", "main")
	remoteTip := git(t, remote, "rev-parse", "main")
	if _, err = s.Push(p, PushOptions{Remote: "origin", Branch: "main", ForceWithLease: true}); err == nil {
		t.Fatal("stale lease should fail")
	}
	if git(t, remote, "rev-parse", "main") != remoteTip {
		t.Fatal("lease overwrote remote")
	}
	out, err = s.FetchAll(p, false)
	requireOK(t, out, err)
	out, err = s.Push(p, PushOptions{Remote: "origin", Branch: "main", ForceWithLease: true})
	requireOK(t, out, err)
	if got := git(t, remote, "rev-parse", "main"); got != git(t, p, "rev-parse", "HEAD") {
		t.Fatal("lease push did not update remote")
	}
	for _, mode := range []string{"rebase", "merge"} {
		out, err = s.Pull(p, "origin", "main", mode)
		requireOK(t, out, err)
	}
	if _, err = s.Push(p, PushOptions{Remote: "--all"}); err == nil {
		t.Fatal("accepted remote option injection")
	}
}
func TestRenameAndDeletion(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "old", "content")
	git(t, p, "add", "old")
	git(t, p, "commit", "-m", "base")
	git(t, p, "mv", "old", "new")
	snap, err := s.Snapshot(p, 20)
	if err != nil || len(snap.Files) != 1 || snap.Files[0].Path != "new" || snap.Files[0].OriginalPath != "old" {
		t.Fatalf("rename: %+v %v", snap, err)
	}
	out, err := s.Unstage(p, []string{"old", "new"})
	requireOK(t, out, err)
	out, err = s.Stage(p, []string{"old", "new"})
	requireOK(t, out, err)
	out, err = s.Commit(p, "rename", false)
	requireOK(t, out, err)
	if err = os.Remove(filepath.Join(p, "new")); err != nil {
		t.Fatal(err)
	}
	out, err = s.Stage(p, []string{"new"})
	requireOK(t, out, err)
	out, err = s.Commit(p, "delete", false)
	requireOK(t, out, err)
}
func TestHookFailureAndWorktree(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "a", "base")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "base")
	hook := filepath.Join(p, ".git", "hooks", "pre-commit")
	if err := os.WriteFile(hook, []byte("#!/bin/sh\necho rejected-by-hook >&2\nexit 1\n"), 0755); err != nil {
		t.Fatal(err)
	}
	write(t, p, "a", "staged")
	git(t, p, "add", "a")
	if _, err := s.Commit(p, "rejected", false); err == nil || !strings.Contains(err.Error(), "rejected-by-hook") {
		t.Fatal(err)
	}
	if got := git(t, p, "diff", "--cached", "--name-only"); got != "a" {
		t.Fatal("hook failure lost index")
	}
	wt := filepath.Join(t.TempDir(), "linked")
	git(t, p, "worktree", "add", "-b", "linked", wt)
	snap, err := s.Snapshot(wt, 10)
	if err != nil || snap.Branch != "linked" || snap.Path != wt {
		t.Fatalf("worktree: %+v %v", snap, err)
	}
}
func TestMergeStateAndPreview(t *testing.T) {
	p := repository(t)
	s := NewService()
	write(t, p, "a", "base")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "base")
	git(t, p, "switch", "-c", "feature")
	write(t, p, "a", "feature")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "feature")
	git(t, p, "switch", "main")
	write(t, p, "a", "main")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "main")
	cmd := exec.Command("git", "merge", "feature")
	cmd.Dir = p
	if cmd.Run() == nil {
		t.Fatal("expected conflict")
	}
	snap, err := s.Snapshot(p, 20)
	if err != nil || snap.Operation != "merge" || !snap.Files[0].Conflict {
		t.Fatalf("merge state: %+v %v", snap, err)
	}
	outside := filepath.Join(t.TempDir(), "secret")
	write(t, filepath.Dir(outside), "secret", "secret")
	if err = os.Symlink(outside, filepath.Join(p, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Diff(p, "link", "untracked", ""); err == nil {
		t.Fatal("preview escaped repository")
	}
	write(t, p, "binary", "a\x00b")
	out, err := s.Diff(p, "binary", "untracked", "")
	if err != nil || out != "Binary file" {
		t.Fatalf("binary: %s %v", out, err)
	}
}

func TestDivergentPullStrategies(t *testing.T) {
	for _, mode := range []string{"rebase", "merge"} {
		t.Run(mode, func(t *testing.T) {
			remote := t.TempDir()
			git(t, remote, "init", "--bare", "-b", "main")
			p := repository(t)
			git(t, p, "remote", "add", "origin", remote)
			write(t, p, "base", "base")
			git(t, p, "add", "base")
			git(t, p, "commit", "-m", "base")
			git(t, p, "push", "-u", "origin", "main")
			other := repository(t)
			git(t, other, "remote", "add", "origin", remote)
			git(t, other, "fetch", "origin")
			git(t, other, "reset", "--hard", "origin/main")
			write(t, other, "remote", "remote")
			git(t, other, "add", "remote")
			git(t, other, "commit", "-m", "remote change")
			git(t, other, "push", "origin", "main")
			write(t, p, "local", "local")
			git(t, p, "add", "local")
			git(t, p, "commit", "-m", "local change")
			git(t, p, "config", "pull.ff", "only")
			s := NewService()
			if _, err := s.Pull(p, "origin", "main", "ff-only"); err == nil {
				t.Fatal("ff-only accepted divergence")
			}
			out, err := s.Pull(p, "origin", "main", mode)
			requireOK(t, out, err)
			if git(t, p, "show", "HEAD:remote") != "remote" || git(t, p, "show", "HEAD:local") != "local" {
				t.Fatal("pull lost commits")
			}
			parents := strings.Fields(git(t, p, "log", "-1", "--format=%P"))
			want := 1
			if mode == "merge" {
				want = 2
			}
			if len(parents) != want {
				t.Fatalf("%s: parents %v", mode, parents)
			}
		})
	}
}
func TestDetachedHistoryAndFetchAllRemotes(t *testing.T) {
	p := repository(t)
	write(t, p, "a", "base")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "base")
	git(t, p, "switch", "--detach")
	write(t, p, "a", "detached")
	git(t, p, "add", "a")
	git(t, p, "commit", "-m", "detached only")
	s := NewService()
	snap, err := s.Snapshot(p, 20)
	if err != nil || !snap.Detached || snap.Commits[0].Subject != "detached only" {
		t.Fatalf("detached history: %+v %v", snap, err)
	}
	for _, name := range []string{"origin", "backup"} {
		remote := t.TempDir()
		git(t, remote, "init", "--bare", "-b", "main")
		git(t, p, "remote", "add", name, remote)
		git(t, p, "push", name, "HEAD:refs/heads/main")
	}
	out, err := s.FetchAll(p, true)
	requireOK(t, out, err)
	for _, name := range []string{"origin", "backup"} {
		if git(t, p, "rev-parse", name+"/main") != git(t, p, "rev-parse", "HEAD") {
			t.Fatal("did not fetch", name)
		}
	}
}

func TestBranchDatesAndNewestFirstOutsideHistoryWindow(t *testing.T) {
	p := repository(t)
	s := NewService()
	t.Setenv("GIT_AUTHOR_DATE", "2020-01-01T12:00:00+00:00")
	t.Setenv("GIT_COMMITTER_DATE", "2020-01-01T12:00:00+00:00")
	write(t, p, "file", "old\n")
	git(t, p, "add", "file")
	git(t, p, "commit", "-m", "old")
	old := git(t, p, "rev-parse", "HEAD")
	git(t, p, "branch", "a-old", old)
	git(t, p, "update-ref", "refs/remotes/origin/a-old", old)
	t.Setenv("GIT_AUTHOR_DATE", "2021-01-01T12:00:00+00:00")
	t.Setenv("GIT_COMMITTER_DATE", "2025-01-01T12:00:00+00:00")
	write(t, p, "file", "new\n")
	git(t, p, "add", "file")
	git(t, p, "commit", "-m", "new")
	latest := git(t, p, "rev-parse", "HEAD")
	git(t, p, "branch", "z-new", latest)
	git(t, p, "update-ref", "refs/remotes/origin/z-new", latest)
	snapshot, err := s.Snapshot(p, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Commits) != 1 {
		t.Fatal("expected limited history")
	}
	for _, remote := range []bool{false, true} {
		names := []string{}
		for _, branch := range snapshot.Branches {
			if branch.Remote != remote {
				continue
			}
			names = append(names, branch.Name)
			expected := "2025-01-01T12:00:00+00:00"
			if branch.Hash == old {
				expected = "2020-01-01T12:00:00+00:00"
			}
			if branch.Date != expected {
				t.Fatalf("branch %s: date %q", branch.Name, branch.Date)
			}
		}
		expected := "main,z-new,a-old"
		if remote {
			expected = "origin/z-new,origin/a-old"
		}
		if strings.Join(names, ",") != expected {
			t.Fatalf("branches: %v", names)
		}
	}
}
