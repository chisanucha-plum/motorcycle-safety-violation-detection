"""Quick e2e speed test with the models configured in config.development.json.

Usage (from backend/): python benchmark/bench.py [frames=60]
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ root

import cv2

from app.configuration import Configuration
from app.services.detection import DetectionService

config = Configuration.get_config()


def main() -> None:
    frames_wanted = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    service = DetectionService(
        Path(config.models.bike_model),
        Path(config.models.helmet_model),
        config.detection,
    )

    cap = cv2.VideoCapture(str(Path(config.application_settings.video_path)))
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


if __name__ == "__main__":
    main()
