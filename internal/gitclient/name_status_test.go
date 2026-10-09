package gitclient

import (
	"reflect"
	"strings"
	"testing"
)

func TestNameStatusPreservesLiteralPaths(t *testing.T) {
	path := "a [1]\nfile.txt"
	records := "M\x00" + path + "\x00R100\x00old name\x00" + strings.Repeat("a", 40) + "\x00C90\x00copy source\x00copy target\x00D\x00gone\x00"
	got, err := parseNameStatus(records)
	want := []nameStatusChange{{Kind: "M", Path: path}, {Kind: "R100", Path: strings.Repeat("a", 40), OriginalPath: "old name"}, {Kind: "C90", Path: "copy target", OriginalPath: "copy source"}, {Kind: "D", Path: "gone"}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("name-status: %#v %v", got, err)
	}
	for _, out := range []string{"M\x00file", "M\x00", "R100\x00old\x00", "C90\x00old\x00\x00", "invalid\x00file\x00", "Rbad\x00old\x00new\x00"} {
		if _, err := parseNameStatus(out); err == nil {
			t.Errorf("accepted malformed output %q", out)
		}
	}
}

func TestFileHistoryLiteralRenameThroughMerge(t *testing.T) {
	p := repository(t)
	old, newName := "old\n[1].txt", strings.Repeat("a", 40)
	commitFile(t, p, old, "base\n", "base")
	git(t, p, "switch", "-c", "topic")
	git(t, p, "mv", "--", old, newName)
	git(t, p, "commit", "-m", "rename")
	git(t, p, "switch", "main")
	commitFile(t, p, "other", "other\n", "other")
	git(t, p, "merge", "--no-ff", "topic", "-m", "merge")
	s := NewService()
	history, err := s.FileHistory(p, newName, "HEAD")
	if err != nil || len(history) == 0 {
		t.Fatalf("history: %#v %v", history, err)
	}
	for _, entry := range history {
		git(t, p, "cat-file", "-e", entry.Commit.Hash+":"+entry.File)
	}
	if history[len(history)-1].File != old {
		t.Fatalf("rename origin lost: %#v", history)
	}
}
