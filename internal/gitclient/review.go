package gitclient

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unicode"
	"unicode/utf8"
)

type ReviewOptions struct {
	Tool         string `json:"tool"`
	Executable   string `json:"executable"`
	Template     string `json:"template"`
	Terminal     string `json:"terminal"`
	Commit       string `json:"commit"`
	Instructions string `json:"instructions"`
	Details      string `json:"details"`
	Prompt       string `json:"prompt"`
}

// Every tool starts an interactive chat seeded with the review prompt, so the
// user can follow up on findings. (codex review is one-shot; it stays available
// as a custom template, and then the terminal waits for Enter before closing.)
var reviewTemplates = map[string]string{
	"codex":    `codex -- "{prompt}"`,
	"claude":   `claude "--append-system-prompt={instructions}" -- "{prompt}"`,
	"qwen":     `qwen -i "{prompt}"`,
	"opencode": `opencode --prompt "{prompt}"`,
}

func composeReviewPrompt(root, instructions, details string, commit *Commit) string {
	target := "Uncommitted changes\nInspect it with: git diff HEAD; git status"
	if commit != nil {
		target = fmt.Sprintf("Commit: %s — %s   (%s, %s)\nInspect it with: git show --stat --patch %s", commit.Hash, commit.Subject, commit.Author, commit.Date, commit.Hash)
	}
	if strings.TrimSpace(details) == "" {
		details = "None provided"
	}
	return instructions + "\n\n## Target\nRepository: " + root + "\n" + target + "\n\n## Task details\n" + details
}

