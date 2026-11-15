from io import BytesIO

from astropy.table import Table

from app.services import irsa_client
from app.services.irsa_client import IRSAClient


class FakeResponse:
    def __init__(self, content: bytes = b"") -> None:
        self.content = content

    def raise_for_status(self) -> None:
        pass


def test_query_spherex_observations_uses_tap_and_parses_votable(
    monkeypatch,
) -> None:
    table = Table(
        rows=[
            ("plane-1", "obs-1", "dr1", 60000.0, 60001.0, 1.1e-6, 1.7e-6, "https://irsa.example/plane.fits"),
        ],
        names=(
            "plane_id",
            "obs_id",
            "obs_collection",
            "t_min",
            "t_max",
            "energy_bounds_lower",
            "energy_bounds_upper",
            "uri",
        ),
    )
    payload = BytesIO()
    table.write(payload, format="votable")
    request = {}

    def fake_get(url, *, params, timeout):
        request.update(url=url, params=params, timeout=timeout)
        return FakeResponse(payload.getvalue())

    monkeypatch.setattr(irsa_client.requests, "get", fake_get)

    observations = IRSAClient().query_spherex_observations(
        ra=120.0,
        dec=10.0,
        fov_deg=0.08,
        limit=2,
    )

    assert request["url"] == IRSAClient.IRSA_TAP_URL
    assert request["params"]["FORMAT"] == "VOTABLE"
    assert "SELECT TOP 2" in request["params"]["QUERY"]
    assert observations == [{
        "plane_id": "plane-1",
        "obs_id": "obs-1",
        "collection": "dr1",
        "t_min": 60000.0,
        "t_max": 60001.0,
        "wavelength_min_um": 1.1,
        "wavelength_max_um": 1.7,
        "access_url": "https://irsa.example/plane.fits",
        "base_uri": "https://irsa.example/plane.fits",
    }]


def test_download_single_cutout_appends_requested_cutout_parameters(
    monkeypatch,
    tmp_path,
) -> None:
    requested_urls = []

    class StreamingResponse:
        def raise_for_status(self) -> None:
            pass

        def iter_content(self, chunk_size):
            assert chunk_size == 65536
            yield b"fits-data"

    def fake_get(url, *, timeout, stream):
        requested_urls.append(url)
        return StreamingResponse()

    monkeypatch.setattr(irsa_client.requests, "get", fake_get)

    filepath = IRSAClient(raw_dir=str(tmp_path))._download_single_cutout(
        "https://irsa.example/plane.fits",
        ra=120.0,
        dec=10.0,
        fov_deg=0.08,
        obs_id="obs-1",
    )

    assert requested_urls == [
        "https://irsa.example/plane.fits?center=120.0,10.0d&size=0.08"
    ]
    with open(filepath, "rb") as file:
        assert file.read() == b"fits-data"
