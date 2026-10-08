package gitclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Service serializes repository reads and mutations for a coherent desktop session.
type Service struct {
	mu         sync.Mutex
	toolMu     sync.Mutex
	toolCancel context.CancelFunc
}

func NewService() *Service { return &Service{} }

type limitedBuffer struct {
	bytes.Buffer
	truncated bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := 4*1024*1024 - b.Len()
	if remaining > 0 {
		if len(p) > remaining {
			p = p[:remaining]
		}
		_, _ = b.Buffer.Write(p)
	}
	if n > remaining {
		b.truncated = true
	}
	return n, nil
}
func (s *Service) run(path, input string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = path
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_LITERAL_PATHSPECS=1", "LC_ALL=C", "GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true")
	// stash --keep-index internally uses the magic :/ pathspec. No stash API
	// accepts user pathspecs, so literal mode must be disabled for this command.
	if len(args) > 0 && args[0] == "stash" {
		cmd.Env = append(cmd.Env, "GIT_LITERAL_PATHSPECS=0")
	}
	cmd.Stdin = strings.NewReader(input)
	var out, stderr limitedBuffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("git %s: %w; refresh repository state", args[0], ctx.Err())
		}
		message := strings.TrimSpace(stderr.String() + out.String())
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", args[0], message)
	}
	result := out.String()
	if out.truncated {
		result += "\n[Preview truncated at 4 MiB]\n"
	}
	switch args[0] {
	case "switch", "branch", "add", "reset", "rm", "commit", "push", "pull", "fetch", "merge", "rebase", "cherry-pick", "revert":
		result += stderr.String()
	}
	return result, nil
}
func (s *Service) root(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("choose a repository first")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	out, err := s.run(abs, "", "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(out, "\n"), nil
}
func (s *Service) hasHead(path string) bool {
	_, err := s.run(path, "", "rev-parse", "--verify", "HEAD")
	return err == nil
}

const maxHistoryLimit = 100000

func (s *Service) Snapshot(path string, limit int) (Snapshot, error) {
	return s.HistorySnapshot(path, limit, "")
}
func (s *Service) HistorySnapshot(path string, limit int, author string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return Snapshot{}, err
	}
	result := Snapshot{Path: root, Commits: []Commit{}, Branches: []Branch{}, Files: []FileStatus{}, Remotes: []string{}}
	result.HomePath, _ = os.UserHomeDir()
	branch, e := s.run(root, "", "symbolic-ref", "--quiet", "--short", "HEAD")
	if e == nil {
		result.Branch = strings.TrimSpace(branch)
	} else {
		result.Branch = "HEAD"
		result.Detached = true
	}
	if limit < 1 {
		limit = 150
	}
	// History pages grow while scrolling; the cap only guards against runaway requests.
	if limit > maxHistoryLimit {
		limit = maxHistoryLimit
	}
	if s.hasHead(root) {
		args := []string{"log", "--all", "HEAD", "--date-order", "-z", fmt.Sprintf("--max-count=%d", limit), "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x00%ae"}
		if author != "" {
			args = append(args, "--fixed-strings", "--regexp-ignore-case", "--author="+author)
		}
		out, e := s.run(root, "", args...)
		if e != nil {
			return result, e
		}
		result.Commits, e = parseLog(out)
		if e != nil {
			return result, e
		}
	}
	out, err := s.run(root, "", "for-each-ref", "--sort=refname", "--sort=-committerdate", "--format=%(refname)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)%00%(committerdate:iso-strict)", "refs/heads", "refs/remotes")
	if err != nil {
		return result, err
	}
	for _, line := range strings.Split(strings.TrimSuffix(out, "\n"), "\n") {
		if line == "" {
			continue
		}
		f := strings.Split(line, "\x00")
		if len(f) != 6 {
			return result, errors.New("invalid branch output")
		}
		remote := strings.HasPrefix(f[0], "refs/remotes/")
		name := strings.TrimPrefix(strings.TrimPrefix(f[0], "refs/heads/"), "refs/remotes/")
		ahead, behind := trackingCounts(f[4])
		b := Branch{Name: name, Hash: f[1], Current: f[2] == "*", Remote: remote, Upstream: f[3], Tracking: f[4], Date: f[5], Ahead: ahead, Behind: behind}
		result.Branches = append(result.Branches, b)
		if b.Current && !result.Detached && b.Upstream != "" && b.Tracking != "[gone]" {
			result.HasUpstream, result.Ahead, result.Behind = true, ahead, behind
		}
	}
	out, err = s.run(root, "", "status", "--porcelain=v1", "-z", "--untracked-files=all")
	if err != nil {
		return result, err
	}
	result.Files, err = parseStatus(out)
	result.DirtyCount = dirtyCount(result.Files)
	if err != nil {
		return result, err
	}
	out, err = s.run(root, "", "remote")
	if err != nil {
		return result, err
	}
	for _, r := range strings.Split(strings.TrimSpace(out), "\n") {
		if r != "" {
			result.Remotes = append(result.Remotes, r)
		}
	}
	result.Operation, err = s.activeOperation(root)
	if err != nil {
		return result, err
	}

	return result, nil
}
func parseLog(out string) ([]Commit, error) {
	result := []Commit{}
	f := strings.Split(strings.TrimSuffix(out, "\x00"), "\x00")
	if out == "" {
		return result, nil
	}
	if len(f)%7 != 0 {
		return nil, errors.New("invalid log output")
	}
	for i := 0; i < len(f); i += 7 {
		result = append(result, Commit{Hash: f[i], Parents: strings.Fields(f[i+1]), Author: f[i+2], Date: f[i+3], Subject: f[i+4], Refs: f[i+5], AuthorEmail: f[i+6]})
	}
	return result, nil
}
func parseStatus(out string) ([]FileStatus, error) {
	result := []FileStatus{}
	records := strings.Split(out, "\x00")
	for i := 0; i < len(records); i++ {
		r := records[i]
		if r == "" {
			continue
		}
		if len(r) < 4 || r[2] != ' ' {
			return nil, errors.New("invalid status output")
		}
		f := FileStatus{Path: r[3:], Index: r[:1], Worktree: r[1:2], Untracked: r[:2] == "??"}
		f.Conflict = strings.Contains(r[:2], "U") || r[:2] == "AA" || r[:2] == "DD"
		if strings.ContainsAny(r[:2], "RC") {
			i++
			if i >= len(records) || records[i] == "" {
				return nil, errors.New("missing original rename path")
			}
			f.OriginalPath = records[i]
		}
		result = append(result, f)
	}
	return result, nil
}
func (s *Service) branchName(root, name string) error {
	if name == "" || strings.HasPrefix(name, "-") || strings.Contains(name, "@{") {
		return errors.New("invalid branch name")
	}
	_, err := s.run(root, "", "check-ref-format", "--branch", name)
	return err
}
func (s *Service) mutation(path string, action func(string) (string, error)) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return "", err
	}
	return action(root)
}
func (s *Service) Checkout(path, branch string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := s.branchName(root, branch); err != nil {
			return "", err
		}
		return s.run(root, "", "switch", "--", branch)
	})
}
func (s *Service) CreateBranch(path, name, start string, checkout bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := s.branchName(root, name); err != nil {
			return "", err
		}
		if start != "" {
			out, err := s.run(root, "", "rev-parse", "--verify", "--end-of-options", start+"^{commit}")
			if err != nil {
				return "", err
			}
			start = strings.TrimSpace(out)
		}
		args := []string{"branch", name}
		if checkout {
			args = []string{"switch", "-c", name}
		}
		if start != "" {
			args = append(args, start)
		}
		return s.run(root, "", args...)
	})
}
func (s *Service) DeleteBranch(path, name string, force bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := s.branchName(root, name); err != nil {
			return "", err
		}
		flag := "-d"
		if force {
			flag = "-D"
		}
		return s.run(root, "", "branch", flag, "--", name)
	})
}
func validatePaths(files []string) error {
	if len(files) == 0 {
		return errors.New("select at least one file")
	}
	for _, p := range files {
		if p == "" || filepath.IsAbs(p) || p == ".." || strings.HasPrefix(filepath.Clean(p), "../") || strings.ContainsRune(p, 0) {
			return errors.New("invalid repository-relative path")
		}
	}
	return nil
}
func (s *Service) Stage(path string, files []string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := validatePaths(files); err != nil {
			return "", err
		}
		return s.runPaths(root, files, "add")
	})
}
func (s *Service) Unstage(path string, files []string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := validatePaths(files); err != nil {
			return "", err
		}
		args := []string{"reset", "HEAD"}
		if !s.hasHead(root) {
			args = []string{"rm", "--cached", "-r"}
		}
		return s.runPaths(root, files, args...)
	})
}
func (s *Service) Commit(path, message string, amend bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if strings.TrimSpace(message) == "" {
			return "", errors.New("commit message is required")
		}
		args := []string{"commit", "-F", "-"}
		if amend {
			args = append(args, "--amend")
		}
		return s.run(root, message, args...)
	})
}
func (s *Service) remote(root, name string) error {
	if name == "" {
		return nil
	}
	out, err := s.run(root, "", "remote")
	if err != nil {
		return err
	}
	for _, r := range strings.Fields(out) {
		if r == name {
			return nil
		}
	}
	return errors.New("select a configured remote")
}
func (s *Service) Push(path string, opts PushOptions) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := s.remote(root, opts.Remote); err != nil {
			return "", err
		}
		args := []string{"push"}
		if opts.SetUpstream {
			args = append(args, "--set-upstream")
		}
		if opts.ForceWithLease {
			args = append(args, "--force-with-lease")
		}
		if opts.Tags {
			args = append(args, "--tags")
		}
		if opts.DryRun {
			args = append(args, "--dry-run")
		}
		if opts.Branch != "" {
			if opts.Remote == "" {
				return "", errors.New("choose a remote for an explicit branch")
			}
			if err := s.branchName(root, opts.Branch); err != nil {
				return "", err
			}
		}
		if opts.Remote != "" {
			args = append(args, opts.Remote)
		}
		if opts.Branch != "" {
			args = append(args, "HEAD:refs/heads/"+opts.Branch)
		}
		return s.run(root, "", args...)
	})
}
func (s *Service) Pull(path, remote, branch, mode string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if err := s.remote(root, remote); err != nil {
			return "", err
		}
		flag := ""
		switch mode {
		case "ff-only":
			flag = "--ff-only"
		case "rebase":
			flag = "--rebase"
		case "merge":
			flag = "--no-rebase"
		default:
			return "", errors.New("invalid pull mode")
		}
		args := []string{"pull", flag}
		if mode != "ff-only" {
			args = append(args, "--ff")
		}
		if branch != "" {
			if remote == "" {
				return "", errors.New("choose a remote for an explicit branch")
			}
			if err := s.branchName(root, branch); err != nil {
				return "", err
			}
		}
		if remote != "" {
			args = append(args, remote)
		}
		if branch != "" {
			args = append(args, branch)
		}
		return s.run(root, "", args...)
	})
}
func (s *Service) FetchAll(path string, prune bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		args := []string{"fetch", "--all"}
		if prune {
			args = append(args, "--prune")
		}
		return s.run(root, "", args...)
	})
}
func (s *Service) revision(root, rev string) (string, error) {
	out, err := s.run(root, "", "rev-parse", "--verify", "--end-of-options", rev+"^{commit}")
	return strings.TrimSpace(out), err
}
func (s *Service) CommitFiles(path, revision string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return nil, err
	}
	out, err := s.run(root, "", "diff-tree", "--root", "-m", "--no-commit-id", "--name-only", "-r", "-z", rev)
	if err != nil {
		return nil, err
	}
	files := []string{}
	seen := map[string]bool{}
	for _, p := range strings.Split(out, "\x00") {
		if p != "" && !seen[p] {
			seen[p] = true
			files = append(files, p)
		}
	}
	return files, nil
}
func (s *Service) Diff(path, file, area, revision string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return "", err
	}
	if err = validatePaths([]string{file}); err != nil {
		return "", err
	}
	args := []string{"diff", "--no-ext-diff", "--no-textconv", "--no-color"}
	switch area {
	case "staged":
		args = append(args, "--cached")
	case "unstaged":
	case "commit":
		rev, e := s.revision(root, revision)
		if e != nil {
			return "", e
		}
		args = []string{"show", "--format=", "--first-parent", "--no-ext-diff", "--no-textconv", "--no-color", rev}
	case "untracked":
		absolute := filepath.Join(root, file)
		resolved, e := filepath.EvalSymlinks(absolute)
		if e != nil {
			return "", e
		}
		relative, e := filepath.Rel(root, resolved)
		if e != nil || relative == ".." || strings.HasPrefix(relative, "../") {
			return "", errors.New("file points outside the repository")
		}
		f, e := os.Open(resolved)
		if e != nil {
			return "", e
		}
		defer f.Close()
		info, e := f.Stat()
		if e != nil {
			return "", e
		}
		if !info.Mode().IsRegular() {
			return "", errors.New("preview requires a regular file")
		}
		data, e := io.ReadAll(io.LimitReader(f, 1024*1024))
		if e != nil {
			return "", e
		}
		if bytes.ContainsRune(data, 0) {
			return "Binary file", nil
		}
		text := string(data)
		if info.Size() > int64(len(data)) {
			text += "\n[Preview truncated at 1 MiB]"
		}
		return text, nil
	default:
		return "", errors.New("invalid diff area")
	}
	return s.run(root, "", append(args, "--", file)...)
}

