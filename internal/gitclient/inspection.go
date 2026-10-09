package gitclient

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type CommitDetails struct {
	Commit
	Committer      string `json:"committer"`
	CommitterEmail string `json:"committerEmail"`
	CommitterDate  string `json:"committerDate"`
	Message        string `json:"message"`
}
type StashEntry struct {
	Hash     string `json:"hash"`
	Selector string `json:"selector"`
	Date     string `json:"date"`
	Subject  string `json:"subject"`
}
type FileRevision struct {
	Commit       Commit `json:"commit"`
	File         string `json:"file"`
	OriginalPath string `json:"originalPath"`
}
type FileContent struct {
	Text        string `json:"text"`
	Binary      bool   `json:"binary"`
	ImageMIME   string `json:"imageMime,omitempty"`
	ImageBase64 string `json:"imageBase64,omitempty"`
}
type BlameOptions struct {
	IgnoreWhitespace       bool `json:"ignoreWhitespace"`
	DetectCopiesInFile     bool `json:"detectCopiesInFile"`
	DetectCopiesInAllFiles bool `json:"detectCopiesInAllFiles"`
}

// blameArgs keeps all options before the revision and literal pathspec.
func blameArgs(rev, file string, options BlameOptions) []string {
	args := []string{"blame", "--line-porcelain"}
	if options.IgnoreWhitespace {
		args = append(args, "-w")
	}
	if options.DetectCopiesInFile || options.DetectCopiesInAllFiles {
		args = append(args, "-C")
	}
	if options.DetectCopiesInAllFiles {
		args = append(args, "-C")
	}
	return append(args, rev, "--", file)
}

type BlameLine struct {
	OriginalPath string `json:"originalPath"`
	Hash         string `json:"hash"`
	Author       string `json:"author"`
	Email        string `json:"email"`
	Date         string `json:"date"`
	Summary      string `json:"summary"`
	OriginalLine int    `json:"originalLine"`
	Line         int    `json:"line"`
	Text         string `json:"text"`
}

func (s *Service) CommitDetails(path, revision string) (CommitDetails, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return CommitDetails{}, err
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return CommitDetails{}, err
	}
	out, err := s.run(root, "", "show", "-s", "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x00%ae%x00%cn%x00%ce%x00%cI%x00%B", rev)
	if err != nil {
		return CommitDetails{}, err
	}
	f := strings.SplitN(out, "\x00", 11)
	if len(f) != 11 {
		return CommitDetails{}, errors.New("invalid commit metadata")
	}
	return CommitDetails{Commit: Commit{Hash: f[0], Parents: strings.Fields(f[1]), Author: f[2], Date: f[3], Subject: f[4], Refs: f[5], AuthorEmail: f[6]}, Committer: f[7], CommitterEmail: f[8], CommitterDate: f[9], Message: strings.TrimSuffix(f[10], "\n")}, nil
}
func parseRefLog(out string) ([]StashEntry, error) {
	result := []StashEntry{}
	if out == "" {
		return result, nil
	}
	f := strings.Split(strings.TrimSuffix(out, "\x00"), "\x00")
	if len(f)%4 != 0 {
		return nil, errors.New("invalid reflog output")
	}
	for i := 0; i < len(f); i += 4 {
		result = append(result, StashEntry{Hash: f[i], Selector: f[i+1], Date: f[i+2], Subject: f[i+3]})
	}
	return result, nil
}
func (s *Service) Stashes(path string) ([]StashEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	out, err := s.run(root, "", "stash", "list", "-z", "--format=%H%x00%gd%x00%ci%x00%gs")
	if err != nil {
		return nil, err
	}
	return parseRefLog(out)
}
func (s *Service) Reflog(path string) ([]StashEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	if !s.hasHead(root) {
		return []StashEntry{}, nil
	}
	out, err := s.run(root, "", "reflog", "show", "-z", "--max-count=300", "--format=%H%x00%gd%x00%ci%x00%gs", "HEAD")
	if err != nil {
		return nil, err
	}
	return parseRefLog(out)
}
func (s *Service) StashAction(path, action, hash, message string, untracked, keepIndex, restoreIndex bool) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		operation, err := s.activeOperation(root)
		if err != nil {
			return "", err
		}
		if operation != "" {
			return "", errors.New("finish the active operation before managing stashes")
		}
		if action == "create" {
			args := []string{"stash", "push"}
			if untracked {
				args = append(args, "--include-untracked")
			}
			if keepIndex {
				args = append(args, "--keep-index")
			}
			if message != "" {
				args = append(args, "--message", message)
			}
			return s.run(root, "", args...)
		}
		if action != "apply" && action != "pop" && action != "drop" {
			return "", errors.New("invalid stash action")
		}
		// Match an immutable hash against the current list, avoiding stale stash@{n} indices.
		out, err := s.run(root, "", "stash", "list", "-z", "--format=%H%x00%gd%x00%ci%x00%gs")
		if err != nil {
			return "", err
		}
		entries, err := parseRefLog(out)
		if err != nil {
			return "", err
		}
		selector := ""
		for _, entry := range entries {
			if entry.Hash == hash {
				selector = entry.Selector
				break
			}
		}
		if selector == "" {
			return "", errors.New("stash no longer exists; reload the list")
		}
		args := []string{"stash", action}
		if restoreIndex && action != "drop" {
			args = append(args, "--index")
		}
		args = append(args, selector)
		return s.run(root, "", args...)
	})
}
func (s *Service) Reset(path, revision, mode string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if mode != "soft" && mode != "mixed" && mode != "hard" {
			return "", errors.New("invalid reset mode")
		}
		operation, err := s.activeOperation(root)
		if err != nil {
			return "", err
		}
		if operation != "" {
			return "", errors.New("finish or abort the active operation before resetting")
		}
		rev, err := s.revision(root, revision)
		if err != nil {
			return "", err
		}
		return s.run(root, "", "reset", "--"+mode, rev, "--")
	})
}
func (s *Service) FileHistory(path, file, revision string) ([]FileRevision, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	if err = validatePaths([]string{file}); err != nil {
		return nil, err
	}
	if revision == "" {
		revision = "HEAD"
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return nil, err
	}
	out, err := s.run(root, "", "log", "--follow", "--name-status", "-z", "--max-count=100", "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x00%ae", rev, "--", file)
	if err != nil {
		return nil, err
	}
	return parseFileHistory(out, file)
}

