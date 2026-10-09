# User guide

English | [Русский](user-guide.ru.md)

Install the app using the [Linux installation guide](linux-install.md), then launch **Git Extensions Linux** from the application menu.

## Open a repository

Press `Ctrl+O` and select an existing Git repository. You can also launch the app with a repository path:

```sh
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

Clone or initialize repositories with Git before opening them; the app has no clone/init screen yet.

## Browse history and changes

Select a commit in the graph to inspect its changed files and diffs. Use search and the author filter to narrow the history. File history and blame help track earlier changes.

Open local changes to review edits and stage or unstage whole files. Enter a commit message, then press `Ctrl+Enter` to commit or `Ctrl+Shift+Enter` to commit and push.

Use the branch menu (`Ctrl+B`) for branch operations. Fetch, pull and push use your system Git settings, SSH agent and credential helpers.

## Settings and shortcuts

Open settings with `Ctrl+,` to choose a theme, UI language and Git identity. The command palette (`Ctrl+K`) provides quick access to actions.

Images support Fit, 100% and zoom with `Ctrl` + mouse wheel or the `+` / `−` buttons. SVG files can switch between image and source views.

Errors appear above other windows at the bottom of the app; close them with ×. Conflict resolution uses external merge tools; there is no built-in conflict editor yet.

## Update

Close the app, extract the new release and run `./install.sh` again. See the [installation guide](linux-install.md) for desktop shortcuts and uninstall instructions.
