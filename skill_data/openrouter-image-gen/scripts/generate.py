#!/usr/bin/env python3
"""Generate images via OpenRouter's Chat Completions API.

Reads OPENROUTER_API_KEY (required) and OPENROUTER_BASE_URL (optional,
defaults to https://openrouter.ai/api/v1) from the environment.

Writes decoded images to disk and prints each saved path to stdout,
one path per line. Errors go to stderr and exit non-zero.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path
from urllib import error, request

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-5.4-image-2"
DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;]+);base64,(?P<data>.+)$", re.DOTALL)
EXT_FOR_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def encode_input_image(path: Path) -> str:
    if not path.is_file():
        die(f"input image not found: {path}")
    mime, _ = mimetypes.guess_type(path.name)
    if mime is None or not mime.startswith("image/"):
        mime = "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def build_messages(prompt: str, input_images: list[Path]) -> list[dict]:
    if not input_images:
        return [{"role": "user", "content": prompt}]
    content: list[dict] = [{"type": "text", "text": prompt}]
    for p in input_images:
        content.append(
            {"type": "image_url", "image_url": {"url": encode_input_image(p)}}
        )
    return [{"role": "user", "content": content}]


def build_payload(args: argparse.Namespace) -> dict:
    modalities = ["image"] if args.image_only else ["image", "text"]
    payload: dict = {
        "model": args.model,
        "messages": build_messages(args.prompt, [Path(p) for p in args.input_image]),
        "modalities": modalities,
        "stream": False,
    }
    image_config: dict = {}
    if args.aspect_ratio:
        image_config["aspect_ratio"] = args.aspect_ratio
    if args.size:
        image_config["image_size"] = args.size
    if image_config:
        payload["image_config"] = image_config
    return payload


def call_api(base_url: str, api_key: str, payload: dict, timeout: int) -> dict:
    url = f"{base_url.rstrip('/')}/chat/completions"
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        die(f"HTTP {e.code} from OpenRouter: {body}")
    except error.URLError as e:
        die(f"network error: {e.reason}")
    return {}


def extract_images(response: dict) -> list[tuple[str, bytes]]:
    if response.get("error"):
        die(f"OpenRouter returned an error: {json.dumps(response['error'])}")
    choices = response.get("choices") or []
    if not choices:
        die(f"no choices in response: {json.dumps(response)[:500]}")
    message = choices[0].get("message") or {}
    images = message.get("images") or []
    if not images:
        content_preview = str(message.get("content", ""))[:300]
        die(
            "no images in response — the model returned only text. "
            "Check the model supports image output "
            "(https://openrouter.ai/models?output_modalities=image). "
            f"Model text: {content_preview!r}"
        )
    out: list[tuple[str, bytes]] = []
    for idx, img in enumerate(images):
        img_field = img.get("image_url") or img.get("imageUrl") or {}
        url = img_field.get("url") if isinstance(img_field, dict) else None
        if not url:
            die(f"image #{idx} has no url: {json.dumps(img)[:200]}")
        m = DATA_URL_RE.match(url)
        if not m:
            die(f"image #{idx} is not a base64 data URL: {url[:80]!r}")
        mime = m.group("mime")
        data = base64.b64decode(m.group("data"))
        out.append((mime, data))
    return out


def save_images(
    images: list[tuple[str, bytes]], output: str | None
) -> list[Path]:
    paths: list[Path] = []
    if output:
        out_path = Path(output).expanduser()
        if len(images) == 1 and out_path.suffix:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(images[0][1])
            paths.append(out_path)
        else:
            if out_path.suffix:
                base = out_path.with_suffix("")
                base.parent.mkdir(parents=True, exist_ok=True)
            else:
                out_path.mkdir(parents=True, exist_ok=True)
                base = out_path / "image"
            for i, (mime, data) in enumerate(images):
                ext = EXT_FOR_MIME.get(mime, ".png")
                p = Path(f"{base}-{i}{ext}") if len(images) > 1 else Path(f"{base}{ext}")
                p.write_bytes(data)
                paths.append(p)
        return paths

    ts = int(time.time())
    cwd = Path.cwd()
    for i, (mime, data) in enumerate(images):
        ext = EXT_FOR_MIME.get(mime, ".png")
        suffix = "" if len(images) == 1 else f"-{i}"
        p = cwd / f"openrouter-{ts}{suffix}{ext}"
        p.write_bytes(data)
        paths.append(p)
    return paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate images via OpenRouter Chat Completions.",
    )
    parser.add_argument("--prompt", required=True, help="Text prompt.")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"OpenRouter model ID. Default: {DEFAULT_MODEL}.",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file path (single image) or directory (multiple). "
        "Default: ./openrouter-<timestamp>.<ext> in CWD.",
    )
    parser.add_argument(
        "--aspect-ratio",
        help="1:1, 16:9, 9:16, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 21:9 "
        "(extended 1:4/4:1/1:8/8:1 on gemini-3.1-flash-image-preview).",
    )
    parser.add_argument(
        "--size",
        help="1K (default), 2K, 4K. 0.5K only on gemini-3.1-flash-image-preview.",
    )
    parser.add_argument(
        "--input-image",
        action="append",
        default=[],
        help="Path to an input image (image-to-image). Repeat for multiple.",
    )
    parser.add_argument(
        "--image-only",
        action="store_true",
        help='Use modalities=["image"] for Flux/Sourceful-style image-only models.',
    )
    parser.add_argument(
        "--timeout", type=int, default=180, help="HTTP timeout seconds. Default 180."
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        die("OPENROUTER_API_KEY is not set")
    base_url = os.environ.get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL

    payload = build_payload(args)
    response = call_api(base_url, api_key, payload, args.timeout)
    images = extract_images(response)
    paths = save_images(images, args.output)
    for p in paths:
        print(p)


if __name__ == "__main__":
    main()
