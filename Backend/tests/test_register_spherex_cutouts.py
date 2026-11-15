import json
from pathlib import Path
import sys

import numpy as np
from astropy.io import fits

from app.core.config import settings
from app.scripts.register_spherex_cutouts import main


def test_registers_two_local_cutouts_without_irsa(
    monkeypatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_root.mkdir()
    sources = []
    for name in ("cutout-1.fits", "cutout-2.fits"):
        source = source_root / name
        fits.PrimaryHDU(np.ones((4, 4), dtype=np.float32)).writeto(source)
        sources.append(source)

    raw_root = tmp_path / "data" / "raw" / "spherex"
    consumers_path = tmp_path / "fits-consumers.json"
    manifest_path = tmp_path / "data" / "processed" / "fits-manifest.json"
    monkeypatch.setattr(settings, "SPHEREX_RAW_DIR", str(raw_root))
    monkeypatch.setattr(settings, "SPHEREX_CONSUMERS_PATH", str(consumers_path))
    monkeypatch.setattr(settings, "SPHEREX_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "register_spherex_cutouts",
            "--files",
            str(sources[0]),
            str(sources[1]),
        ],
    )

    main()

    consumers = json.loads(consumers_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert set(consumers) == {"cutout-1.fits", "cutout-2.fits"}
    assert all(item["consumers"] == ["sky_explorer"] for item in consumers.values())
    assert {item["relative_path"] for item in manifest["files"]} == set(consumers)
    assert all(
        (raw_root / relative_path).is_file()
        for relative_path in consumers
    )
