package gitclient

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func commitFile(t *testing.T, p, name, content, message string) string {
	write(t, p, name, content)
	git(t, p, "add", name)
	git(t, p, "commit", "-m", message)
	return git(t, p, "rev-parse", "HEAD")
}
func actionOK(t *testing.T, s *Service, p string, o RefOptions) {
	t.Helper()
	out, err := s.RefAction(p, o)
	requireOK(t, out, err)
}
func TestReferenceBranchesAndCheckout(t *testing.T) {
	p := repository(t)
	s := NewService()
	root := commitFile(t, p, "base", "base", "base")
	actionOK(t, s, p, RefOptions{Action: "create", Target: root, Name: "topic"})
	actionOK(t, s, p, RefOptions{Action: "rename", Target: "topic", Name: "renamed"})
	actionOK(t, s, p, RefOptions{Action: "checkout", Target: "renamed"})
	if git(t, p, "branch", "--show-current") != "renamed" {
		t.Fatal("checkout did not switch branch")
	}
	actionOK(t, s, p, RefOptions{Action: "checkout", Target: root, Detach: true})
	if git(t, p, "branch", "--show-current") != "" {
		t.Fatal("commit checkout must detach")
	}
	actionOK(t, s, p, RefOptions{Action: "checkout", Target: "main"})
	actionOK(t, s, p, RefOptions{Action: "delete", Target: "renamed"})
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, p, "remote", "add", "origin", remote)
	git(t, p, "push", "origin", "main")
	git(t, p, "fetch", "origin")
	actionOK(t, s, p, RefOptions{Action: "checkout", Target: "origin/main", Name: "tracking", Remote: true})
	if git(t, p, "rev-parse", "--abbrev-ref", "@{upstream}") != "origin/main" {
		t.Fatal("remote checkout must track the remote ref")
	}
	if _, err := s.RefAction(p, RefOptions{Action: "delete", Target: "origin/main", Remote: true}); err == nil {
		t.Fatal("remote ref deletion must be rejected")
	}
}
func TestCreateReferenceBranchWithOptionalCheckout(t *testing.T) {
	for _, checkout := range []bool{false, true} {
		t.Run(strconv.FormatBool(checkout), func(t *testing.T) {
			p := repository(t)
			s := NewService()
			base := commitFile(t, p, "base", "base", "base")
			commitFile(t, p, "base", "changed", "tip")
			actionOK(t, s, p, RefOptions{Action: "create", Target: base, Name: "topic", Checkout: checkout})
			if git(t, p, "rev-parse", "topic") != base {
				t.Fatal("branch must start at the selected revision")
			}
			want := "main"
			if checkout {
				want = "topic"
			}
			if got := git(t, p, "branch", "--show-current"); got != want {
				t.Fatalf("current branch = %q, want %q", got, want)
			}
		})
	}
}

func TestCreateReferenceBranchRejectsDirtyCheckoutWithoutCreatingBranch(t *testing.T) {
	p := repository(t)
	s := NewService()
	base := commitFile(t, p, "base", "base", "base")
	tip := commitFile(t, p, "base", "changed", "tip")
	write(t, p, "base", "unsaved changes")
	if _, err := s.RefAction(p, RefOptions{Action: "create", Target: base, Name: "topic", Checkout: true}); err == nil {
		t.Fatal("checkout that overwrites local changes must fail")
	}
	if got := git(t, p, "branch", "--list", "topic"); got != "" {
		t.Fatal("failed checkout must not create the branch")
	}
	if git(t, p, "rev-parse", "HEAD") != tip {
		t.Fatal("failed checkout must preserve HEAD")
	}
	content, err := os.ReadFile(filepath.Join(p, "base"))
	if err != nil || string(content) != "unsaved changes" {
		t.Fatal("failed checkout must preserve local changes", err)
	}
}

