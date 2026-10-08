package gitclient

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileContentImageVersions(t *testing.T) {
	p := repository(t)
	s := NewService()
	makePNG := func(red uint8) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
		img.Set(0, 0, color.NRGBA{R: red, A: 255})
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}
	committed, indexed, working := makePNG(10), makePNG(20), makePNG(30)
	save := func(data []byte) {
		if err := os.WriteFile(filepath.Join(p, "picture.png"), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	save(committed)
	git(t, p, "add", ".")
	git(t, p, "commit", "-m", "image")
	save(indexed)
	git(t, p, "add", ".")
	save(working)
	for _, tc := range []struct {
		area string
		data []byte
	}{
		{"commit", committed}, {"staged", indexed}, {"unstaged", working}, {"untracked", working},
	} {
		t.Run(tc.area, func(t *testing.T) {
			content, err := s.FileContent(p, "picture.png", tc.area, "HEAD")
			if err != nil {
				t.Fatal(err)
			}
			data, err := base64.StdEncoding.DecodeString(content.ImageBase64)
			if err != nil || !bytes.Equal(data, tc.data) || content.ImageMIME != "image/png" || !content.Binary || content.Text != "" {
				t.Fatalf("wrong image version: %#v %v", content, err)
			}
		})
	}
	// The source is preserved verbatim, including Unicode, for the SVG source tab.
	svg := `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><title>Пример</title></svg>`
	write(t, p, "vector.SVG", svg)
	content, err := s.FileContent(p, "vector.SVG", "untracked", "")
	if err != nil || content.Binary || content.Text != svg || content.ImageMIME != "image/svg+xml" || content.ImageBase64 != base64.StdEncoding.EncodeToString([]byte(svg)) {
		t.Fatalf("SVG: %#v %v", content, err)
	}
	// An image-looking symlink must still show the link target, not read outside the repository.
	if err := os.Symlink("/tmp/external.png", filepath.Join(p, "link.png")); err != nil {
		t.Fatal(err)
	}
	content, err = s.FileContent(p, "link.png", "untracked", "")
	if err != nil || content.Text != "/tmp/external.png" || content.ImageMIME != "" {
		t.Fatalf("symlink: %#v %v", content, err)
	}
	if _, err = s.FileContent(p, "../external.png", "untracked", ""); err == nil {
		t.Fatal("accepted traversal")
	}
	// The existing bound applies to both local images and stored Git blobs.
	save(append(working, make([]byte, 4*1024*1024)...))
	git(t, p, "add", "picture.png")
	git(t, p, "commit", "-m", "oversized")
	for _, area := range []string{"unstaged", "staged", "commit"} {
		if _, err := s.FileContent(p, "picture.png", area, "HEAD"); err == nil || !strings.Contains(err.Error(), "4 MiB") {
			t.Fatalf("%s size limit: %v", area, err)
		}
	}
}

func TestPreviewImageMIME(t *testing.T) {
	for _, tc := range []struct{ name, data, mime string }{
		{"x.svg", `<svg xmlns="http://www.w3.org/2000/svg"/>`, "image/svg+xml"},
		{"x.SVG", "\xef\xbb\xbf<!-- logo -->\n<svg/>", "image/svg+xml"},
		{"x.svg", `<html><script>alert(1)</script></html>`, ""},
		{"x.svg", `<svg xmlns="urn:other"/>`, ""},
		{"x.svg", "not XML", ""},
		{"x.html", `<svg/>`, ""},
		{"x.png", "plain text", ""},
		{"x.png", "%PDF-1.0", ""},
		{"x.gif", "GIF89a\x01\x00\x01\x00", "image/gif"},
		{"x.jpg", "\xff\xd8\xff\xe0", "image/jpeg"},
		{"x.webp", "RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"},
		{"x.bmp", "BM\x00\x00", "image/bmp"},
		{"x.ico", "\x00\x00\x01\x00", "image/x-icon"},
	} {
		t.Run(tc.name+tc.data, func(t *testing.T) {
			if got := previewImageMIME(tc.name, []byte(tc.data)); got != tc.mime {
				t.Fatalf("got %q, want %q", got, tc.mime)
			}
		})
	}
}