// FileDiff compares the selected file revision with its first parent, including roots.
func (s *Service) FileDiff(path, file, revision string, fullContext bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return "", err
	}
	if err = validatePaths([]string{file}); err != nil {
		return "", err
	}
	if revision == "" {
		revision = "HEAD"
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return "", err
	}
	// Include both sides of a rename so path filtering preserves rename detection.
	paths := []string{file}
	changes, err := s.run(root, "", "diff-tree", "--root", "--diff-merges=first-parent", "--no-color", "-r", "-M", "--no-commit-id", "--name-status", "-z", rev)
	if err != nil {
		return "", err
	}
	entries, err := parseNameStatus(changes)
	if err != nil {
		return "", err
	}
	for _, change := range entries {
		if change.Path == file && strings.HasPrefix(change.Kind, "R") {
			paths = append(paths, change.OriginalPath)
		}
	}
	args := []string{"show", "--format=", "--first-parent", "-M", "--no-ext-diff", "--no-textconv", "--no-color"}
	if fullContext {
		args = append(args, "--unified=1000000")
	}
	args = append(args, rev, "--")
	args = append(args, paths...)
	out, err := s.run(root, "", args...)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		if strings.HasPrefix(line, "Binary files ") {
			return "Binary file", nil
		}
	}
	// Pure renames and permission changes have no hunk; include the unchanged file.
	if fullContext && !strings.Contains(out, "\n@@ ") {
		data, e := s.diffBlob(root, rev, file)
		if e != nil {
			return "", e
		}
		if bytes.ContainsRune(data, 0) || !utf8.Valid(data) {
			return "Binary file", nil
		}
		lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
		if len(data) > 0 {
			var patch strings.Builder
			patch.WriteString(out)
			fmt.Fprintf(&patch, "@@ -1,%d +1,%d @@\n", len(lines), len(lines))
			for _, line := range lines {
				patch.WriteString(" " + line + "\n")
			}
			if data[len(data)-1] != '\n' {
				patch.WriteString("\\ No newline at end of file\n")
			}
			out = patch.String()
		}
	}
	return out, nil
}
func (s *Service) FileContent(path, file, area, revision string) (FileContent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return FileContent{}, err
	}
	if err = validatePaths([]string{file}); err != nil {
		return FileContent{}, err
	}
	var data []byte
	switch area {
	case "commit":
		rev, e := s.revision(root, revision)
		if e != nil {
			return FileContent{}, e
		}
		entry, e := s.run(root, "", "ls-tree", "-z", rev, "--", file)
		if e != nil {
			return FileContent{}, e
		}
		if entry == "" {
			return FileContent{}, errors.New("file does not exist in this revision; select an earlier entry in file history")
		}
		data, err = s.diffBlob(root, rev, file)
	case "staged":
		entry, e := s.run(root, "", "ls-files", "-s", "-z", "--", file)
		if e != nil {
			return FileContent{}, e
		}
		if entry == "" {
			return FileContent{}, errors.New("file does not exist in the index")
		}
		data, err = s.diffBlob(root, ":", file)
	case "unstaged", "untracked":
		full, e := safeParent(root, file)
		if e != nil {
			return FileContent{}, e
		}
		info, e := os.Lstat(full)
		if e != nil {
			return FileContent{}, e
		}
		if info.Mode()&os.ModeSymlink != 0 {
			target, e := os.Readlink(full)
			data = []byte(target)
			err = e
		} else {
			if !info.Mode().IsRegular() {
				return FileContent{}, errors.New("requires a regular file")
			}
			f, e := os.Open(full)
			if e != nil {
				return FileContent{}, e
			}
			defer f.Close()
			data, err = io.ReadAll(io.LimitReader(f, 4*1024*1024+1))
		}
	default:
		return FileContent{}, errors.New("invalid file area")
	}
	if err != nil {
		return FileContent{}, err
	}
	if len(data) > 4*1024*1024 {
		return FileContent{}, errors.New("full file preview supports files up to 4 MiB")
	}
	content := FileContent{Binary: bytes.ContainsRune(data, 0) || !utf8.Valid(data)}
	if !content.Binary {
		content.Text = string(data)
	}
	content.ImageMIME = previewImageMIME(file, data)
	if content.ImageMIME != "" {
		content.ImageBase64 = base64.StdEncoding.EncodeToString(data)
	}
	return content, nil
}

