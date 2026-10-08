package gitclient

import (
	"errors"
	"strconv"
	"strings"
)

// RefOptions describes one explicit, reviewable Git action. No shell commands are accepted.
type RefOptions struct {
	Action       string `json:"action"`
	Target       string `json:"target"`
	Name         string `json:"name"`
	Mode         string `json:"mode"`
	Message      string `json:"message"`
	Remote       bool   `json:"remote"`
	Detach       bool   `json:"detach"`
	NoCommit     bool   `json:"noCommit"`
	Squash       bool   `json:"squash"`
	RecordOrigin bool   `json:"recordOrigin"`
	Mainline     int    `json:"mainline"`
	RebaseMerges bool   `json:"rebaseMerges"`
	Force        bool   `json:"force"`
	Checkout     bool   `json:"checkout"`
	TagType      string `json:"tagType"`
	Push         bool   `json:"push"`
	RemoteName   string `json:"remoteName"`
}

func (s *Service) RefAction(path string, opts RefOptions) (string, error) {
	return s.mutation(path, func(root string) (string, error) {
		if opts.Action == "continue" || opts.Action == "abort" || opts.Action == "skip" {
			operation, err := s.activeOperation(root)
			if err != nil {
				return "", err
			}
			if operation == "" {
				return "", errors.New("no operation in progress")
			}
			if opts.Action == "skip" && operation == "merge" {
				return "", errors.New("merge cannot skip a commit")
			}
			return s.run(root, "", operation, "--"+opts.Action)
		}
		if operation, err := s.activeOperation(root); err != nil {
			return "", err
		} else if operation != "" {
			return "", errors.New("finish or abort the current " + operation + " first")
		}
		if opts.Action == "create-tag" || opts.Action == "delete-tag" {
			return s.tagAction(root, opts)
		}
		// Resolve an exact local/remote ref for branch-only operations, and an object ID for commit actions.
		ref := opts.Target
		if opts.Action == "checkout" && !opts.Detach || opts.Action == "rename" || opts.Action == "delete" {
			prefix := "refs/heads/"
			if opts.Remote {
				prefix = "refs/remotes/"
			}
			if err := s.branchName(root, opts.Target); err != nil {
				return "", err
			}
			ref = prefix + opts.Target
		}
		revision, err := s.revision(root, ref)
		if err != nil {
			return "", err
		}
		switch opts.Action {
		case "checkout":
			if opts.Detach {
				return s.run(root, "", "switch", "--detach", revision)
			}
			if opts.Remote {
				if err := s.branchName(root, opts.Name); err != nil {
					return "", err
				}
				return s.run(root, "", "switch", "-c", opts.Name, "--track", ref)
			}
			return s.run(root, "", "switch", "--no-guess", "--", opts.Target)
		case "create":
			if err := s.branchName(root, opts.Name); err != nil {
				return "", err
			}
			if opts.Checkout {
				return s.run(root, "", "switch", "-c", opts.Name, revision)
			}
			return s.run(root, "", "branch", opts.Name, revision)
		case "rename", "delete":
			if opts.Remote {
				return "", errors.New("select a local branch")
			}
			if opts.Action == "rename" {
				if err := s.branchName(root, opts.Name); err != nil {
					return "", err
				}
				return s.run(root, "", "branch", "-m", "--", opts.Target, opts.Name)
			}
			flag := "-d"
			if opts.Force {
				flag = "-D"
			}
			return s.run(root, "", "branch", flag, "--", opts.Target)
		case "merge":
			flags := map[string]string{"ff": "--ff", "ff-only": "--ff-only", "no-ff": "--no-ff"}
			flag, ok := flags[opts.Mode]
			if !ok {
				return "", errors.New("invalid merge mode")
			}
			if opts.Squash && opts.Mode != "ff" {
				return "", errors.New("squash requires the default fast-forward mode")
			}
			args := []string{"merge", "--no-edit", flag}
			if opts.Squash {
				args = append(args, "--squash")
			}
			if opts.NoCommit {
				args = append(args, "--no-commit")
			}
			if strings.TrimSpace(opts.Message) != "" {
				args = append(args, "-m", opts.Message)
			}
			return s.run(root, "", append(args, revision)...)
		case "rebase":
			args := []string{"rebase"}
			if opts.RebaseMerges {
				args = append(args, "--rebase-merges")
			}
			return s.run(root, "", append(args, revision)...)
		case "cherry-pick", "revert":
			if opts.Mainline < 0 || opts.Mainline > 1000 {
				return "", errors.New("invalid mainline parent")
			}
			parents, err := s.run(root, "", "rev-list", "--parents", "-n", "1", revision)
			if err != nil {
				return "", err
			}
			count := len(strings.Fields(parents)) - 1
			if count > 1 && (opts.Mainline < 1 || opts.Mainline > count) {
				return "", errors.New("select a mainline parent for this merge commit")
			}
			if count <= 1 && opts.Mainline != 0 {
				return "", errors.New("mainline applies only to merge commits")
			}
			args := []string{opts.Action}
			if opts.Action == "revert" {
				args = append(args, "--no-edit")
			}
			if opts.NoCommit {
				args = append(args, "--no-commit")
			}
			if opts.RecordOrigin && opts.Action == "cherry-pick" {
				args = append(args, "-x")
			}
			if opts.Mainline > 0 {
				args = append(args, "--mainline", strconv.Itoa(opts.Mainline))
			}
			return s.run(root, "", append(args, revision)...)
		default:
			return "", errors.New("unsupported reference action")
		}
	})
}

