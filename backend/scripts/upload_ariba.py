"""
One-shot script — upload the local ariba.mp4 into the sop-editor sandbox.

  cd sop-editor/backend
  python scripts/upload_ariba.py

Skips upload if the blob already exists at the same size. Pass --force to
overwrite. Prints the SAS URL at the end so you can smoke-test the stream.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import argparse
import config
import blob as blob_mod


LOCAL_CANDIDATES = [
    r"C:\Users\naimi\TS Video Parser\PD documentations\input_videos\ariba.mp4",
    r"C:\Users\naimi\TS Video Parser\video_parser\input_videos\ariba.mp4",
]


def find_local() -> str | None:
    for path in LOCAL_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Overwrite even if the blob exists")
    ap.add_argument("--name",  default="ariba.mp4",  help="Blob name inside the sandbox")
    ap.add_argument("--path",  default=None,          help="Local file path (auto-detects by default)")
    args = ap.parse_args()

    local_path = args.path or find_local()
    if not local_path:
        print("[error] ariba.mp4 not found in known locations. Pass --path.")
        sys.exit(1)

    blob_name = config.blob_key(args.name)
    print(f"[upload] local={local_path}")
    print(f"[upload] blob ={blob_name}  (container={config.BLOB_CONTAINER})")

    client = blob_mod.blob_client(blob_name)
    if client.exists() and not args.force:
        props = client.get_blob_properties()
        local_size = os.path.getsize(local_path)
        if props.size == local_size:
            print(f"[skip] blob already present at {props.size:,} bytes — nothing to do (pass --force to overwrite)")
        else:
            print(f"[warn] blob exists at {props.size:,} bytes (local {local_size:,}). Pass --force to overwrite.")
    else:
        blob_mod.upload_local(blob_name, local_path, overwrite=True)
        print(f"[ok] uploaded ({os.path.getsize(local_path):,} bytes)")

    url = blob_mod.sas_url(blob_name, ttl_minutes=15)
    print("\nSAS URL (15 min):")
    print(url)


if __name__ == "__main__":
    main()
