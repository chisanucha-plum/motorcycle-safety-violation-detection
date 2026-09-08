"""Export YOLO .pt models to onnx, openvino, or TensorRT.

Usage:
    python format/export_model.py                                # .pt paths from config
    python format/export_model.py <folder> [folder ...]          # every .pt inside
    python format/export_model.py model.pt out.onnx [more.pt more.onnx]
Options: --imgsz N (default 640) · --format onnx|openvino|engine (default onnx)
See format/README.md for the format matrix and gotchas.
"""

import json
import sys
from pathlib import Path

from ultralytics import YOLO

args = sys.argv[1:]
imgsz, fmt = 640, "onnx"
if "--imgsz" in args:
    i = args.index("--imgsz")
    imgsz = int(args[i + 1])
    del args[i : i + 2]
if "--format" in args:
    i = args.index("--format")
    fmt = args[i + 1]
    del args[i : i + 2]
if fmt == "tensorrt":
    fmt = "engine"
if fmt not in ("onnx", "openvino", "engine"):
    sys.exit(f"unsupported --format {fmt} (onnx|openvino|engine)")

if not args:
    cfg = json.loads(Path("config.development.json").read_text(encoding="utf-8"))
    ms = cfg["models"]
    jobs = [
        (ms["bike_model"], 640, None),
        (
            ms["helmet_model"],
            cfg["detection"]["helmet_imgsz"],
            None,
        ),
    ]
    jobs = [j for j in jobs if str(j[0]).endswith(".pt")]
    if not jobs:
        sys.exit(
            "config references no .pt models — pass a folder or model.pt explicitly"
        )
else:
    dirs = [a for a in args if Path(a).is_dir()]
    files = [a for a in args if not Path(a).is_dir()]
    if files and len(files) % 2:
        sys.exit(
            "usage: python format/export_model.py [folder ... | model.pt out.ext ...] [--imgsz N] [--format onnx|openvino|engine]"
        )
    jobs = [(str(p), imgsz, None) for d in dirs for p in sorted(Path(d).glob("*.pt"))]
    jobs += [(files[i], imgsz, files[i + 1]) for i in range(0, len(files), 2)]

for pt, size, out in jobs:
    result = YOLO(pt).export(format=fmt, imgsz=size)
    if out and Path(result) != Path(out):
        # Ultralytics detects OpenVINO models by the folder name suffix.
        if fmt == "openvino" and not str(out).endswith("_openvino_model"):
            print(
                f"! {pt}: kept default name {result} — openvino output must end with _openvino_model"
            )
        elif fmt == "engine" and not str(out).lower().endswith(".engine"):
            print(
                f"! {pt}: kept default name {result} — TensorRT output must end with .engine"
            )
        else:
            Path(result).replace(out)  # ultralytics always writes next to the .pt
            result = out
    print(f"{pt} -> {result} (imgsz={size}, classes={YOLO(result).names})")
