package main

import (
	"embed"
	"flag"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	repo := flag.String("repo", "", "repository path")
	flag.Parse()
	if *repo == "" && flag.NArg() > 0 {
		*repo = flag.Arg(0)
	}
	app := NewApp(*repo)
	err := wails.Run(&options.App{
		Title: "Git Extensions Linux", Width: 1440, Height: 960, MinWidth: 900, MinHeight: 650,
		AssetServer: &assetserver.Options{Assets: assets},
		Linux: &linux.Options{
			Icon: appIcon, ProgramName: "gitextensions-linux",
			WebviewGpuPolicy: linux.WebviewGpuPolicyNever,
		},
		OnStartup: app.startup, Bind: []interface{}{app},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
