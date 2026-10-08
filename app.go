package main

import (
	"context"
	"gitextensions-linux/internal/gitclient"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"path/filepath"
)

// App is the desktop facade. Git behavior stays in the testable Service.
type App struct {
	ctx         context.Context
	initialPath string
	git         *gitclient.Service
}

func NewApp(path string) *App              { return &App{initialPath: path, git: gitclient.NewService()} }
func (a *App) startup(ctx context.Context) { a.ctx = ctx }
func (a *App) InitialRepository() string   { return a.initialPath }
func (a *App) ChooseRepository() (string, error) {
	directory, _ := filepath.Abs(a.initialPath)
	if info, err := os.Stat(directory); err != nil || !info.IsDir() {
		directory, _ = os.Getwd()
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Choose Git repository", DefaultDirectory: directory, ShowHiddenFiles: true})
}
func (a *App) Snapshot(path string, limit int) (gitclient.Snapshot, error) {
	return a.git.Snapshot(path, limit)
}
func (a *App) Checkout(path, branch string) (string, error) { return a.git.Checkout(path, branch) }
func (a *App) CreateBranch(path, name, start string, checkout bool) (string, error) {
	return a.git.CreateBranch(path, name, start, checkout)
}
func (a *App) DeleteBranch(path, name string, force bool) (string, error) {
	return a.git.DeleteBranch(path, name, force)
}
func (a *App) Stage(path string, files []string) (string, error)   { return a.git.Stage(path, files) }
func (a *App) Unstage(path string, files []string) (string, error) { return a.git.Unstage(path, files) }
func (a *App) Commit(path, message string, amend bool) (string, error) {
	return a.git.Commit(path, message, amend)
}
func (a *App) Push(path string, opts gitclient.PushOptions) (string, error) {
	return a.git.Push(path, opts)
}
func (a *App) Pull(path, remote, branch, mode string) (string, error) {
	return a.git.Pull(path, remote, branch, mode)
}
func (a *App) FetchAll(path string, prune bool) (string, error) { return a.git.FetchAll(path, prune) }
func (a *App) CommitFiles(path, revision string) ([]string, error) {
	return a.git.CommitFiles(path, revision)
}
func (a *App) Diff(path, file, area, revision string) (string, error) {
	return a.git.Diff(path, file, area, revision)
}

func (a *App) RefAction(path string, opts gitclient.RefOptions) (string, error) {
	return a.git.RefAction(path, opts)
}

func (a *App) Discard(path string, files []string, worktreeOnly bool) (string, error) {
	return a.git.Discard(path, files, worktreeOnly)
}

func (a *App) Conflict(path, file string) (gitclient.ConflictData, error) {
	return a.git.Conflict(path, file)
}
func (a *App) ResolveConflict(path, file, token, mode string) (string, error) {
	return a.git.ResolveConflict(path, file, token, mode)
}
func (a *App) MergeTools(path string) ([]gitclient.MergeTool, error) { return a.git.MergeTools(path) }
func (a *App) ConfigureMergeTool(path, name, binary string, trustExit bool) (string, error) {
	return a.git.ConfigureMergeTool(path, name, binary, trustExit)
}
func (a *App) RunMergeTool(path, file, name string) (string, error) {
	return a.git.RunMergeTool(path, file, name)
}
func (a *App) CancelMergeTool() { a.git.CancelMergeTool() }

func (a *App) WorkingState(path string) (gitclient.WorkingState, error) {
	return a.git.WorkingState(path)
}
func (a *App) RunDiffTool(path, file, area, revision, name string) (string, error) {
	return a.git.RunDiffTool(path, file, area, revision, name)
}

func (a *App) CommitInfo(path, revision string) (gitclient.Commit, error) {
	return a.git.CommitInfo(path, revision)
}

func (a *App) HistorySnapshot(path string, limit int, author string) (gitclient.Snapshot, error) {
	return a.git.HistorySnapshot(path, limit, author)
}
func (a *App) CommitDetails(path, revision string) (gitclient.CommitDetails, error) {
	return a.git.CommitDetails(path, revision)
}
func (a *App) Stashes(path string) ([]gitclient.StashEntry, error) { return a.git.Stashes(path) }
func (a *App) Reflog(path string) ([]gitclient.StashEntry, error)  { return a.git.Reflog(path) }
func (a *App) StashAction(path, action, hash, message string, untracked, keepIndex, restoreIndex bool) (string, error) {
	return a.git.StashAction(path, action, hash, message, untracked, keepIndex, restoreIndex)
}
func (a *App) Reset(path, revision, mode string) (string, error) {
	return a.git.Reset(path, revision, mode)
}
func (a *App) FileHistory(path, file, revision string) ([]gitclient.FileRevision, error) {
	return a.git.FileHistory(path, file, revision)
}
func (a *App) FileContent(path, file, area, revision string) (gitclient.FileContent, error) {
	return a.git.FileContent(path, file, area, revision)
}
func (a *App) Blame(path, file, revision string, options gitclient.BlameOptions) ([]gitclient.BlameLine, error) {
	return a.git.Blame(path, file, revision, options)
}
func (a *App) CopyText(text string) error { return runtime.ClipboardSetText(a.ctx, text) }

func (a *App) Identity(path string) (gitclient.Identity, error) { return a.git.Identity(path) }
func (a *App) SetIdentity(path, name, email string) (string, error) {
	return a.git.SetIdentity(path, name, email)
}

func (a *App) FileDiff(path, file, revision string, fullContext bool) (string, error) {
	return a.git.FileDiff(path, file, revision, fullContext)
}

func (a *App) StartReview(path string, opts gitclient.ReviewOptions) (string, error) {
	return a.git.StartReview(path, opts)
}

// RepositoryExists checks working trees (including worktrees with a .git file)
// and bare repositories without spawning Git.
func (a *App) RepositoryExists(paths []string) map[string]bool {
	result := make(map[string]bool, len(paths))
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil || !info.IsDir() {
			result[path] = false
			continue
		}
		git, err := os.Stat(filepath.Join(path, ".git"))
		if err == nil && (git.IsDir() || git.Mode().IsRegular()) {
			result[path] = true
			continue
		}
		head, headErr := os.Stat(filepath.Join(path, "HEAD"))
		objects, objectsErr := os.Stat(filepath.Join(path, "objects"))
		result[path] = headErr == nil && head.Mode().IsRegular() && objectsErr == nil && objects.IsDir()
	}
	return result
}
