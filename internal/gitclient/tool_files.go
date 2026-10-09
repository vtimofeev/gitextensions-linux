package gitclient

import (
	"errors"
	"io"
	"os"
	"syscall"
)

// A tool can replace its output while it is open. Check the opened descriptor,
// reject symlinks/FIFOs, and bound reads even if the file grows after stat.
func readToolFile(path string) ([]byte, error) {
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("external tools require a regular file")
	}
	const limit = 4 * 1024 * 1024
	if info.Size() > limit {
		return nil, errors.New("file versions above 4 MiB are not supported")
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > limit {
		return nil, errors.New("file versions above 4 MiB are not supported")
	}
	return data, nil
}