// Parse quotes/escapes before replacement. This is an argv lexer, never a shell:
// $, backticks, pipes and semicolons remain literal arguments.
func parseReviewTemplate(template string) ([]string, error) {
	args := []string{}
	var word strings.Builder
	var quote rune
	escaped, started := false, false
	for _, ch := range template {
		if ch == 0 {
			return nil, errors.New("command template contains NUL")
		}
		if escaped {
			word.WriteRune(ch)
			escaped = false
			started = true
			continue
		}
		if ch == '\\' && quote != '\'' {
			escaped = true
			started = true
			continue
		}
		if quote != 0 {
			if ch == quote {
				quote = 0
			} else {
				word.WriteRune(ch)
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			quote = ch
			started = true
			continue
		}
		if unicode.IsSpace(ch) {
			if started {
				args = append(args, word.String())
				word.Reset()
				started = false
			}
		} else {
			word.WriteRune(ch)
			started = true
		}
	}
	if escaped || quote != 0 {
		return nil, errors.New("unclosed quote or escape in command template")
	}
	if started {
		args = append(args, word.String())
	}
	if len(args) == 0 || args[0] == "" {
		return nil, errors.New("empty command template")
	}
	return args, nil
}
func reviewArgv(template string, values map[string]string) ([]string, error) {
	args, err := parseReviewTemplate(template)
	if err != nil {
		return nil, err
	}
	replacements := []string{}
	for key, value := range values {
		replacements = append(replacements, "{"+key+"}", value)
	}
	replacer := strings.NewReplacer(replacements...)
	for i := range args {
		args[i] = replacer.Replace(args[i]) // one pass: placeholders in user text stay literal
		if strings.ContainsRune(args[i], 0) {
			return nil, errors.New("review argument contains NUL")
		}
	}
	return args, nil
}

var reviewTerminals = [][]string{
	{"x-terminal-emulator", "-e"}, {"gnome-terminal", "--"}, {"konsole", "-e"},
	{"kitty"}, {"alacritty", "-e"}, {"wezterm", "start", "--"}, {"xterm", "-e"},
}

func terminalArgv(setting string, command []string) ([][]string, error) {
	if setting != "" && setting != "auto" {
		args, err := parseReviewTemplate(setting)
		if err != nil {
			return nil, err
		}
		result := []string{}
		count := 0
		for _, arg := range args {
			if arg == "{command}" {
				result = append(result, command...)
				count++
			} else {
				if strings.Contains(arg, "{command}") {
					return nil, errors.New("{command} must be a separate terminal argument")
				}
				result = append(result, arg)
			}
		}
		if count != 1 || args[0] == "{command}" {
			return nil, errors.New("terminal template needs exactly one {command} argument after the executable")
		}
		return [][]string{result}, nil
	}
	candidates := [][]string{}
	for _, terminal := range reviewTerminals {
		if binary, err := exec.LookPath(terminal[0]); err == nil {
			args := append([]string{binary}, terminal[1:]...)
			candidates = append(candidates, append(args, command...))
		}
	}
	if len(candidates) == 0 {
		return nil, errors.New("no external terminal found; configure Terminal in Code review settings")
	}
	return candidates, nil
}

const reviewArgLimit = 100 * 1024

func reviewArgsSize(args []string) int {
	size := 0
	for _, arg := range args {
		size += len(arg) + 1
	}
	return size
}

func (s *Service) StartReview(path string, opts ReviewOptions) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		template, known := reviewTemplates[opts.Tool]
		if !known {
			return "", errors.New("choose a code review tool")
		}
		var commit *Commit
		if opts.Commit != "" && opts.Commit != "uncommitted" {
			rev, err := s.revision(root, opts.Commit)
			if err != nil {
				return "", err
			}
			out, err := s.run(root, "", "log", "-1", "-z", "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x00%ae", rev)
			if err != nil {
				return "", err
			}
			entries, err := parseLog(out)
			if err != nil || len(entries) != 1 {
				return "", errors.New("commit not found")
			}
			commit = &entries[0]
		}
		if opts.Template != "" {
			template = opts.Template
		}
		cache, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		directory := filepath.Join(cache, "gitextensions-linux", "reviews")
		if err = os.MkdirAll(directory, 0700); err != nil {
			return "", err
		}
		file, err := os.CreateTemp(directory, "prompt-*.txt") // CreateTemp uses 0600
		if err != nil {
			return "", err
		}
		promptFile := file.Name()
		started := false
		defer func() {
			if !started {
				_ = os.Remove(promptFile)
			}
		}()
		target, title := "uncommitted", ""
		if commit != nil {
			target, title = commit.Hash, commit.Subject
		}
		build := func() ([]string, string, error) {
			// Resolve repository and commit metadata here rather than trusting the UI preview.
			prompt := composeReviewPrompt(root, opts.Instructions, opts.Details, commit)
			args, e := reviewArgv(template, map[string]string{
				"target": target, "sha": target, "title": title,
				"instructions": opts.Instructions, "details": opts.Details,
				"instructionsAndDetails": opts.Instructions + "\n\nTask details:\n" + opts.Details,
				"prompt":                 prompt, "promptFile": promptFile,
			})
			// Let the terminal resolve the command in its own environment. A custom
			// template may use a wrapper rather than the selected tool's default name.
			if e == nil && opts.Executable != "" {
				if strings.ContainsRune(opts.Executable, 0) {
					return nil, prompt, errors.New("review executable contains NUL")
				}
				args[0] = opts.Executable
			}
			return args, prompt, e
		}
		args, prompt, err := build()
		if err != nil {
			_ = file.Close()
			return "", err
		}
		truncated := false
		for reviewArgsSize(args) > reviewArgLimit && len(opts.Details) > 0 {
			truncated = true
			// Shrink by bytes at a UTF-8 boundary; preserve the instructions and target.
			cut := len(opts.Details) / 2
			for cut > 0 && !utf8.RuneStart(opts.Details[cut]) {
				cut--
			}
			opts.Details = opts.Details[:cut]
			args, prompt, err = build()
			if err != nil {
				_ = file.Close()
				return "", err
			}
		}
		if reviewArgsSize(args) > reviewArgLimit {
			_ = file.Close()
			return "", errors.New("review instructions exceed 100 KB; shorten them or use a tool-supported {promptFile} template")
		}
		_, err = file.WriteString(prompt)
		closeErr := file.Close()
		if err != nil {
			return "", err
		}
		if closeErr != nil {
			return "", closeErr
		}
		if opts.Tool == "codex" && len(args) > 1 && args[1] == "review" {
			// Only fixed script text: every executable and prompt is a positional argv.
			args = append([]string{"bash", "-c", `"$@"; status=$?; echo; echo "[review finished: $status] Press Enter to close (continue with: codex resume --last)"; read -r`, "_"}, args...)
		}
		candidates, err := terminalArgv(opts.Terminal, args)
		if err != nil {
			return "", err
		}
		var launchErr error
		for _, argv := range candidates {
			cmd := exec.Command(argv[0], argv[1:]...)
			cmd.Dir = root
			cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
			if launchErr = cmd.Start(); launchErr != nil {
				continue
			}
			started = true
			// Reap without tying the terminal lifetime to Wails/app cancellation.
			// File templates can outlive terminal launchers (e.g. gnome-terminal), so
			// retain their private cache file until the user removes it.
			usesFile := strings.Contains(template, "{promptFile}")
			go func() {
				_ = cmd.Wait()
				if !usesFile {
					_ = os.Remove(promptFile)
				}
			}()
			if truncated {
				return "details-truncated", nil
			}
			return opts.Tool, nil
		}
		return "", fmt.Errorf("start review terminal: %w", launchErr)
	})
}
