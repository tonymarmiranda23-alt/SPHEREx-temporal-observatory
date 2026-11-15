import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil

from app.core.config import settings
from app.services.fits_inventory import FitsInventory, SUPPORTED_SUFFIXES
from app.services.irsa_client import IRSAClient


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download and register two real SPHEREx cutouts from IRSA."
    )
    parser.add_argument(
        "--ra", type=float, default=270.0, help="Right ascension in degrees."
    )
    parser.add_argument(
        "--dec", type=float, default=66.56, help="Declination in degrees."
    )
    parser.add_argument(
        "--fov-deg", type=float, default=0.08, help="Cutout size in degrees."
    )
    parser.add_argument(
        "--files",
        nargs=2,
        type=Path,
        metavar=("FITS_1", "FITS_2"),
        help="Register two already downloaded FITS files without querying IRSA.",
    )
    args = parser.parse_args()
    if not 0 <= args.ra <= 360:
        parser.error("--ra debe estar entre 0 y 360 grados.")
    if not -90 <= args.dec <= 90:
        parser.error("--dec debe estar entre -90 y 90 grados.")
    if not 0.01 <= args.fov_deg <= 0.5:
        parser.error("--fov-deg debe estar entre 0.01 y 0.5 grados.")

    raw_root = Path(settings.SPHEREX_RAW_DIR).resolve()
    raw_root.mkdir(parents=True, exist_ok=True)
    if args.files:
        source_files = [path.resolve() for path in args.files]
        if len(set(source_files)) != 2:
            parser.error("--files debe indicar dos archivos distintos.")
        files_to_register = []
        for source in source_files:
            if not source.is_file() or not source.name.lower().endswith(SUPPORTED_SUFFIXES):
                parser.error(f"No es un archivo FITS compatible: {source}")
            destination = raw_root / source.name
            if source != destination:
                if destination.exists():
                    raise FileExistsError(
                        f"Ya existe un archivo con ese nombre en el inventario: {destination}"
                    )
                shutil.copy2(source, destination)
            files_to_register.append(destination)
    else:
        client = IRSAClient(raw_dir=str(raw_root))
        observations = client.query_spherex_observations(
            ra=args.ra,
            dec=args.dec,
            fov_deg=args.fov_deg,
            limit=20,
        )

        unique_observations = []
        seen_obs_ids = set()
        for observation in observations:
            obs_id = observation["obs_id"]
            if obs_id not in seen_obs_ids:
                unique_observations.append(observation)
                seen_obs_ids.add(obs_id)
            if len(unique_observations) == 2:
                break
        if len(unique_observations) != 2:
            raise RuntimeError(
                f"IRSA devolvió {len(unique_observations)} observaciones únicas; se necesitan dos."
            )

        downloaded = client.download_cutouts_parallel(
            unique_observations,
            ra=args.ra,
            dec=args.dec,
            fov_deg=args.fov_deg,
        )
        if len(downloaded) != 2:
            raise RuntimeError(
                f"Solo se descargaron {len(downloaded)} de los dos recortes solicitados."
            )
        files_to_register = [
            Path(downloaded[observation["obs_id"]]).resolve()
            for observation in unique_observations
        ]

    consumers_path = Path(settings.SPHEREX_CONSUMERS_PATH).resolve()
    if consumers_path.is_file():
        consumer_map = json.loads(consumers_path.read_text(encoding="utf-8"))
        if not isinstance(consumer_map, dict):
            raise ValueError("fits-consumers.json debe contener un objeto JSON.")
    else:
        consumer_map = {}

    downloaded_at = datetime.now(timezone.utc).isoformat()
    for filepath in files_to_register:
        relative_path = filepath.relative_to(raw_root).as_posix()
        consumer_map[relative_path] = {
            "consumers": ["sky_explorer"],
            "product_type": "SPHEREx cutout FITS",
            "source": "NASA/IPAC IRSA",
            "downloaded_at": downloaded_at,
        }

    consumers_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = consumers_path.with_suffix(consumers_path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(consumer_map, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary_path, consumers_path)

    inventory = FitsInventory()
    manifest = inventory.build()
    entries = {entry["relative_path"]: entry for entry in manifest["files"]}
    expected_paths = {filepath.relative_to(raw_root).as_posix() for filepath in files_to_register}
    if any(
        relative_path not in entries
        or entries[relative_path]["validation_status"] == "corrupt_or_unreadable"
        for relative_path in expected_paths
    ):
        raise RuntimeError("No se pudieron registrar ambos FITS en el manifiesto local.")

    print(json.dumps({
        "registered_files": sorted(expected_paths),
        "manifest_path": str(inventory.manifest_path),
    }, indent=2))


if __name__ == "__main__":
    main()
