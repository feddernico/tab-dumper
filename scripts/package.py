"""Build a reproducible, allowlisted store ZIP and validate the shipped files."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--target", choices=["opera", "chrome"], default="opera")
target = parser.parse_args().target
manifest = json.loads((ROOT / "manifest.json").read_text())
if target == "chrome":
    manifest["icons"]["128"] = "assets/icons/chrome-icon-128.png"
version = manifest["version"]
assert re.fullmatch(r"(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}", version)
assert len(manifest["description"]) <= 132
assert manifest["name"] == "Tab Dumper"
assert manifest["incognito"] == "not_allowed"
assert json.loads((ROOT / "package.json").read_text())["version"] == version

files = [
    "manifest.json", "background.js", "archive.js", "db.js", "capture.js",
    "app.js", "archive.html", "help.html", "styles.css", "LICENSE",
    "assets/icons/icon.svg", "assets/fonts/LICENSE",
    "assets/fonts/source-sans-pro-regular.woff",
    "assets/fonts/source-sans-pro-semibold.woff",
    *manifest["icons"].values(),
]
if target == "chrome":
    files.append("PRIVACY.md")
for relative in files:
    assert (ROOT / relative).is_file(), f"Missing release file: {relative}"
for size, relative in manifest["icons"].items():
    data = (ROOT / relative).read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (int(size), int(size))
    assert data[28] == 0, f"PNG must not be interlaced: {relative}"
for file in files:
    if file.endswith(".js"):
        content = (ROOT / file).read_text()
        for dependency in re.findall(r'from\s+["\'](\./[^"\']+)["\']', content):
            assert str(Path(file).parent / dependency) in files, f"Unbundled import in {file}: {dependency}"

output = ROOT / "dist"
output.mkdir(exist_ok=True)
archive = output / f"tab-dumper-{version}-{target}.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for relative in sorted(set(files)):
        info = zipfile.ZipInfo(relative, date_time=(2026, 10, 26, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        data = (ROOT / relative).read_bytes()
        if target == "chrome" and relative == "manifest.json":
            data = (json.dumps(manifest, indent=2) + "\n").encode()
        package.writestr(info, data)
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert set(package.namelist()) == set(files)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n")
print(f"Built {archive.name}: {len(files)} files, {archive.stat().st_size:,} bytes")
print(f"SHA-256: {digest}")