func TestMergeModesAndSquash(t *testing.T) {
	for _, mode := range []string{"ff-only", "no-ff", "squash", "no-commit"} {
		t.Run(mode, func(t *testing.T) {
			p := repository(t)
			s := NewService()
			base := commitFile(t, p, "base", "base", "base")
			git(t, p, "switch", "-c", "topic")
			tip := commitFile(t, p, "topic", "change", "topic")
			git(t, p, "switch", "main")
			o := RefOptions{Action: "merge", Target: tip, Mode: mode, Message: "Merge from menu"}
			if mode == "squash" {
				o.Mode = "ff"
				o.Squash = true
			}
			if mode == "no-commit" {
				o.Mode = "no-ff"
				o.NoCommit = true
			}
			actionOK(t, s, p, o)
			switch mode {
			case "ff-only":
				if git(t, p, "rev-parse", "HEAD") != tip {
					t.Fatal("expected fast-forward")
				}
			case "no-ff":
				if len(strings.Fields(git(t, p, "rev-list", "--parents", "-n", "1", "HEAD"))) != 3 {
					t.Fatal("expected merge commit")
				}
			case "squash", "no-commit":
				if git(t, p, "rev-parse", "HEAD") != base || git(t, p, "diff", "--cached", "--name-only") != "topic" {
					t.Fatal("expected staged changes without committing")
				}
			}
			if mode == "no-commit" {
				actionOK(t, s, p, RefOptions{Action: "continue"})
				if git(t, p, "log", "-1", "--format=%s") != "Merge from menu" {
					t.Fatal("merge continue lost message")
				}
			}
		})
	}
}
func TestCherryPickRevertAndMainline(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "base", "base", "base")
	git(t, p, "switch", "-c", "topic")
	tip := commitFile(t, p, "feature", "feature", "feature")
	git(t, p, "switch", "main")
	actionOK(t, s, p, RefOptions{Action: "cherry-pick", Target: tip, RecordOrigin: true})
	if !strings.Contains(git(t, p, "log", "-1", "--format=%B"), tip) {
		t.Fatal("missing origin trailer")
	}
	actionOK(t, s, p, RefOptions{Action: "revert", Target: "HEAD", NoCommit: true})
	if _, err := os.Stat(filepath.Join(p, "feature")); !os.IsNotExist(err) {
		t.Fatal("revert should remove added file")
	}
	git(t, p, "reset", "--hard", "HEAD")
	git(t, p, "switch", "-c", "other")
	other := commitFile(t, p, "other", "other", "other")
	git(t, p, "switch", "main")
	actionOK(t, s, p, RefOptions{Action: "merge", Target: other, Mode: "no-ff"})
	merge := git(t, p, "rev-parse", "HEAD")
	if _, err := s.RefAction(p, RefOptions{Action: "revert", Target: merge}); err == nil {
		t.Fatal("merge revert needs mainline")
	}
	actionOK(t, s, p, RefOptions{Action: "revert", Target: merge, Mainline: 1})
	if _, err := os.Stat(filepath.Join(p, "other")); !os.IsNotExist(err) {
		t.Fatal("mainline revert did not remove changes")
	}
}
func TestConflictAbortAndContinue(t *testing.T) {
	for _, finish := range []string{"abort", "continue"} {
		t.Run(finish, func(t *testing.T) {
			p := repository(t)
			s := NewService()
			commitFile(t, p, "shared", "base\n", "base")
			git(t, p, "switch", "-c", "topic")
			commitFile(t, p, "shared", "topic\n", "topic")
			git(t, p, "switch", "main")
			before := commitFile(t, p, "shared", "main\n", "main")
			if _, err := s.RefAction(p, RefOptions{Action: "merge", Target: "topic", Mode: "no-ff"}); err == nil {
				t.Fatal("expected conflict")
			}
			snap, err := s.Snapshot(p, 150)
			if err != nil || snap.Operation != "merge" || !snap.Files[0].Conflict {
				t.Fatalf("missing operation/conflict state: %+v %v", snap, err)
			}
			if _, err := s.RefAction(p, RefOptions{Action: "checkout", Target: "topic"}); err == nil {
				t.Fatal("overlapping operation accepted")
			}
			if finish == "continue" {
				write(t, p, "shared", "resolved\n")
				out, err := s.Stage(p, []string{"shared"})
				requireOK(t, out, err)
			}
			actionOK(t, s, p, RefOptions{Action: finish})
			snap, err = s.Snapshot(p, 150)
			if err != nil || snap.Operation != "" {
				t.Fatalf("operation not finished: %v %+v", err, snap)
			}
			if finish == "abort" && git(t, p, "rev-parse", "HEAD") != before {
				t.Fatal("abort did not restore HEAD")
			}
		})
	}
}
func TestRebaseAndSequencerRecovery(t *testing.T) {
	for _, operation := range []string{"rebase", "cherry-pick", "revert"} {
		for _, finish := range []string{"continue", "skip", "abort"} {
			t.Run(operation+"-"+finish, func(t *testing.T) {
				p := repository(t)
				s := NewService()
				commitFile(t, p, "shared", "base\n", "base")
				git(t, p, "switch", "-c", "topic")
				tip := commitFile(t, p, "shared", "topic\n", "topic")
				git(t, p, "switch", "main")
				before := commitFile(t, p, "shared", "main\n", "main")
				if _, err := s.RefAction(p, RefOptions{Action: operation, Target: tip}); err == nil {
					t.Fatal("expected conflict")
				}
				snap, err := s.Snapshot(p, 150)
				if err != nil || snap.Operation != operation {
					t.Fatalf("expected sequencer state %s: %+v %v", operation, snap, err)
				}
				if finish == "continue" {
					write(t, p, "shared", "resolved\n")
					out, err := s.Stage(p, []string{"shared"})
					requireOK(t, out, err)
				}
				actionOK(t, s, p, RefOptions{Action: finish})
				snap, err = s.Snapshot(p, 150)
				if err != nil || snap.Operation != "" {
					t.Fatalf("operation not finished: %+v %v", snap, err)
				}
				if finish == "abort" && git(t, p, "rev-parse", "HEAD") != before {
					t.Fatal("abort did not restore original revision")
				}
			})
		}
	}
}
func TestReferenceValidation(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "base", "base", "base")
	for _, o := range []RefOptions{{Action: "create", Target: "HEAD", Name: "--bad"}, {Action: "merge", Target: "HEAD", Mode: "--evil"}, {Action: "cherry-pick", Target: "--help"}, {Action: "rebase", Target: "missing"}, {Action: "reset", Target: "HEAD"}, {Action: "continue"}} {
		if _, err := s.RefAction(p, o); err == nil {
			t.Fatalf("invalid action accepted: %+v", o)
		}
	}
}

