# Model Formats

Convert trained `.pt` into a runtime format. **Accuracy is identical for every
FP32 format** — the difference is speed and machine support. Format choice =
which machine runs inference.

## Format matrix

| Format | On disk | Speed here (moto 640 / helmet 1280) | Use when |
|---|---|---|---|
| `.pt` | single file | slowest | training source only — never runtime |
| ONNX FP32 | one `.onnx` file | 346 / 996 ms | universal: AMD CPUs, GPU boxes, portability |
| **OpenVINO FP32** | folder `<name>_openvino_model/` (`xml`+`bin`+`metadata.yaml`) | **267 / 85 ms** | Intel CPU host (this project's deployment target) |
| TensorRT FP32 | one `.engine` file | NVIDIA GPU only | NVIDIA deployment; build on the target GPU |
| FP16 | same files, `half=True` | faster on GPU only | NVIDIA runtime (TensorRT / onnxruntime-gpu) |
| INT8 | openvino `int8=True` + calibration images | fastest CPU, accuracy −1–2% | only after accuracy validation |

Measured on the dev machine, warm runs, real case video.

## Usage

```powershell
cd backend
# folder of checkpoints, e.g. the whole helmet family @1280
.\venv\Scripts\python.exe format\export_model.py train --imgsz 1280 --format openvino

# single model with explicit output
.\venv\Scripts\python.exe format\export_model.py train\yolov8n.pt train\yolov8n_openvino_model --format openvino

# no args = uses the two models referenced in config.development.json
# (works only while those config paths still point at .pt files)
.\venv\Scripts\python.exe format\export_model.py
```

Omit `--format` for ONNX. FP32 is the default — nothing to specify.

## Commands used in this project (real files)

```powershell
cd backend

# moto tracker: yolov8n @640 (imgsz must stay 640 — matches model.track())
.\venv\Scripts\python.exe format\export_model.py train\yolov8n.pt train\yolov8n_openvino_model --format openvino

# helmet candidates — convert then A/B in config.development.json:
#   "helmet_model": "train/<name>_openvino_model"
.\venv\Scripts\python.exe format\export_model.py train\epoch250.pt train\epoch250_openvino_model --format openvino --imgsz 1280
.\venv\Scripts\python.exe format\export_model.py train\best_8_250.pt train\best_8_250_openvino_model --format openvino --imgsz 1280

# ONNX variants (fallback for non-Intel machines), same pairs
.\venv\Scripts\python.exe format\export_model.py train\epoch250.pt train\epoch250.onnx --imgsz 1280

# TensorRT engine (requires NVIDIA GPU, CUDA, and TensorRT)
.\venv\Scripts\python.exe format\export_model.py train\epoch250.pt train\epoch250.engine --format engine --imgsz 1280
# `tensorrt` is also accepted as an alias for `engine`.
```

After switching `models` paths in config, restart the backend.

## Rules that bite

1. **imgsz is locked at export.** ONNX/OpenVINO keep the baked input size;
   changing `helmet_imgsz` in config without re-exporting does nothing
   (runtime silently uses the baked size). Repo values: moto 640, helmet 1280.
2. **OpenVINO folder name must end with `_openvino_model`** — ultralytics
   detects the format from the suffix; anything else fails to load.
3. **OpenVINO is a folder, not a file.** Copy `.xml` + `.bin` +
   `metadata.yaml` together; the xml without the bin is broken.
4. **Export only from `.pt`.** Exporting an `.onnx` raises `TypeError`.
5. **Retrain → re-export → restart.** Config points at the exported path, so a
   stale export silently serves the old model after retraining.
6. **TensorRT engines are machine-specific.** Export with `--format engine` on
   the NVIDIA GPU and CUDA/TensorRT environment that will run the model. The
   output must use the `.engine` extension; it is not portable to another GPU
   architecture or to a CPU host.


