//go:build linux && cgo

package main

/*
#cgo pkg-config: glib-2.0
#include <glib.h>

static void setApplicationIdentity(void) {
    g_set_prgname("gitextensions-linux");
    g_set_application_name("Git Extensions Linux");
}
*/
import "C"

func init() {
	// Wails 2 sets ProgramName after creating the GTK window. Set it before GTK
	// initializes, so X11 WM_CLASS and Wayland app_id match our desktop file.
	C.setApplicationIdentity()
}