func TestTagActions(t *testing.T) {
	p := repository(t)
	s := NewService()
	base := commitFile(t, p, "base", "base", "base")
	tip := commitFile(t, p, "tip", "tip", "tip")
	git(t, p, "config", "tag.gpgSign", "true")
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: base, Name: "light", TagType: "lightweight"})
	if git(t, p, "cat-file", "-t", "refs/tags/light") != "commit" {
		t.Fatal("expected lightweight tag")
	}
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: base, Name: "annotated", TagType: "annotated", Message: "Release message"})
	if git(t, p, "cat-file", "-t", "refs/tags/annotated") != "tag" || !strings.Contains(git(t, p, "cat-file", "-p", "refs/tags/annotated"), "Release message") {
		t.Fatal("expected annotation and message")
	}
	if _, err := s.RefAction(p, RefOptions{Action: "create-tag", Target: tip, Name: "light"}); err == nil {
		t.Fatal("duplicate accepted")
	}
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: tip, Name: "light", Force: true})
	if git(t, p, "rev-parse", "refs/tags/light") != tip {
		t.Fatal("force did not move tag")
	}
	for _, opts := range []RefOptions{
		{Action: "create-tag", Target: tip, Name: "bad name"},
		{Action: "create-tag", Target: tip, Name: "bad-light", TagType: "lightweight", Message: "Annotation"},
		{Action: "create-tag", Target: tip, Name: "--bad"},
		{Action: "create-tag", Target: tip, Name: "empty", TagType: "annotated"},
		{Action: "create-tag", Target: tip, Name: "empty", TagType: "signed", Message: " "},
		{Action: "create-tag", Target: tip, Name: "remote", Push: true, RemoteName: "missing"},
		{Action: "delete-tag", Target: "--bad"},
	} {
		if _, err := s.RefAction(p, opts); err == nil {
			t.Fatalf("invalid tag action accepted: %+v", opts)
		}
	}
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, p, "remote", "add", "origin", remote)
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: base, Name: "release", Push: true, RemoteName: "origin"})
	if git(t, remote, "rev-parse", "refs/tags/release") != base {
		t.Fatal("tag missing on remote")
	}
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: tip, Name: "release", Force: true, Push: true, RemoteName: "origin"})
	if git(t, remote, "rev-parse", "refs/tags/release") != tip {
		t.Fatal("remote force did not move tag")
	}
	actionOK(t, s, p, RefOptions{Action: "delete-tag", Target: "release"})
	if git(t, p, "tag", "-l", "release") != "" || git(t, remote, "rev-parse", "refs/tags/release") != tip {
		t.Fatal("local-only deletion affected remote")
	}
	actionOK(t, s, p, RefOptions{Action: "create-tag", Target: tip, Name: "release"})
	actionOK(t, s, p, RefOptions{Action: "delete-tag", Target: "release", Push: true, RemoteName: "origin"})
	if git(t, p, "tag", "-l", "release") != "" || git(t, remote, "tag", "-l", "release") != "" {
		t.Fatal("tag deletion incomplete")
	}
}

func TestSignedTagUsesGPG(t *testing.T) {
	p := repository(t)
	s := NewService()
	tip := commitFile(t, p, "base", "base", "base")
	// A local executable proves signing is requested without needing a real key.
	signer := filepath.Join(t.TempDir(), "gpg")
	marker := filepath.Join(t.TempDir(), "called")
	if err := os.WriteFile(signer, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > '"+marker+"'\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	git(t, p, "config", "gpg.program", signer)
	if _, err := s.RefAction(p, RefOptions{Action: "create-tag", Target: tip, Name: "signed", TagType: "signed", Message: "Signed release"}); err == nil {
		t.Fatal("signer failure ignored")
	}
	args, err := os.ReadFile(marker)
	if err != nil || !strings.Contains(string(args), "-bsau") {
		t.Fatalf("GPG signing was not invoked: %q %v", args, err)
	}
}
