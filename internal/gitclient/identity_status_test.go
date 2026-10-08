package gitclient

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIdentityScopesAndValidation(t *testing.T) {
	p := repository(t)
	global := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(global, []byte("[user]\n name = Global User\n email = global@example.test\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", global)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	git(t, p, "config", "--unset", "user.name")
	git(t, p, "config", "--unset", "user.email")
	s := NewService()
	identity, err := s.Identity(p)
	if err != nil || identity.Scope != "global" || identity.Email != "global@example.test" || identity.LocalEmail {
		t.Fatalf("global: %+v %v", identity, err)
	}
	out, err := s.SetIdentity(p, "Local User", "local@example.test")
	requireOK(t, out, err)
	identity, err = s.Identity(p)
	if err != nil || identity.Scope != "local" || identity.Name != "Local User" || !identity.LocalEmail {
		t.Fatalf("local: %+v %v", identity, err)
	}
	for _, fields := range [][2]string{{"", "a@b"}, {"A", ""}, {"A", "invalid"}, {"A\nB", "a@b"}, {"A", "a@b\r"}} {
		if _, err := s.SetIdentity(p, fields[0], fields[1]); err == nil {
			t.Fatalf("accepted %q", fields)
		}
	}
	git(t, p, "config", "user.name", "")
	git(t, p, "config", "user.email", "")
	identity, err = s.Identity(p)
	if err != nil || identity.Scope != "local" || identity.LocalName || identity.LocalEmail {
		t.Fatalf("empty local fields: %+v %v", identity, err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	git(t, p, "config", "--unset", "user.name")
	git(t, p, "config", "--unset", "user.email")
	identity, err = s.Identity(p)
	if err != nil || identity.Scope != "none" {
		t.Fatalf("none: %+v %v", identity, err)
	}
}

func TestBranchStatusAndDirtyCount(t *testing.T) {
	p := repository(t)
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	write(t, p, "base", "base")
	git(t, p, "add", "base")
	git(t, p, "commit", "-m", "base")
	s := NewService()
	snap, err := s.Snapshot(p, 100)
	if err != nil || snap.HasUpstream || snap.Ahead != 0 {
		t.Fatalf("no upstream: %+v %v", snap, err)
	}
	git(t, p, "remote", "add", "origin", remote)
	git(t, p, "push", "-u", "origin", "main")
	other := repository(t)
	git(t, other, "remote", "add", "origin", remote)
	git(t, other, "fetch", "origin")
	git(t, other, "switch", "-C", "main", "origin/main")
	write(t, other, "remote", "one behind")
	git(t, other, "add", "remote")
	git(t, other, "commit", "-m", "remote")
	git(t, other, "push", "origin", "main")
	for _, name := range []string{"one", "two"} {
		write(t, p, name, name)
		git(t, p, "add", name)
		git(t, p, "commit", "-m", name)
	}
	git(t, p, "fetch", "origin")
	write(t, p, "base", "staged")
	git(t, p, "add", "base")
	write(t, p, "base", "also unstaged")
	write(t, p, "untracked", "new")
	snap, err = s.Snapshot(p, 100)
	if err != nil || !snap.HasUpstream || snap.Ahead != 2 || snap.Behind != 1 || snap.DirtyCount != 2 {
		t.Fatalf("status: %+v %v", snap, err)
	}
	for _, b := range snap.Branches {
		if b.Current && (b.Ahead != 2 || b.Behind != 1) {
			t.Fatalf("branch: %+v", b)
		}
	}
	git(t, p, "switch", "--detach", "HEAD")
	snap, err = s.Snapshot(p, 100)
	if err != nil || snap.HasUpstream || snap.Ahead != 0 || snap.Behind != 0 {
		t.Fatalf("detached: %+v %v", snap, err)
	}
}
