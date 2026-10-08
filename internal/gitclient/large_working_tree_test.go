package gitclient

import (
	"fmt"
	"strings"
	"testing"
)

func TestLargeWorkingTree(t *testing.T) {
	p := repository(t)
	s := NewService()
	paths := make([]string, 20000)
	for i := range paths {
		paths[i] = fmt.Sprintf("generated-%05d-%s.txt", i, strings.Repeat("x", 100))
		write(t, p, paths[i], "first\n")
	}
	requireState := func(index string, untracked bool) {
		t.Helper()
		state, err := s.WorkingState(p)
		if err != nil || len(state.Files) != len(paths) {
			t.Fatalf("state: %d files, %v", len(state.Files), err)
		}
		for _, f := range state.Files {
			if f.Index != index || f.Untracked != untracked {
				t.Fatalf("unexpected status: %+v", f)
			}
		}
	}
	out, err := s.Stage(p, paths)
	requireOK(t, out, err)
	requireState("A", false)
	out, err = s.Unstage(p, paths)
	requireOK(t, out, err)
	requireState("?", true)
	out, err = s.Stage(p, paths)
	requireOK(t, out, err)
	out, err = s.Commit(p, "large tree", false)
	requireOK(t, out, err)
	for _, name := range paths {
		write(t, p, name, "changed\n")
	}
	out, err = s.Stage(p, paths)
	requireOK(t, out, err)
	requireState("M", false)
	out, err = s.Unstage(p, paths)
	requireOK(t, out, err)
	requireState(" ", false)
	out, err = s.Discard(p, paths, true)
	requireOK(t, out, err)
	state, err := s.WorkingState(p)
	if err != nil || len(state.Files) != 0 {
		t.Fatalf("discard: %d files, %v", len(state.Files), err)
	}
}