func (s *Service) activeOperation(root string) (string, error) {
	for _, state := range []struct{ file, name string }{{"rebase-merge", "rebase"}, {"rebase-apply", "rebase"}, {"MERGE_HEAD", "merge"}, {"CHERRY_PICK_HEAD", "cherry-pick"}, {"REVERT_HEAD", "revert"}, {"sequencer", "cherry-pick"}} {
		p, e := s.run(root, "", "rev-parse", "--git-path", state.file)
		if e != nil {
			continue
		}
		p = strings.TrimSpace(p)
		if !filepath.IsAbs(p) {
			p = filepath.Join(root, p)
		}
		if _, e = os.Stat(p); e == nil {
			if state.file == "sequencer" {
				todo, err := os.ReadFile(filepath.Join(p, "todo"))
				if err == nil && strings.HasPrefix(strings.TrimSpace(string(todo)), "revert ") {
					return "revert", nil
				}
			}
			return state.name, nil
		}
	}
	return "", nil
}

// WorkingState avoids rebuilding history for index-only operations.
func (s *Service) WorkingState(path string) (WorkingState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return WorkingState{}, err
	}
	out, err := s.run(root, "", "status", "--porcelain=v1", "-z", "--untracked-files=all")
	if err != nil {
		return WorkingState{}, err
	}
	files, err := parseStatus(out)
	if err != nil {
		return WorkingState{}, err
	}
	operation, err := s.activeOperation(root)
	return WorkingState{DirtyCount: dirtyCount(files), Files: files, Operation: operation}, err
}

