package gitclient

import (
	"errors"
	"strings"
)

type nameStatusChange struct {
	Kind         string
	Path         string
	OriginalPath string
}

// Git's -z name-status records keep every path literal, including whitespace.
// A rename/copy consumes two paths; other statuses consume exactly one.
func parseNameStatus(out string) ([]nameStatusChange, error) {
	changes := []nameStatusChange{}
	if out == "" {
		return changes, nil
	}
	if !strings.HasSuffix(out, "\x00") {
		return nil, errors.New("unterminated name-status output")
	}
	fields := strings.Split(strings.TrimSuffix(out, "\x00"), "\x00")
	for len(fields) > 0 {
		change, consumed, err := parseNameStatusRecord(fields)
		if err != nil {
			return nil, err
		}
		changes = append(changes, change)
		fields = fields[consumed:]
	}
	return changes, nil
}

func parseNameStatusRecord(fields []string) (nameStatusChange, int, error) {
	if len(fields) < 2 || fields[1] == "" {
		return nameStatusChange{}, 0, errors.New("missing name-status path")
	}
	kind := fields[0]
	if kind == "" || !strings.ContainsRune("ACDMRTUXB", rune(kind[0])) {
		return nameStatusChange{}, 0, errors.New("invalid name-status kind")
	}
	for _, digit := range kind[1:] {
		if digit < '0' || digit > '9' {
			return nameStatusChange{}, 0, errors.New("invalid name-status score")
		}
	}
	change := nameStatusChange{Kind: kind, Path: fields[1]}
	if kind[0] == 'R' || kind[0] == 'C' {
		if len(fields) < 3 || fields[2] == "" {
			return nameStatusChange{}, 0, errors.New("missing rename/copy destination")
		}
		change.OriginalPath, change.Path = change.Path, fields[2]
		return change, 3, nil
	}
	return change, 2, nil
}

// Metadata always starts with an object ID, and a status starts with a letter.
// Paths are consumed by their status, so even a hash-shaped filename is literal.
func parseFileHistory(out, file string) ([]FileRevision, error) {
	result := []FileRevision{}
	if out == "" {
		return result, nil
	}
	if !strings.HasSuffix(out, "\x00") {
		return nil, errors.New("unterminated file history")
	}
	fields := strings.Split(strings.TrimSuffix(out, "\x00"), "\x00")
	for len(fields) > 0 {
		if len(fields) < 7 || !isObjectID(fields[0]) {
			return nil, errors.New("invalid file history metadata")
		}
		commits, err := parseLog(strings.Join(fields[:7], "\x00") + "\x00")
		if err != nil {
			return nil, err
		}
		entry := FileRevision{Commit: commits[0], File: file}
		fields = fields[7:]
		for len(fields) > 0 && !isObjectID(fields[0]) {
			// Git separates its pretty format from the first name-status with LF.
			fields[0] = strings.TrimPrefix(fields[0], "\n")
			change, consumed, err := parseNameStatusRecord(fields)
			if err != nil {
				return nil, err
			}
			if change.Kind[0] == 'R' && change.Path == file {
				entry.OriginalPath = change.OriginalPath
				file = change.OriginalPath
			}
			fields = fields[consumed:]
		}
		result = append(result, entry)
	}
	return result, nil
}

func isObjectID(value string) bool {
	if len(value) != 40 && len(value) != 64 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}
