# Code review in a terminal

English | [Русский](code-review.ru.md)

Open **Code review commit…** from the graph menu, or review uncommitted changes from the sidebar.
Choose Codex, Claude, Qwen or OpenCode, enter review instructions and task details, then press **Start review** or `Ctrl+Enter`.
The tool starts in a separate terminal in the repository folder. The app does not choose its model or manage its login.

All tools are selectable without a `PATH` check. Change the command or full executable path in **Settings → Code review**.
You can save instructions as the default. Task details are remembered for the repository and selected commit until the app closes.

## Templates

| Placeholder | Value |
| --- | --- |
| `{target}` | Commit SHA or `uncommitted` |
| `{instructions}` | Review instructions |
| `{details}` | Task details |
| `{prompt}` | Full request with the target and Git inspection instructions |
| `{promptFile}` | Path to a UTF-8 file containing the full request |

Quotes group arguments. Placeholders expand inside arguments. Shell expressions, pipes and environment variable expansion are not run.
A configured executable path replaces the template's first argument. Older supported placeholder names still work.

The terminal template must have one separate `{command}` argument, for example `gnome-terminal -- {command}` or `kitty {command}`.
Auto mode chooses an available terminal. Terminal launch errors appear in the app; tool errors appear in the terminal.

## Long requests

The request is also saved in a private file under `$XDG_CACHE_HOME/gitextensions-linux/reviews`, or the system user-cache folder.
If command arguments exceed 100 KiB, task details are shortened with a warning. Instructions are never silently shortened.
To pass the whole request, use `{promptFile}` with a file-input option supported by the tool itself.
Recent prompt files remain available to terminal sessions; files older than 30 days are removed when starting another review. You may delete them after the session ends.