// CommitInfo lets branch navigation reveal an older tip outside the history window.
func (s *Service) CommitInfo(path, revision string) (Commit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return Commit{}, err
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return Commit{}, err
	}
	out, err := s.run(root, "", "log", "-1", "-z", "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x00%ae", rev)
	if err != nil {
		return Commit{}, err
	}
	commits, err := parseLog(out)
	if err != nil {
		return Commit{}, err
	}
	if len(commits) != 1 {
		return Commit{}, errors.New("commit not found")
	}
	return commits[0], nil
}

func trackingCounts(track string) (ahead, behind int) {
	for _, part := range strings.Split(strings.Trim(track, "[]"), ",") {
		fields := strings.Fields(part)
		if len(fields) == 2 {
			n, _ := strconv.Atoi(fields[1])
			if fields[0] == "ahead" {
				ahead = n
			}
			if fields[0] == "behind" {
				behind = n
			}
		}
	}
	return
}
func dirtyCount(files []FileStatus) int {
	paths := make(map[string]bool)
	for _, file := range files {
		paths[file.Path] = true
	}
	return len(paths)
}

// NUL stdin keeps literal names and arbitrarily large selections off argv.
// rm and ls-files lack pathspec-from-file support, so use bounded batches.
func (s *Service) runPaths(root string, paths []string, args ...string) (string, error) {
	if len(paths) == 0 {
		return "", nil
	}
	if args[0] != "rm" && args[0] != "ls-files" {
		return s.run(root, strings.Join(paths, "\x00")+"\x00", append(args, "--pathspec-from-file=-", "--pathspec-file-nul")...)
	}
	var output strings.Builder
	for start := 0; start < len(paths); {
		end, size := start, 0
		for end < len(paths) && (end == start || size+len(paths[end])+1 <= 24000) {
			size += len(paths[end]) + 1
			end++
		}
		command := append(append([]string{}, args...), "--")
		out, err := s.run(root, "", append(command, paths[start:end]...)...)
		output.WriteString(out)
		if err != nil {
			return output.String(), err
		}
		start = end
	}
	return output.String(), nil
}
