#!/usr/bin/env python3
"""Generate board-game hero cover art via https://imagen.h-e.top/api/jobs.

Asynchronous job API:
  POST /api/jobs  -> {"id": "...", ...}    (rate-limited: 1 req / 5s)
  GET  /api/jobs/{id}  -> status + result URL when done

Design:
  - Stage 1 SUBMIT: fire one job per game, sleep 5.5s between submits.
  - Stage 2 POLL: every 8s, poll all pending jobs; download images as they
    finish to games/<game>/cover.jpg (or .webp/.png depending on what the
    server returns).

Usage:
  IMAGEN_COOKIE='cf_clearance=...; session=...' \
  python3 scripts/gen-game-covers.py --only gomoku

  IMAGEN_COOKIE='...' python3 scripts/gen-game-covers.py           # all 15
  IMAGEN_COOKIE='...' python3 scripts/gen-game-covers.py --dry-run # show prompts

The cookie is whatever your browser DevTools shows — both cf_clearance
and session values are required.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://imagen.h-e.top"
SUBMIT_URL = f"{API_BASE}/api/jobs"
POLL_URL = f"{API_BASE}/api/jobs"  # /{id}

# One submit every 5.5s to stay under the 5s/req limit with a little slack.
SUBMIT_COOLDOWN = 5.5
POLL_INTERVAL = 8.0
POLL_TIMEOUT = 300  # 5 min per job

REPO_ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = REPO_ROOT / "games"

# --- prompts --------------------------------------------------------------
# Tailored per game. Style is consistent: warm cream editorial illustration,
# soft vintage palette, board-game packaging aesthetic — matches TableCraft
# lobby cream/navy brand.

STYLE_SUFFIX = (
    ", warm cream background, soft vintage color palette of dusty navy "
    "burgundy mustard and jade, elegant editorial illustration, hand-drawn "
    "board-game packaging art, no text, no logo, centered composition, "
    "clean negative space"
)

PROMPTS: dict[str, str] = {
    "gomoku": "an overhead view of a polished wooden go-board with glossy "
              "black and white stones forming an elegant pattern near the center"
              + STYLE_SUFFIX,
    "battleship": "a vintage naval map with wooden peg battleship pieces "
                  "arranged on a grid, compass rose in the corner"
                  + STYLE_SUFFIX,
    "blackjack": "three classic playing cards fanned out on green felt — "
                 "ace of spades, king of hearts, jack of diamonds"
                 + STYLE_SUFFIX,
    "codenames": "a grid of word tiles with secret-agent motifs, "
                 "fedora-and-trenchcoat silhouettes in the negative space"
                 + STYLE_SUFFIX,
    "connect-four": "a vertical yellow grid with red and yellow discs "
                    "partially dropped in, diagonal winning line highlighted"
                    + STYLE_SUFFIX,
    "hive": "hexagonal bakelite tiles with insect icons — bee queen, beetle, "
            "grasshopper, spider — arranged in an interlocking cluster"
            + STYLE_SUFFIX,
    "liar-bar": "a dim saloon table with a revolver, shot glasses, and "
                "playing cards face-down, single spotlight overhead"
                + STYLE_SUFFIX,
    "love-letter": "a wax-sealed parchment love letter on an ornate desk "
                   "with a quill pen and small castle tower in the distance"
                   + STYLE_SUFFIX,
    "splendor": "stacks of gem tokens — emerald sapphire ruby diamond onyx — "
                "beside ornate renaissance development cards"
                + STYLE_SUFFIX,
    "texas-holdem": "two hole cards face-down with poker chips stacked in "
                    "neat columns, shallow depth of field"
                    + STYLE_SUFFIX,
    "undercover": "a circle of masked figure silhouettes with a single "
                  "highlighted profile, detective magnifying-glass motif"
                  + STYLE_SUFFIX,
    "uno": "bright playing cards in red yellow green blue with bold number "
           "and action symbols, fanned diagonally"
           + STYLE_SUFFIX,
    "werewolf": "a moonlit village silhouette with amber eyes glowing in the "
                "shadows between houses, subtle wolf ears suggestion"
                + STYLE_SUFFIX,
    "yahtzee": "five classic white dice mid-tumble showing different faces, "
               "motion blur and a red dice cup tipped over"
               + STYLE_SUFFIX,
}

# connect-four uses 'connect-four' as slug in games/ too — check
# Note: 'client-registry.ts' / 'server-registry.ts' / '_template' are not
# games, they're infrastructure. 15 real game dirs but only 14 prompts
# above — verify which.


# --- helpers --------------------------------------------------------------
def http_post(url: str, payload: dict, cookie: str) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "accept": "*/*",
            "content-type": "application/json",
            "origin": API_BASE,
            "referer": f"{API_BASE}/",
            "user-agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
            ),
            "cookie": cookie,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {body}") from None


def http_get(url: str, cookie: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "accept": "*/*",
            "origin": API_BASE,
            "referer": f"{API_BASE}/",
            "user-agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
            ),
            "cookie": cookie,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {body}") from None


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "user-agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.read())


def submit_job(game: str, prompt: str, cookie: str) -> str:
    print(f"[submit] {game} …", flush=True)
    payload = {"prompt": prompt, "accept_public_share": True}
    resp = http_post(SUBMIT_URL, payload, cookie)
    # Response shape is unknown — try common fields
    job_id = resp.get("id") or resp.get("job_id") or resp.get("uuid")
    if not job_id:
        raise RuntimeError(f"no job id in submit response: {resp}")
    print(f"  → job {job_id}")
    return str(job_id)


def poll_job(job_id: str, cookie: str) -> dict:
    return http_get(f"{POLL_URL}/{job_id}", cookie)


def extract_image_url(job: dict) -> str | None:
    """Best-effort extraction of the finished image URL from a job dict."""
    # common shapes: {image_url}, {result: {url}}, {images: [{url}]}, {output}
    if isinstance(job.get("image_url"), str):
        return job["image_url"]
    if isinstance(job.get("url"), str):
        return job["url"]
    result = job.get("result") or job.get("output")
    if isinstance(result, dict):
        for k in ("url", "image_url", "image"):
            if isinstance(result.get(k), str):
                return result[k]
    if isinstance(job.get("images"), list) and job["images"]:
        first = job["images"][0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            for k in ("url", "image_url"):
                if isinstance(first.get(k), str):
                    return first[k]
    return None


def is_terminal_status(job: dict) -> str | None:
    """Return 'done' / 'failed' / None (still running)."""
    status = str(job.get("status", "")).lower()
    if status in {"completed", "done", "success", "succeeded", "finished"}:
        return "done"
    if status in {"failed", "error", "cancelled", "canceled"}:
        return "failed"
    if extract_image_url(job):  # heuristic fallback
        return "done"
    return None


# --- main flow ------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="only one game (e.g. gomoku)")
    parser.add_argument("--dry-run", action="store_true",
                        help="print prompts, don't hit the API")
    parser.add_argument("--out-dir", default=None,
                        help="save dir (default: games/<id>/cover.jpg)")
    args = parser.parse_args()

    targets = {k: v for k, v in PROMPTS.items()
               if args.only is None or k == args.only}
    if not targets:
        print(f"no prompts matched --only={args.only}", file=sys.stderr)
        return 1

    if args.dry_run:
        for g, p in targets.items():
            print(f"--- {g}\n{p}\n")
        return 0

    cookie = os.environ.get("IMAGEN_COOKIE", "").strip()
    if not cookie:
        print("ERROR: set IMAGEN_COOKIE env var (cf_clearance=…; session=…)",
              file=sys.stderr)
        return 2

    # --- stage 1: submit ---
    jobs: dict[str, str] = {}  # game -> job_id
    for i, (game, prompt) in enumerate(targets.items()):
        if i > 0:
            print(f"  (sleep {SUBMIT_COOLDOWN}s to respect rate limit)")
            time.sleep(SUBMIT_COOLDOWN)
        try:
            jobs[game] = submit_job(game, prompt, cookie)
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL to submit {game}: {e}", file=sys.stderr)

    if not jobs:
        print("no jobs submitted; aborting", file=sys.stderr)
        return 3

    # --- stage 2: poll + download ---
    pending = dict(jobs)
    done: dict[str, Path] = {}
    failed: dict[str, str] = {}
    start = time.time()

    print(f"\n[poll] {len(pending)} job(s) pending, interval {POLL_INTERVAL}s")
    while pending and time.time() - start < POLL_TIMEOUT * max(1, len(jobs)):
        time.sleep(POLL_INTERVAL)
        for game, job_id in list(pending.items()):
            try:
                job = poll_job(job_id, cookie)
            except Exception as e:  # noqa: BLE001
                print(f"  poll {game}: {e}")
                continue
            term = is_terminal_status(job)
            if term == "done":
                url = extract_image_url(job)
                if not url:
                    print(f"  {game}: status=done but no image url?")
                    pending.pop(game)
                    failed[game] = "done-without-url"
                    continue
                # figure extension from url
                path = urllib.parse.urlparse(url).path
                ext = Path(path).suffix or ".jpg"
                dest = (Path(args.out_dir) / f"{game}{ext}") if args.out_dir \
                    else (GAMES_DIR / game / f"cover{ext}")
                try:
                    download(url, dest)
                    done[game] = dest
                    print(f"  ✓ {game} → {dest.relative_to(REPO_ROOT)}")
                except Exception as e:  # noqa: BLE001
                    print(f"  download {game} failed: {e}")
                    failed[game] = f"dl: {e}"
                pending.pop(game)
            elif term == "failed":
                print(f"  ✗ {game}: {job.get('status')} {job.get('error')}")
                failed[game] = str(job)
                pending.pop(game)
            else:
                print(f"  · {game}: {job.get('status', '?')}")

    # --- summary ---
    print("\n=== summary ===")
    print(f"done:    {len(done)}")
    for g, p in done.items():
        print(f"  {g}: {p.relative_to(REPO_ROOT)}")
    if failed:
        print(f"failed:  {len(failed)}")
        for g, e in failed.items():
            print(f"  {g}: {e}")
    if pending:
        print(f"pending: {len(pending)} (timed out)")
        for g, j in pending.items():
            print(f"  {g}: job {j}")

    return 0 if not failed and not pending else 1


if __name__ == "__main__":
    sys.exit(main())
