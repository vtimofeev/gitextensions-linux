# User guide

English | [Русский](user-guide.ru.md)

Install the app using the [Linux installation guide](linux-install.md), then launch **Git Extensions Linux** from the application menu.

## Open a repository

Press `Ctrl+O` and select an existing Git repository. You can also launch the app with a repository path:

```sh
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

The app restores the last active repository on startup. A repository path passed at launch takes priority.

Clone or initialize repositories with Git before opening them; the app has no clone/init screen yet.

## Browse history and changes

Select a commit in the graph to inspect its changed files and diffs. Use search and the author filter to narrow the history. File history and blame help track earlier changes.

Changed files are grouped in a directory tree. Collapse folders to focus on filenames and drag the separator to adjust the tree width. Preview actions sit on the left, with the selected path on the right. Single-child directory chains share a row, such as `one/two/three`; narrow rows shorten the middle while keeping the final folder name visible. Up/Down arrows open the previous/next file directly, skipping folder rows and expanding its path when needed. Use the previous/next file buttons or `Alt+PageUp` / `Alt+PageDown` in the diff panel to switch files. The diff has previous/next change buttons and `Shift+F7` / `F7` shortcuts for moving between change blocks.

Synchronized local and tracking branches share a label in the graph. The current branch name and its remote stay fully visible; long names can be viewed by scrolling the graph horizontally. Right-click the branch name or the remote part for its actions.

Open local changes to review edits and stage or unstage whole files. Enter a commit message, then press `Ctrl+Enter` to commit or `Ctrl+Shift+Enter` to commit and push.

Collapse the local branches, Staged or Unstaged blocks using their heading arrows. Drag the separators to resize panels; sizes and collapsed states are remembered. The refresh icon beside Staged updates file status in both lists without reloading history. Staged and Unstaged files have one icon for their file type, with status shown by its color and tooltip.

Use the branch menu (`Ctrl+B`) for branch operations. Fetch, pull and push use your system Git settings, SSH agent and credential helpers.

## Settings and shortcuts

Open settings with `Ctrl+,` to choose a theme, UI language and Git identity. The command palette (`Ctrl+K`) provides quick access to actions.

In blame, use **Show date** and **Show time** to choose full timestamps, dates only or author information without dates. These choices are remembered.

Images support Fit, 100% and zoom with `Ctrl` + mouse wheel or the `+` / `−` buttons. SVG files can switch between image and source views.

Errors appear above other windows at the bottom of the app; close them with ×. Conflict resolution uses external merge tools; there is no built-in conflict editor yet.

## Update

Close the app, extract the new release and run `./install.sh` again. See the [installation guide](linux-install.md) for desktop shortcuts and uninstall instructions.
