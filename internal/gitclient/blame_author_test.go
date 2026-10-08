package gitclient

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestBlamePorcelainDateTimezoneAndFilename(t *testing.T) {
	hash := strings.Repeat("a", 40)
	for _, filename := range []string{"old name.txt", `"old\tname\303\251.txt"`} {
		out := hash + " 2 1 1\nauthor Ada Lovelace\nauthor-mail <ada@example.test>\nauthor-time 1790862900\nauthor-tz +0530\nsummary Change\nfilename " + filename + "\n\tcontent\n"
		lines, err := parseBlame(out, true)
		if err != nil || len(lines) != 1 {
			t.Fatalf("%+v %v", lines, err)
		}
		date, err := time.Parse(time.RFC3339, lines[0].Date)
		_, offset := date.Zone()
		expectedPath := "old name.txt"
		if strings.HasPrefix(filename, `"`) {
			expectedPath = "old\tnameé.txt"
		}
		if err != nil || date.Unix() != 1790862900 || offset != 19800 || lines[0].OriginalPath != expectedPath || lines[0].Email != "ada@example.test" {
			t.Fatalf("%+v %v", lines[0], err)
		}
	}
}

func TestBlameArguments(t *testing.T) {
	for _, test := range []struct {
		options BlameOptions
		flags   []string
	}{
		{BlameOptions{IgnoreWhitespace: true}, []string{"-w"}},
		{BlameOptions{}, nil},
		{BlameOptions{DetectCopiesInFile: true}, []string{"-C"}},
		{BlameOptions{IgnoreWhitespace: true, DetectCopiesInAllFiles: true}, []string{"-w", "-C", "-C"}},
		{BlameOptions{DetectCopiesInFile: true, DetectCopiesInAllFiles: true}, []string{"-C", "-C"}},
	} {
		want := append([]string{"blame", "--line-porcelain"}, test.flags...)
		// Literal paths are always separated from options and the revision.
		want = append(want, "HEAD", "--", "file with spaces.txt")
		if got := blameArgs("HEAD", "file with spaces.txt", test.options); !reflect.DeepEqual(got, want) {
			t.Fatalf("%v != %v", got, want)
		}
	}
}

func TestBlameWhitespaceDefaultAndHistoryEmail(t *testing.T) {
	p := repository(t)
	write(t, p, "old.txt", "one two three\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "original")
	first := git(t, p, "rev-parse", "HEAD")
	git(t, p, "mv", "old.txt", "new.txt")
	git(t, p, "commit", "-m", "rename")
	write(t, p, "new.txt", "one  two three\n")
	git(t, p, "add", ".")
	git(t, p, "commit", "--author", "Ada <ada@example.test>", "-m", "whitespace and rename")
	s := NewService()
	lines, err := s.Blame(p, "new.txt", "HEAD")
	if err != nil || len(lines) != 1 || lines[0].Hash != first || lines[0].OriginalPath != "old.txt" {
		t.Fatalf("%+v %v", lines, err)
	}
	lines, err = s.Blame(p, "new.txt", "HEAD", BlameOptions{})
	if err != nil || lines[0].Email != "ada@example.test" {
		t.Fatalf("%+v %v", lines, err)
	}
	history, err := s.FileHistory(p, "new.txt", "HEAD")
	if err != nil || history[0].Commit.AuthorEmail != "ada@example.test" {
		t.Fatalf("%+v %v", history, err)
	}
	snapshot, err := s.Snapshot(p, 100)
	if err != nil || snapshot.Commits[0].AuthorEmail != "ada@example.test" {
		t.Fatalf("%+v %v", snapshot, err)
	}
}
