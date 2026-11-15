import json
import sys
from pathlib import Path
from types import ModuleType

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import data as data_endpoint
from app.services.fits_inventory import FitsInventory


def test_spectral_profile_reports_per_observation_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    irsa_service = ModuleType("app.services.irsa_client")
    irsa_service.IRSAClient = object
    monkeypatch.setitem(sys.modules, "app.services.irsa_client", irsa_service)

    from app.api.v1.endpoints import spectral as spectral_endpoint

    observations = [
        {"obs_id": "valid", "t_min": 60000.0},
        {"obs_id": "download-missing", "t_min": 60001.0},
        {"obs_id": "extract-fails", "t_min": 60002.0},
    ]

    class FakeIRSAClient:
        def query_spherex_observations(self, **kwargs):
            return observations

        def download_cutouts_parallel(self, **kwargs):
            return {"valid": "valid.fits", "extract-fails": "invalid.fits"}

    def extract_profile(filepath: str, ra: float, dec: float):
        if filepath == "invalid.fits":
            raise ValueError("invalid test FITS")
        return {
            "wavelength_um": 1.2,
            "flux_mjy_sr": 3.4,
            "flux_error_mjy_sr": 0.2,
            "flag": 0,
            "is_valid_measurement": True,
        }

    monkeypatch.setattr(spectral_endpoint, "irsa_client", FakeIRSAClient())
    monkeypatch.setattr(
        spectral_endpoint.FITSProcessor,
        "extract_spectral_profile_from_mef",
        staticmethod(extract_profile),
    )

    response = spectral_endpoint.get_spectral_profile(ra=120.0, dec=10.0)

    assert response["status"] == "partial"
    assert response["total_channels_measured"] == 1
    assert [item["obs_id"] for item in response["failed_observations"]] == [
        "download-missing",
        "extract-fails",
    ]


@pytest.fixture
def local_fits_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    root = tmp_path / "raw"
    fits_path = root / "observation.fits"
    wcs = WCS(naxis=2)
    wcs.wcs.crpix = [4, 4]
    wcs.wcs.crval = [120.0, 10.0]
    wcs.wcs.cdelt = [-0.001, 0.001]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    primary = fits.PrimaryHDU()
    image = fits.ImageHDU(
        np.arange(64, dtype=np.float32).reshape((8, 8)),
        header=wcs.to_header(),
        name="IMAGE",
    )
    fits_path.parent.mkdir(parents=True)
    fits.HDUList([primary, image]).writeto(fits_path, checksum=True)

    consumers_path = tmp_path / "consumers.json"
    consumers_path.write_text(
        json.dumps({"observation.fits": ["sky_explorer"]}),
        encoding="utf-8",
    )
    inventory = FitsInventory(
        str(root),
        str(tmp_path / "manifest.json"),
        str(consumers_path),
    )
    manifest = inventory.build()
    monkeypatch.setattr(data_endpoint, "fits_inventory", inventory)
    monkeypatch.setattr(
        data_endpoint.settings,
        "SPHEREX_PROCESSED_DIR",
        str(tmp_path / "processed"),
    )
    app = FastAPI()
    app.include_router(data_endpoint.router, prefix="/data")
    return TestClient(app), manifest["files"][0], fits_path


def test_fits_data_api_lists_metadata_previews_and_downloads_original(
    local_fits_api,
) -> None:
    client, entry, fits_path = local_fits_api

    listing = client.get("/data/fits?module=sky_explorer")
    metadata = client.get(f"/data/fits/{entry['file_id']}")
    preview = client.get(f"/data/fits/{entry['file_id']}/preview?hdu=1")
    download = client.get(f"/data/fits/{entry['file_id']}/download")

    assert listing.status_code == 200
    assert listing.json()["files"][0]["file_id"] == entry["file_id"]
    assert metadata.status_code == 200
    assert metadata.json()["extensions"][1]["name"] == "IMAGE"
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert download.status_code == 200
    assert download.content == fits_path.read_bytes()
    assert download.headers["x-content-sha256"] == entry["sha256"]


def test_fits_data_api_reports_not_found_invalid_hdu_and_stale_hash(
    local_fits_api,
) -> None:
    client, entry, fits_path = local_fits_api

    assert client.get("/data/fits/unknown/download").status_code == 404
    assert client.get(f"/data/fits/{entry['file_id']}/preview?hdu=0").status_code == 422
    with fits_path.open("ab") as file:
        file.write(b"changed")
    stale = client.get(f"/data/fits/{entry['file_id']}/download")
    assert stale.status_code == 409
