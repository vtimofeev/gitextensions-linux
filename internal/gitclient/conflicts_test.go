package gitclient

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func conflicted(t *testing.T) (string, *Service) {
	t.Helper()
	p := repository(t)
	s := NewService()
	commitFile(t, p, "shared", "base\n", "base")
	git(t, p, "switch", "-c", "topic")
	commitFile(t, p, "shared", "topic\n", "topic")
	git(t, p, "switch", "main")
	commitFile(t, p, "shared", "main\n", "main")
	if _, err := s.RefAction(p, RefOptions{Action: "merge", Target: "topic", Mode: "no-ff"}); err == nil {
		t.Fatal("expected conflict")
	}
	return p, s
}
func TestConflictQuickActions(t *testing.T) {
	for _, mode := range []string{"ours", "theirs", "delete"} {
		t.Run(mode, func(t *testing.T) {
			p, s := conflicted(t)
			data, err := s.Conflict(p, "shared")
			if err != nil {
				t.Fatal(err)
			}
			if !data.OursPresent || !data.TheirsPresent || !data.ExternalSupported {
				t.Fatalf("invalid conflict info: %+v", data)
			}
			out, err := s.ResolveConflict(p, "shared", data.Token, mode)
			requireOK(t, out, err)
			if git(t, p, "ls-files", "-u") != "" {
				t.Fatal("file was not marked resolved")
			}
			if mode == "delete" {
				if _, err := os.Stat(filepath.Join(p, "shared")); !os.IsNotExist(err) {
					t.Fatal("file not deleted")
				}
			} else {
				content, err := os.ReadFile(filepath.Join(p, "shared"))
				if err != nil {
					t.Fatal(err)
				}
				expected := "main\n"
				if mode == "theirs" {
					expected = "topic\n"
				}
				if string(content) != expected {
					t.Fatal("wrong side kept")
				}
			}
			actionOK(t, s, p, RefOptions{Action: "continue"})
		})
	}
}
func TestConflictMarkResolvedAndStaleGuard(t *testing.T) {
	p, s := conflicted(t)
	data, err := s.Conflict(p, "shared")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ResolveConflict(p, "shared", data.Token, "mark"); err == nil {
		t.Fatal("conflict markers must be rejected")
	}
	if _, err = s.ResolveConflict(p, "shared", data.Token, "save"); err == nil {
		t.Fatal("custom editor action must not exist")
	}
	write(t, p, "shared", "externally resolved\n")
	if _, err = s.ResolveConflict(p, "shared", data.Token, "ours"); err == nil {
		t.Fatal("stale result overwrite must be rejected")
	}
	data, err = s.Conflict(p, "shared")
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.ResolveConflict(p, "shared", data.Token, "mark")
	requireOK(t, out, err)
	if git(t, p, "show", ":shared") != "externally resolved" {
		t.Fatal("external result not staged")
	}
	if _, err = s.Conflict(p, "shared"); err == nil {
		t.Fatal("resolved conflict still available")
	}
}
func TestModifyDeleteConflict(t *testing.T) {
	p := repository(t)
	s := NewService()
	commitFile(t, p, "shared", "base", "base")
	git(t, p, "switch", "-c", "topic")
	commitFile(t, p, "shared", "topic", "topic")
	git(t, p, "switch", "main")
	git(t, p, "rm", "shared")
	git(t, p, "commit", "-m", "delete")
	if _, err := s.RefAction(p, RefOptions{Action: "merge", Target: "topic", Mode: "no-ff"}); err == nil {
		t.Fatal("expected conflict")
	}
	data, err := s.Conflict(p, "shared")
	if err != nil {
		t.Fatal(err)
	}
	if data.OursPresent || !data.TheirsPresent {
		t.Fatalf("wrong deletion sides: %+v", data)
	}
	if _, err = s.ResolveConflict(p, "shared", data.Token, "ours"); err == nil {
		t.Fatal("absent side should require explicit deletion")
	}
	out, err := s.ResolveConflict(p, "shared", data.Token, "delete")
	requireOK(t, out, err)
}
func TestMergeToolDetectionConfigurationAndLaunch(t *testing.T) {
	t.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	p, s := conflicted(t)
	tools, err := s.MergeTools(p)
	if err != nil || len(tools) == 0 {
		t.Fatalf("tools: %+v %v", tools, err)
	}
	git(t, p, "config", "mergetool.custom.cmd", `cp "$REMOTE" "$MERGED"`)
	out, err := s.ConfigureMergeTool(p, "custom", "", true)
	requireOK(t, out, err)
	tools, err = s.MergeTools(p)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, tool := range tools {
		if tool.Name == "custom" && tool.Available && tool.Default && tool.Custom && tool.TrustExit {
			found = true
		}
	}
	if !found {
		t.Fatalf("configured tool not detected: %+v", tools)
	}
	out, err = s.RunMergeTool(p, "shared", "custom")
	requireOK(t, out, err)
	if git(t, p, "ls-files", "-u") != "" || git(t, p, "show", ":shared") != "topic" {
		t.Fatal("external result not staged")
	}
	if _, err = s.ConfigureMergeTool(p, "--bad", "", true); err == nil {
		t.Fatal("invalid name accepted")
	}
	if _, err = s.ConfigureMergeTool(p, "meld", "/missing/executable", true); err == nil {
		t.Fatal("missing executable accepted")
	}
	actionOK(t, s, p, RefOptions{Action: "continue"})
}
func TestMergeToolCannotSilentlyStageMarkers(t *testing.T) {
	t.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	p, s := conflicted(t)
	git(t, p, "config", "mergetool.custom.cmd", "true")
	out, err := s.ConfigureMergeTool(p, "custom", "", true)
	requireOK(t, out, err)
	if _, err = s.RunMergeTool(p, "shared", "custom"); err == nil || !strings.Contains(err.Error(), "markers") {
		t.Fatalf("expected unresolved markers: %v", err)
	}
	if git(t, p, "ls-files", "-u") == "" {
		t.Fatal("unmerged index stages were not restored")
	}
}
func TestMergeToolCancellation(t *testing.T) {
	t.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	p, s := conflicted(t)
	git(t, p, "config", "mergetool.slow.cmd", `touch "$MERGED.started"; sleep 30`)
	out, err := s.ConfigureMergeTool(p, "slow", "", true)
	requireOK(t, out, err)
	finished := make(chan error, 1)
	go func() { _, err := s.RunMergeTool(p, "shared", "slow"); finished <- err }()

	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(p, "shared.started")); err == nil {
			break
		}
		if time.Now().After(deadline) {
			s.CancelMergeTool()
			t.Fatal("external tool did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}

	s.CancelMergeTool()
	select {
	case err := <-finished:
		if err == nil {
			t.Fatal("cancelled tool returned success")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("tool cancellation did not return")
	}
	if git(t, p, "ls-files", "-u") == "" {
		t.Fatal("cancellation lost conflict state")
	}
}

func TestGitlinkConflictUsesIndexPointers(t *testing.T) {
	p := repository(t)
	s := NewService()
	base := commitFile(t, p, "base", "base", "base")
	ours := commitFile(t, p, "base", "ours", "ours")
	theirs := commitFile(t, p, "base", "theirs", "theirs")
	if err := os.Mkdir(filepath.Join(p, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	index := "160000 " + base + " 1\tsub\x00" + "160000 " + ours + " 2\tsub\x00" + "160000 " + theirs + " 3\tsub\x00"
	out, err := s.run(p, index, "update-index", "-z", "--index-info")
	requireOK(t, out, err)
	data, err := s.Conflict(p, "sub")
	if err != nil {
		t.Fatal(err)
	}
	if data.ExternalSupported {
		t.Fatal("a gitlink must not open a regular-file merge tool")
	}
	out, err = s.ResolveConflict(p, "sub", data.Token, "ours")
	requireOK(t, out, err)
	if !strings.Contains(git(t, p, "ls-files", "--stage", "sub"), ours+" 0") {
		t.Fatal("submodule index was not resolved to selected side")
	}
}