// SVG is displayed as an img, never as inline markup. Other binary documents
// retain their existing notice instead of becoming active browser content.
func previewImageMIME(file string, data []byte) string {
	mime := http.DetectContentType(data)
	switch mime {
	case "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon":
		return mime
	}
	if !strings.EqualFold(filepath.Ext(file), ".svg") || !utf8.Valid(data) {
		return ""
	}
	decoder := xml.NewDecoder(bytes.NewReader(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})))
	for {
		token, err := decoder.Token()
		if err != nil {
			return ""
		}
		if root, ok := token.(xml.StartElement); ok {
			if root.Name.Local == "svg" && (root.Name.Space == "" || root.Name.Space == "http://www.w3.org/2000/svg") {
				return "image/svg+xml"
			}
			return ""
		}
	}
}
func (s *Service) Blame(path, file, revision string, options ...BlameOptions) ([]BlameLine, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return nil, err
	}
	if err = validatePaths([]string{file}); err != nil {
		return nil, err
	}
	if revision == "" {
		revision = "HEAD"
	}
	rev, err := s.revision(root, revision)
	if err != nil {
		return nil, err
	}
	data, err := s.diffBlob(root, rev, file)
	if err != nil {
		return nil, err
	}
	if bytes.ContainsRune(data, 0) || !utf8.Valid(data) {
		return nil, errors.New("blame requires a text file")
	}
	opts := BlameOptions{IgnoreWhitespace: true}
	if len(options) > 0 {
		opts = options[0]
	}
	out, err := s.run(root, "", blameArgs(rev, file, opts)...)
	if err != nil {
		return nil, err
	}
	return parseBlame(out, len(data) > 0)
}

func parseBlame(out string, nonempty bool) ([]BlameLine, error) {
	result := []BlameLine{}
	line := BlameLine{}
	timestamp, timezone := "", "+0000"
	for _, record := range strings.Split(out, "\n") {
		if strings.HasPrefix(record, "\t") {
			seconds, err := strconv.ParseInt(timestamp, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid blame author time: %w", err)
			}
			zone, err := time.Parse("-0700", timezone)
			if err != nil {
				return nil, fmt.Errorf("invalid blame author timezone: %w", err)
			}
			_, offset := zone.Zone()
			line.Date = time.Unix(seconds, 0).In(time.FixedZone("", offset)).Format(time.RFC3339)
			line.Text = record[1:]
			result = append(result, line)
			continue
		}
		f := strings.Fields(record)
		if len(f) >= 3 && len(f[0]) >= 40 {
			n, e := strconv.Atoi(f[1])
			m, e2 := strconv.Atoi(f[2])
			if e == nil && e2 == nil {
				line = BlameLine{Hash: f[0], OriginalLine: n, Line: m}
				timestamp, timezone = "", "+0000"
				continue
			}
		}
		key, value, ok := strings.Cut(record, " ")
		if !ok {
			continue
		}
		switch key {
		case "author":
			line.Author = value
		case "author-mail":
			line.Email = strings.Trim(value, "<>")
		case "author-time":
			timestamp = value
		case "author-tz":
			timezone = value
		case "filename":
			line.OriginalPath = value
			if strings.HasPrefix(value, "\"") {
				decoded, err := strconv.Unquote(value)
				if err != nil {
					return nil, fmt.Errorf("invalid blame filename: %w", err)
				}
				line.OriginalPath = decoded
			}
		case "summary":
			line.Summary = value
		}
	}
	if len(result) == 0 && nonempty {
		return nil, fmt.Errorf("could not parse blame")
	}
	return result, nil
}
