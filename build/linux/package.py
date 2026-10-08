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
            for name in ("build/bin/gitextensions-linux", "build/appicon.png", "build/linux", "frontend/public/appicon.svg", "docs/linux-install.md", "docs/linux-install.ru.md", "README.md", "README.ru.md", "NOTICE.md", "NOTICE.ru.md", "LICENSE.md"):
                archive.add(ROOT / name, arcname=name)
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
