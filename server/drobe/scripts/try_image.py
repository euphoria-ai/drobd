"""Run one photo through the pipeline and write the result out for inspection.

Edge quality is a judgement call, not something a test can assert, so this
exists to be looked at. It writes the cutout on both a black and a white ground
because those are the two backgrounds the app actually uses, and a cutout that
looks clean on one can look terrible on the other.

    python -m drobe.scripts.try_image photo.jpg
    python -m drobe.scripts.try_image photo.jpg --outdir out --no-label
"""

from __future__ import annotations

import argparse
import asyncio
import time
from pathlib import Path

from PIL import Image

from ..pipeline import cutout as cutout_pipeline
from ..pipeline import labeler


def _on_ground(cutout: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    canvas = Image.new("RGB", (cutout.width + 160, cutout.height + 160), color)
    canvas.paste(cutout, (80, 80), mask=cutout.getchannel("A"))
    return canvas


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--outdir", type=Path, default=Path("out"))
    parser.add_argument("--no-label", action="store_true", help="skip the Groq call")
    args = parser.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)
    data = args.image.read_bytes()

    started = time.perf_counter()
    result = await asyncio.to_thread(cutout_pipeline.segment, data)
    segment_ms = int((time.perf_counter() - started) * 1000)

    stem = args.image.stem
    (args.outdir / f"{stem}-cutout.png").write_bytes(result.to_png_bytes())
    _on_ground(result.image, (0, 0, 0)).save(args.outdir / f"{stem}-on-black.png")
    _on_ground(result.image, (255, 255, 255)).save(args.outdir / f"{stem}-on-white.png")

    print(f"cutout   {result.width}x{result.height} in {segment_ms}ms")
    print(f"written  {args.outdir.resolve()}")

    if args.no_label:
        return

    started = time.perf_counter()
    label = await labeler.label(result.to_label_jpeg_bytes())
    label_ms = int((time.perf_counter() - started) * 1000)

    print(f"name     {label.name}")
    print(f"category {label.category.value}  slot {label.slot.value}")
    print(f"colour   {label.dominant_color}")
    print(f"conf     {label.confidence:.2f} in {label_ms}ms")
    if label == labeler.FALLBACK:
        print("NOTE: fell back -- check GROQ_API_KEY and the model id in .env")


if __name__ == "__main__":
    asyncio.run(main())
