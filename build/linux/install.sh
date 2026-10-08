#!/usr/bin/env bash
set -euo pipefail

app_id=gitextensions-linux
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
binary=${1:-"$script_dir/../bin/$app_id"}
bin_dir="$HOME/.local/bin"
data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}
icons_dir="$data_dir/icons/hicolor"
launcher="$data_dir/applications/$app_id.desktop"
png_icon="$script_dir/../appicon.png"
svg_icon="$script_dir/../../frontend/public/appicon.svg"

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
  local icon_hash icon_name
  icon_hash=$(cat -- "$png_icon" "$svg_icon" | sha256sum)
  icon_name="$app_id-${icon_hash:0:12}"

  install -D -m 755 -- "$binary" "$bin_dir/$app_id"
  # A new icon name makes GNOME reload the image when its contents change.
  install -D -m 644 -- "$png_icon" "$icons_dir/256x256/apps/$icon_name.png"
  install -D -m 644 -- "$svg_icon" "$icons_dir/scalable/apps/$icon_name.svg"
  # The launcher expands HOME at startup; no generated Exec line is needed.
  install -D -m 644 -- "$script_dir/$app_id.desktop" "$launcher"
  sed -i "s/^Icon=.*/Icon=$icon_name/" "$launcher"
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
  if command -v gtk-update-icon-cache >/dev/null && [[ -f "$icons_dir/index.theme" ]]; then
    gtk-update-icon-cache -f -t "$icons_dir"
  fi
}

validate_paths
install_files
install_desktop_shortcut
refresh_caches
printf 'Installed: %s\nMenu launcher: %s\n' "$bin_dir/$app_id" "$launcher"
