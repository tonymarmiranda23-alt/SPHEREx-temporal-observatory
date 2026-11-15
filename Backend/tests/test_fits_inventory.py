import json
from pathlib import Path
import shutil

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from app.services.fits_inventory import FitsInventory, InventoryStaleError, inspect_fits
from app.services.fits_processor import FITSProcessor


def write_mef(
    path: Path,
    *,
    release: str = "QR3",
    image_release: str | None = None,
    band: str = "B1",
    crval_ra: float = 120.0,
    date_obs: str = "2024-01-01T00:00:00",
    image_value: float = 10.0,
) -> None:
    wcs = WCS(naxis=2)
    wcs.wcs.crpix = [4, 4]
    wcs.wcs.crval = [crval_ra, 10.0]
    wcs.wcs.cdelt = [-0.001, 0.001]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]

    image_header = wcs.to_header()
    image_header["DATE-OBS"] = date_obs
    image_header["RELEASE"] = image_release or release
    image_header["BAND"] = band
    image_header["BUNIT"] = "MJy/sr"
    image_header["PSF_FWHM"] = 2.0
    image_header["CALLEVEL"] = "2"
    image_header["CAL_VER"] = "1.0"

    primary = fits.PrimaryHDU()
    primary.header["RELEASE"] = release
    image = fits.ImageHDU(
        np.full((8, 8), image_value, dtype=np.float32),
        header=image_header,
        name="IMAGE",
    )
    variance = fits.ImageHDU(
        np.full((8, 8), 4.0, dtype=np.float32),
        name="VARIANCE",
    )
    variance.header["BUNIT"] = "MJy2/sr2"
    flags = fits.ImageHDU(np.zeros((8, 8), dtype=np.int16), name="FLAGS")
    catalog = fits.BinTableHDU.from_columns(
        [fits.Column(name="SOURCE_ID", format="J", array=np.array([1], dtype=np.int32))],
        name="CATALOG",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    fits.HDUList([primary, image, variance, flags, catalog]).writeto(path, checksum=True)


def test_inventory_assigns_multiple_consumers_without_copying_file(tmp_path: Path) -> None:
    root = tmp_path / "raw"
    fits_path = root / "shared" / "observation.fits"
    write_mef(fits_path)
    consumer_path = tmp_path / "fits-consumers.json"
    consumer_path.write_text(
        json.dumps({
            "shared/observation.fits": {
                "consumers": ["sky_explorer", "temporal_vision", "discovery_catalog"],
                "source": str(tmp_path / "source"),
            },
        }),
        encoding="utf-8",
    )
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(consumer_path),
    )

    manifest = inventory.build()

    assert manifest["file_count"] == 1
    assert manifest["files"][0]["consumers"] == [
        "discovery_catalog",
        "sky_explorer",
        "temporal_vision",
    ]
    assert manifest["files"][0]["source"] == "[absolute path omitted]"
    assert manifest["files"][0]["compatibility"]["temporal_comparison"]["compatible"]
    assert manifest["files"][0]["has_table_data"]
    assert all(
        extension["checksum_valid"] is True
        and extension["datasum_valid"] is True
        for extension in manifest["files"][0]["extensions"]
    )
    assert str(tmp_path) not in (tmp_path / "manifest.json").read_text(encoding="utf-8")


def test_conflicting_release_headers_are_not_marked_temporally_compatible(tmp_path: Path) -> None:
    path = tmp_path / "conflicting.fits"
    write_mef(path, release="QR3", image_release="DR1")

    metadata = inspect_fits(path)

    assert metadata["release"] is None
    assert metadata["metadata_presence"]["release"] == "absent_or_conflicting"
    assert not metadata["compatibility"]["temporal_comparison"]["compatible"]
    assert any("conflicto" in warning for warning in metadata["validation_warnings"])


def test_bad_checksum_disables_scientific_compatibility(tmp_path: Path) -> None:
    path = tmp_path / "damaged.fits"
    write_mef(path)
    with fits.open(path, memmap=False) as hdul:
        image_data_offset = hdul["IMAGE"].fileinfo()["datLoc"]
    with path.open("r+b") as file:
        file.seek(image_data_offset)
        original_byte = file.read(1)
        file.seek(image_data_offset)
        file.write(bytes([original_byte[0] ^ 1]))

    metadata = inspect_fits(path)

    assert metadata["validation_status"] == "corrupt_or_unreadable"
    assert not metadata["compatibility"]["temporal_comparison"]["compatible"]
    assert not metadata["compatibility"]["spectral_profile"]["compatible"]


