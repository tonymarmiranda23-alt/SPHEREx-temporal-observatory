import argparse
import json

from app.services.fits_inventory import FitsInventory


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or refresh the local SPHEREx FITS manifest.")
    parser.add_argument("--root", help="FITS dataset root (defaults to SPHEREX_RAW_DIR).")
    parser.add_argument("--manifest", help="Manifest output path (defaults to SPHEREX_MANIFEST_PATH).")
    parser.add_argument("--consumers", help="JSON mapping relative paths to consumer module lists.")
    args = parser.parse_args()

    inventory = FitsInventory(args.root, args.manifest, args.consumers)
    try:
        manifest = inventory.build()
    except FileNotFoundError as exc:
        parser.error(str(exc))
    print(json.dumps({
        "manifest_path": str(inventory.manifest_path),
        "files": manifest["file_count"],
        "total_size_bytes": manifest["total_size_bytes"],
        "validation_counts": {
            status: sum(entry["validation_status"] == status for entry in manifest["files"])
            for status in ("valid", "valid_with_warnings", "incomplete", "corrupt_or_unreadable")
        },
        "duplicates": sum(entry["duplicate_of"] is not None for entry in manifest["files"]),
    }, indent=2))


if __name__ == "__main__":
    main()
