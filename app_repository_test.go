package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestRepositoryExists(t *testing.T) {
	root := t.TempDir()
	normal := filepath.Join(root, "normal")
	bare := filepath.Join(root, "bare")
	for _, args := range [][]string{{"init", normal}, {"init", "--bare", bare}} {
		if output, err := exec.Command("git", args...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, output)
		}
	}
	worktree := filepath.Join(root, "worktree")
	empty := filepath.Join(root, "empty")
	for _, path := range []string{worktree, empty} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	// Worktrees and submodules use a regular .git indirection file.
	if err := os.WriteFile(filepath.Join(worktree, ".git"), []byte("gitdir: ../normal/.git\n"), 0600); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, nil, 0600); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "missing")
	want := map[string]bool{normal: true, bare: true, worktree: true, empty: false, missing: false, file: false}
	paths := []string{normal, bare, worktree, empty, missing, file}
	got := NewApp("").RepositoryExists(paths)
	for path, exists := range want {
		if got[path] != exists {
			t.Errorf("RepositoryExists(%q) = %v, want %v", path, got[path], exists)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("got %d results, want %d", len(got), len(want))
	}
}
