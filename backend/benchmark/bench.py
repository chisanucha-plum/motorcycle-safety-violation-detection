"""Benchmark detection speed with the configured models.

Usage (from backend/):
    python benchmark/bench.py [frames=60]
    python benchmark/bench.py --realtime --seconds 30
"""

import argparse
import csv
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ root

import cv2

from app.configuration import Configuration
from app.services.detection import DetectionService


def create_service() -> tuple[object, object]:
    config = Configuration.get_config()
    service = DetectionService(
        Path(config.models.bike_model),
        Path(config.models.helmet_model),
        config.detection,
    )
    return config, service


def open_source(config: object) -> cv2.VideoCapture:
    app = config.application_settings
    if app.use_webcam:
        return cv2.VideoCapture(app.webcam_id, cv2.CAP_DSHOW)
    source = app.video_path
    if str(source).lower().startswith(("rtsp://", "rtsps://", "http://", "https://")):
        return cv2.VideoCapture(source)
    return cv2.VideoCapture(str(Path(source)))


def benchmark_file(frames_wanted: int) -> None:
    config, service = create_service()

    cap = open_source(config)
    assert cap.isOpened(), f"cannot open {config.application_settings.video_path}"

    for _ in range(3):  # warmup: OpenVINO/OR-TO compile on first inferences
        ok, frame = cap.read()
        if not ok:
            break
        service.detect_and_track(frame)

    records, t0, n = [], time.time(), 0
    while n < frames_wanted:
        ok, frame = cap.read()
        if not ok:
            break
        n += 1
        _, recs = service.detect_and_track(frame)
        records.extend(recs)
    dt = time.time() - t0

    print(f"models: {config.models.bike_model} + {config.models.helmet_model}")
    print(
        f"e2e: {n} frames, {len(records)} records, {dt / max(n, 1) * 1000:.0f} ms/frame"
    )
    cap.release()


def save_realtime_plot(
    samples: list[tuple[float, float]],
    output_path: Path,
    csv_path: Path,
    metadata: dict[str, str],
) -> None:
    """Save per-frame latency data as CSV and a two-panel PNG plot."""
    import matplotlib.pyplot as plt

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["elapsed_sec", "inference_ms", "cumulative_fps"])
        for index, (elapsed, latency_ms) in enumerate(samples, start=1):
            writer.writerow(
                [
                    f"{elapsed:.3f}",
                    f"{latency_ms:.3f}",
                    f"{index / max(elapsed, 0.001):.3f}",
                ]
            )

    elapsed_values = [sample[0] for sample in samples]
    latency_values = [sample[1] for sample in samples]
    fps_values = [
        index / max(elapsed, 0.001)
        for index, elapsed in enumerate(elapsed_values, start=1)
    ]

    figure, axes = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    axes[0].plot(elapsed_values, latency_values, color="tab:red", linewidth=1)
    axes[0].set_ylabel("Inference (ms/frame)")
    axes[0].grid(alpha=0.3)
    axes[1].plot(elapsed_values, fps_values, color="tab:blue", linewidth=1)
    axes[1].set_xlabel("Elapsed time (seconds)")
    axes[1].set_ylabel("Cumulative FPS")
    axes[1].grid(alpha=0.3)
    metadata_text = "\n".join(f"{key}: {value}" for key, value in metadata.items())
    figure.suptitle("Realtime Detection Benchmark", fontsize=14)
    figure.text(
        0.01,
        0.01,
        metadata_text,
        ha="left",
        va="bottom",
        fontsize=8,
        family="monospace",
    )
    figure.subplots_adjust(bottom=0.25)
    figure.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output_path, dpi=150)
    plt.close(figure)


def benchmark_realtime(
    seconds: float, plot: bool = False, output_dir: Path = Path("benchmark/results")
) -> None:
    """Measure latest-frame realtime throughput without saving to the database."""
    config, service = create_service()
    started_at = datetime.now().astimezone()
    source = config.application_settings.video_path
    cap = open_source(config)
    assert cap.isOpened(), f"cannot open {source}"

    latest_frame: list[object] = [None]
    latest_lock = threading.Lock()
    stop = threading.Event()
    grabbed = 0

    def grab_loop() -> None:
        nonlocal grabbed
        while not stop.is_set():
            ok, frame = cap.read()
            if not ok:
                break
            with latest_lock:
                latest_frame[0] = frame
            grabbed += 1

    grabber = threading.Thread(target=grab_loop, daemon=True)
    grabber.start()
    processing_times: list[float] = []
    samples: list[tuple[float, float]] = []
    records = 0
    processed = 0
    started = time.perf_counter()

    try:
        while time.perf_counter() - started < seconds:
            with latest_lock:
                frame = latest_frame[0]
                latest_frame[0] = None
            if frame is None:
                time.sleep(0.005)
                continue
            t0 = time.perf_counter()
            _, new_records = service.detect_and_track(frame)
            elapsed = time.perf_counter() - started
            latency_ms = (time.perf_counter() - t0) * 1000
            processing_times.append(latency_ms)
            samples.append((elapsed, latency_ms))
            processed += 1
            records += len(new_records)
    finally:
        stop.set()
        cap.release()
        grabber.join(timeout=2)

    elapsed = max(time.perf_counter() - started, 0.001)
    avg_ms = sum(processing_times) / max(len(processing_times), 1)
    source_fps = grabbed / elapsed
    processing_fps = processed / elapsed
    dropped = max(grabbed - processed, 0)
    print(f"source: {source}")
    print(f"realtime: {elapsed:.1f}s, {records} records")
    print(f"capture: {grabbed} frames, {source_fps:.2f} FPS")
    print(f"processed: {processed} frames, {processing_fps:.2f} FPS")
    print(f"dropped_latest_frame: {dropped} ({dropped / max(grabbed, 1) * 100:.1f}%)")
    print(f"inference: {avg_ms:.0f} ms/frame, {1000 / max(avg_ms, 1):.2f} FPS")
    if plot:
        run_id = started_at.strftime("%Y%m%d_%H%M%S_%f")
        output_path = output_dir / f"realtime_{run_id}.png"
        csv_path = output_dir / f"realtime_{run_id}.csv"
        metadata = {
            "started": started_at.isoformat(timespec="seconds"),
            "duration_sec": f"{elapsed:.1f}",
            "bike_model": config.models.bike_model,
            "helmet_model": config.models.helmet_model,
            "capture_fps": f"{source_fps:.2f}",
            "processed_fps": f"{processing_fps:.2f}",
            "avg_latency_ms": f"{avg_ms:.1f}",
            "dropped_frames": f"{dropped} ({dropped / max(grabbed, 1) * 100:.1f}%)",
            "records": str(records),
        }
        save_realtime_plot(samples, output_path, csv_path, metadata)
        print(f"plot: {output_path}")
        print(f"data: {csv_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("frames", nargs="?", type=int, default=60)
    parser.add_argument("--realtime", action="store_true")
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--plot", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark/results"))
    args = parser.parse_args()
    if args.realtime:
        benchmark_realtime(args.seconds, args.plot, args.output_dir)
    else:
        benchmark_file(args.frames)


if __name__ == "__main__":
    main()
