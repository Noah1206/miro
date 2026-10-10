"""Compatibility entry point; current assets are rendered from logo-symbol.svg.

python3 docs/brand/make-logo-assets.py
Requires Node.js and sharp (or MIRO_ASSET_NODE_MODULES pointing to bundled packages).
"""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    subprocess.run(
        ["node", str(Path(__file__).resolve().with_suffix(".mjs"))],
        cwd=Path(__file__).resolve().parents[2],
        check=True,
    )