func (s *Service) tagAction(root string, opts RefOptions) (string, error) {
	name := opts.Name
	if opts.Action == "delete-tag" {
		name = opts.Target
	}
	if name == "" || strings.HasPrefix(name, "-") {
		return "", errors.New("invalid tag name")
	}
	if _, err := s.run(root, "", "check-ref-format", "refs/tags/"+name); err != nil {
		return "", err
	}
	if opts.Push {
		remotes, err := s.run(root, "", "remote")
		if err != nil {
			return "", err
		}
		found := false
		for _, remote := range strings.Split(strings.TrimSpace(remotes), "\n") {
			if remote == opts.RemoteName && remote != "" && !strings.HasPrefix(remote, "-") {
				found = true
			}
		}
		if !found {
			return "", errors.New("select a configured remote")
		}
	}
	args := []string{"tag"}
	if opts.Action == "delete-tag" {
		args = append(args, "-d", "--", name)
	} else {
		revision, err := s.revision(root, opts.Target)
		if err != nil {
			return "", err
		}
		if opts.Force {
			args = append(args, "-f")
		}
		switch opts.TagType {
		case "", "lightweight":
			if strings.TrimSpace(opts.Message) != "" {
				args = append(args, "--no-sign", "-a", "-m", opts.Message)
			}
			if strings.TrimSpace(opts.Message) == "" {
				args = append(args, "--no-sign")
			}
		case "annotated", "signed":
			if strings.TrimSpace(opts.Message) == "" {
				return "", errors.New("annotated and signed tags require a message")
			}
			flag := "-a"
			if opts.TagType == "annotated" {
				args = append(args, "--no-sign")
			}
			if opts.TagType == "signed" {
				flag = "-s"
			}
			args = append(args, flag, "-m", opts.Message)
		default:
			return "", errors.New("invalid tag type")
		}
		args = append(args, "--", name, revision)
	}
	out, err := s.run(root, "", args...)
	if err != nil || !opts.Push {
		return out, err
	}
	push := []string{"push"}
	if opts.Force && opts.Action == "create-tag" {
		push = append(push, "-f")
	}
	ref := "refs/tags/" + name
	if opts.Action == "delete-tag" {
		ref = ":" + ref
	}
	pushed, err := s.run(root, "", append(push, opts.RemoteName, ref)...)
	if err != nil {
		return out + pushed, errors.New("local tag action succeeded; remote push failed: " + err.Error())
	}
	return out + pushed, nil
}
