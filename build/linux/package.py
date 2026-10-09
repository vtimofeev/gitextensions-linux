#!/usr/bin/env python3
"""Package the Linux binary, project sources and dependency license notices."""

import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build/bin/gitextensions-linux"
LEGAL_NAMES = {"LICENSE", "LICENCE", "NOTICE", "COPYING", "COPYRIGHT", "PATENTS"}


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True)


def json_documents(text):
    decoder = json.JSONDecoder()
    while text.strip():
        document, end = decoder.raw_decode(text.lstrip())
        yield document
        text = text.lstrip()[end:]


def notices(directory):
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.name.upper().split(".")[0] in LEGAL_NAMES
    )


def add_text(archive, name, text):
    data = text.encode("utf-8")
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    entry.mode = 0o644
    archive.addfile(entry, io.BytesIO(data))


def main():
    if not BIN.is_file():
        raise SystemExit("Run wails build before packaging.")
    build_info = run("go", "version", "-m", str(BIN))
    dependencies = {}
    architecture = None
    for line in build_info.splitlines():
        fields = line.split()
        if fields and fields[0] == "dep":
            dependencies[(fields[1], fields[2])] = None
        if len(fields) == 2 and fields[0] == "build" and fields[1].startswith("GOARCH="):
            architecture = fields[1].split("=", 1)[1]
    if architecture is None or "GOOS=linux" not in build_info:
        raise SystemExit("Expected a Linux Go binary with build metadata.")

    license_files = {}
    module_names = [name for name, version in dependencies]
    for module in json_documents(run("go", "list", "-m", "-json", *module_names)):
        key = (module["Path"], module.get("Version", ""))
        if key not in dependencies:
            continue
        directory = Path(module.get("Dir", ""))
        if not module.get("Dir") or not notices(directory):
            raise SystemExit(f"Missing license files for {key[0]} {key[1]}")
        dependencies[key] = directory
        for path in notices(directory):
            license_files[f"licenses/go/{key[0]}@{key[1]}/{path.name}"] = path
    if any(directory is None for directory in dependencies.values()):
        raise SystemExit("The binary dependencies do not match the current Go module graph.")
    license_files["licenses/go/stdlib/LICENSE"] = Path(run("go", "env", "GOROOT").strip()) / "LICENSE"

    lock = json.loads((ROOT / "frontend/package-lock.json").read_text())
    for name, package in lock["packages"].items():
        if not name or package.get("dev"):
            continue
        directory = ROOT / "frontend" / name
        if not directory.is_dir():
            if package.get("optional"):
                continue
            raise SystemExit(f"Missing npm dependency {name}; run npm ci in frontend.")
        legal = notices(directory)
        if not legal:
            raise SystemExit(f"Missing license files for {name}")
        installed = json.loads((directory / "package.json").read_text())
        if installed.get("version") != package.get("version"):
            raise SystemExit(f"Dependency version mismatch for {name}; run npm ci.")
        label = f"{installed['name']}@{installed['version']}"
        for path in legal:
            license_files[f"licenses/npm/{label}/{path.name}"] = path

    manifest = run("git", "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    root_files = {".gitignore", "AGENTS.md", "README.md", "NOTICE.md", "LICENSE.md", "go.mod", "go.sum", "wails.json"}
    root_files.update(path.name for path in ROOT.glob("*.ru.md"))
    sources = []
    for name in sorted(set(manifest.split("\0")) - {""}):
        path = ROOT / name
        allowed = (
            name in root_files
            or ("/" not in name and name.endswith(".go"))
            or name.startswith(("internal/", "frontend/", "build/linux/", "docs/"))
            or name == "build/appicon.png"
        )
        if allowed and path.is_file() and name != "frontend/package.json.md5":
            sources.append(name)
    for required in ("AGENTS.md", "NOTICE.md", "main.go", "go.mod", "frontend/package-lock.json", "build/linux/package.py"):
        if required not in sources:
            raise SystemExit(f"Missing source file: {required}")

    output = BIN.with_name(f"gitextensions-linux-{architecture}.tar.gz")
    temporary = output.with_suffix(".tmp")
    try:
        with tarfile.open(temporary, "w:gz") as archive:
            release_files = {
                "build/bin/gitextensions-linux": "gitextensions-linux",
                "build/linux/install.sh": "install.sh",
                "build/linux/gitextensions-linux.desktop": "assets/gitextensions-linux.desktop",
                "build/appicon.png": "assets/appicon.png",
                "frontend/public/appicon.svg": "assets/appicon.svg",
            }
            for name in ("docs/linux-install.md", "docs/linux-install.ru.md", "docs/user-guide.md", "docs/user-guide.ru.md", "docs/commit-graph.md", "docs/commit-graph.ru.md", "NOTICE.md", "NOTICE.ru.md", "LICENSE.md"):
                release_files[name] = name
            for name, destination in release_files.items():
                archive.add(ROOT / name, arcname=destination)
            add_text(archive, "README.md", """# Git Extensions Linux

English | [Русский](README.ru.md)

From this extracted folder, install without sudo:

```sh
./install.sh
```

Then launch **Git Extensions Linux** from the application menu.
The executable is installed to `~/.local/bin/gitextensions-linux`.
You can also run `./gitextensions-linux` directly from this folder.
Go and Node.js are not needed.

Install the required system libraries for your release: [Linux installation guide](docs/linux-install.md).
For everyday use, see the [user guide](docs/user-guide.md).

`assets/` contains installer icons and the menu launcher. `source/` contains the matching project sources for rebuilding.
Keep the sources and license notices with the release when sharing it.
See [credits](NOTICE.md), [license](LICENSE.md) and `licenses/` for dependency notices.
""")
            add_text(archive, "README.ru.md", """# Git Extensions Linux

[English](README.md) | Русский

Из распакованной папки установите приложение без sudo:

```sh
./install.sh
```

Затем запустите **Git Extensions Linux** из меню приложений.
Бинарник устанавливается в `~/.local/bin/gitextensions-linux`.
Можно также запустить `./gitextensions-linux` прямо из этой папки.
Go и Node.js не нужны.

Установите системные библиотеки для вашей сборки: [инструкция для Linux](docs/linux-install.ru.md).
Работа с приложением описана в [руководстве пользователя](docs/user-guide.ru.md).

В `assets/` находятся иконки и ярлык меню для установщика. В `source/` — соответствующие сборке исходники для пересборки.
При передаче релиза сохраняйте исходники и лицензионные уведомления.
См. [атрибуцию](NOTICE.ru.md), [лицензию](LICENSE.md) и уведомления зависимостей в `licenses/`.
""")
            for name in sources:
                archive.add(ROOT / name, arcname=f"source/{name}")
            for name, path in sorted(license_files.items()):
                archive.add(path, arcname=name)
            add_text(archive, "licenses/INDEX.md", "# Dependency notices\n\n" + "\n".join(f"- {name}" for name in sorted(license_files)) + "\n")
            checksums = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources}
            checksums["build/bin/gitextensions-linux"] = hashlib.sha256(BIN.read_bytes()).hexdigest()
            add_text(archive, "source-manifest.json", json.dumps(checksums, indent=2) + "\n")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Created {output}\n{len(sources)} source files; {len(license_files)} dependency notices.")


if __name__ == "__main__":
    main()
