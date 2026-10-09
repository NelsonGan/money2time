"""Print artifact bytes, hashes, architectures and ZIP component sizes."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from zipfile import ZipFile


def measure(filename):
    path = Path(filename)
    groups = Counter()
    architectures = set()
    with ZipFile(path) as archive:
        for entry in archive.infolist():
            name = entry.filename.removeprefix("base/")
            if name.startswith("lib/"):
                group = "native"
                architectures.add(name.split("/")[1])
            elif name.endswith(".dex"):
                group = "dex"
            elif name.startswith("assets/"):
                group = "assets"
            elif name.startswith("res/") or name == "resources.arsc":
                group = "resources"
            else:
                group = "other"
            groups[group] += entry.compress_size
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "bytes": path.stat().st_size,
        "sha256": digest.hexdigest(),
        "androidAbis": sorted(architectures),
        "compressedComponents": dict(groups),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", nargs="+", help="APK or AAB files")
    args = parser.parse_args()
    print(json.dumps({str(p): measure(p) for p in args.artifacts}, indent=2))