def test_temporal_pipeline_preserves_variance_for_identical_wcs(tmp_path: Path) -> None:
    first = tmp_path / "first.fits"
    second = tmp_path / "second.fits"
    write_mef(first, date_obs="2024-01-01T00:00:00")
    write_mef(second, date_obs="2024-01-02T00:00:00", image_value=12.0)

    result = FITSProcessor.align_and_cutout_pair(
        str(first),
        str(second),
        ra=120.0,
        dec=10.0,
        cutout_size_px=150,
        subtract_background=False,
    )

    assert result["image_t1"].shape == (150, 150)
    assert result["variance_t1"].shape == (150, 150)
    valid_variance = result["variance_t1"][np.isfinite(result["variance_t1"])]
    np.testing.assert_array_equal(valid_variance, np.full(64, 4.0))


def test_temporal_pipeline_rejects_different_grids_and_bands(tmp_path: Path) -> None:
    first = tmp_path / "first.fits"
    shifted = tmp_path / "shifted.fits"
    other_band = tmp_path / "other-band.fits"
    write_mef(first)
    write_mef(shifted, crval_ra=120.01)
    write_mef(other_band, band="B2", date_obs="2024-01-02T00:00:00")

    with np.testing.assert_raises_regex(ValueError, "WCS"):
        FITSProcessor.align_and_cutout_pair(
            str(first), str(shifted), 120.0, 10.0, subtract_background=False
        )
    with np.testing.assert_raises_regex(ValueError, "bandas"):
        FITSProcessor.align_and_cutout_pair(
            str(first), str(other_band), 120.0, 10.0, subtract_background=False
        )


def test_inventory_marks_duplicate_bytes_instead_of_mislabeling_them(tmp_path: Path) -> None:
    root = tmp_path / "raw"
    original = root / "original.fits"
    duplicate = root / "copy.fits"
    write_mef(original)
    shutil.copyfile(original, duplicate)
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(tmp_path / "missing-consumers.json"),
    )

    entries = inventory.build()["files"]

    assert len(entries) == 2
    assert sum(entry["duplicate_of"] is not None for entry in entries) == 1


def test_inventory_rejects_files_changed_after_manifest_generation(tmp_path: Path) -> None:
    root = tmp_path / "raw"
    path = root / "observation.fits"
    write_mef(path)
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(tmp_path / "missing-consumers.json"),
    )
    entry = inventory.build()["files"][0]
    with path.open("ab") as file:
        file.write(b"changed")

    with np.testing.assert_raises_regex(InventoryStaleError, "manifiesto"):
        inventory.get_path(entry)


def test_inventory_recognizes_gzip_fits_files(tmp_path: Path) -> None:
    root = tmp_path / "raw"
    write_mef(root / "observation.fits.gz")
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(tmp_path / "missing-consumers.json"),
    )

    manifest = inventory.build()

    assert manifest["file_count"] == 1
    assert manifest["files"][0]["validation_status"] in ("valid", "valid_with_warnings")


def test_table_only_file_is_catalogued_without_scientific_image_claims(tmp_path: Path) -> None:
    root = tmp_path / "raw"
    path = root / "sources.fits"
    path.parent.mkdir(parents=True)
    table = fits.BinTableHDU.from_columns([
        fits.Column(name="SOURCE_ID", format="J", array=np.array([1], dtype=np.int32)),
        fits.Column(name="RA", format="D", array=np.array([120.0])),
    ])
    fits.HDUList([fits.PrimaryHDU(), table]).writeto(path, checksum=True)
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(tmp_path / "missing-consumers.json"),
    )

    entry = inventory.build()["files"][0]

    assert entry["has_table_data"]
    assert not entry["compatibility"]["sky_preview"]["compatible"]
    assert not entry["compatibility"]["temporal_comparison"]["compatible"]
