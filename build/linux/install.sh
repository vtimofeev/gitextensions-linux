#!/usr/bin/env bash
set -euo pipefail

app_id=gitextensions-linux
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -f "$script_dir/$app_id" ]]; then
  default_binary="$script_dir/$app_id"
  png_icon="$script_dir/assets/appicon.png"
  svg_icon="$script_dir/assets/appicon.svg"
  desktop_file="$script_dir/assets/$app_id.desktop"
else
  default_binary="$script_dir/../bin/$app_id"
  png_icon="$script_dir/../appicon.png"
  svg_icon="$script_dir/../../frontend/public/appicon.svg"
  desktop_file="$script_dir/$app_id.desktop"
fi
binary=${1:-"$default_binary"}
bin_dir="$HOME/.local/bin"
data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}
icons_dir="$data_dir/icons/hicolor"
launcher="$data_dir/applications/$app_id.desktop"

validate_paths() {
  if [[ ! -f "$binary" || ! -x "$binary" ]]; then
    printf 'Executable not found: %s\nBuild it with wails build first.\n' "$binary" >&2
    exit 1
  fi
  local path
  for path in "$HOME" "$data_dir"; do
    if [[ "$path" != /* || "$path" == *$'\n'* || "$path" == *$'\r'* ]]; then
      printf 'Installation paths must be absolute and contain no line breaks.\n' >&2
      exit 1
    fi
  done
}

install_files() {
  install -D -m 755 -- "$binary" "$bin_dir/$app_id"
  # Keep the icon name identical to the desktop ID and GTK program name.
  install -D -m 644 -- "$png_icon" "$icons_dir/256x256/apps/$app_id.png"
  install -D -m 644 -- "$svg_icon" "$icons_dir/scalable/apps/$app_id.svg"
  # The launcher expands HOME at startup; no generated Exec line is needed.
  install -D -m 644 -- "$desktop_file" "$launcher"
}

install_desktop_shortcut() {
  local desktop_dir
  desktop_dir=$(xdg-user-dir DESKTOP 2>/dev/null) || desktop_dir="$HOME/Desktop"
  desktop_dir=${desktop_dir:-"$HOME/Desktop"}
  if [[ "$desktop_dir" == "$HOME" || "$desktop_dir" != /* || "$desktop_dir" == *$'\n'* || "$desktop_dir" == *$'\r'* ]]; then
    printf 'Desktop shortcuts disabled; installed the menu launcher.\n'
    return
  fi

  local shortcut="$desktop_dir/$app_id.desktop"
  install -D -m 755 -- "$launcher" "$shortcut"
  printf 'Desktop shortcut: %s\n' "$shortcut"
  if ! gio set "$shortcut" metadata::trusted true 2>/dev/null; then
    printf 'Right-click the shortcut and select Allow Launching.\n'
  fi
}

refresh_caches() {
  if command -v update-desktop-database >/dev/null; then
    update-desktop-database "$data_dir/applications"
  fi
  if command -v gtk-update-icon-cache >/dev/null; then
    gtk-update-icon-cache -f -t "$icons_dir"
  fi
}

validate_paths
install_files
install_desktop_shortcut
refresh_caches
printf 'Installed: %s\nMenu launcher: %s\n' "$bin_dir/$app_id" "$launcher"
