package gitclient

import (
	"context"
	"errors"
	"os/exec"
	"strings"
)

func (s *Service) Identity(path string) (Identity, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.root(path)
	if err != nil {
		return Identity{}, err
	}
	result := Identity{Scope: "none"}
	read := func(key string, local bool) (string, string, error) {
		args := []string{"config", "--show-scope", "--get", key}
		if local {
			args = []string{"config", "--local", "--get", key}
		}
		// Run directly (not via s.run) to tell "unset" (exit 1) from real failures.
		ctx, cancel := context.WithTimeout(context.Background(), gitTimeout("config"))
		defer cancel()
		cmd := gitCommand(ctx, root, args...)
		out, err := cmd.Output()
		if err != nil {
			var exit *exec.ExitError
			if errors.As(err, &exit) && exit.ExitCode() == 1 {
				return "", "none", nil
			}
			return "", "", err
		}
		value := strings.TrimSuffix(string(out), "\n")
		if local {
			return value, "local", nil
		}
		scope, value, ok := strings.Cut(value, "\t")
		if !ok {
			return "", "", errors.New("invalid git config scope")
		}
		// Git's command/worktree scopes are repository-specific as well.
		if scope == "command" || scope == "worktree" {
			scope = "local"
		}
		return value, scope, nil
	}
	result.Name, result.Scope, err = read("user.name", false)
	if err != nil {
		return result, err
	}
	var scope string
	result.Email, scope, err = read("user.email", false)
	if err != nil {
		return result, err
	}
	if result.Scope == "none" || scope == "local" {
		result.Scope = scope
	}
	name, _, err := read("user.name", true)
	if err != nil {
		return result, err
	}
	email, _, err := read("user.email", true)
	if err != nil {
		return result, err
	}
	result.LocalName, result.LocalEmail = name != "", email != ""
	return result, nil
}
func (s *Service) SetIdentity(path, name, email string) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if strings.TrimSpace(name) == "" || strings.TrimSpace(email) == "" || strings.ContainsAny(name+email, "\r\n") || !strings.Contains(email, "@") {
			return "", errors.New("identity requires a name and an email containing @, without newlines")
		}
		if _, err := s.run(root, "", "config", "--local", "user.name", name); err != nil {
			return "", err
		}
		return s.run(root, "", "config", "--local", "user.email", email)
	})
}
