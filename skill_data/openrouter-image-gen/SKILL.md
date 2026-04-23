---
name: openrouter-image-gen
description: Generate images via OpenRouter's Chat Completions image API (Gemini, Flux, Sourceful, etc). Use this skill whenever the user asks you to create, generate, make, draw, or design an image, picture, illustration, logo, icon, avatar, thumbnail, banner, cover, background, or any visual asset. Also trigger on Chinese phrases like "生成一张图", "画一个", "做一张图", "生图", "出图"; on image-to-image requests (edit this image, make a variation, upscale, restyle); and whenever the user mentions OpenRouter, Gemini image, nano banana, Flux, Sourceful, or Riverflow in a visual-output context. Err on the side of using this skill any time the end artifact is pixels rather than text or code.
---

# OpenRouter Image Generation

Generate images by POSTing to OpenRouter's `/chat/completions` endpoint with `modalities: ["image", "text"]`. A helper script (`scripts/generate.py`) handles request construction, base64 data URL decoding, and file saving so you only have to assemble the right CLI flags.

## Setup

Two environment variables drive the skill:

- `OPENROUTER_API_KEY` (required) — the user's OpenRouter API key.
- `OPENROUTER_BASE_URL` (optional) — defaults to `https://openrouter.ai/api/v1`. Override for self-hosted gateways or regional proxies.

If `OPENROUTER_API_KEY` is unset, stop and ask the user to export it. Never fabricate a key, and never hardcode one into a script or commit.

## Basic usage

From anywhere the user has these env vars exported:

```bash
python <skill-dir>/scripts/generate.py --prompt "A warm skeuomorphic board game lobby, cream background, thick brown borders"
```

On success the script prints each saved image path to stdout, one per line. By default images land in the current working directory as `openrouter-<unix-timestamp>.png`. Use `--output` to control the destination:

```bash
python <skill-dir>/scripts/generate.py \
  --prompt "A minimalist chess knight icon, flat vector, warm cream and brown palette" \
  --output "./packages/client/public/game-icons/knight.png"
```

If `--output` is a directory or a path without a suffix, multiple images are written as `<base>-0.png`, `<base>-1.png`, etc. If it's a file with a suffix, that path is used verbatim for the single-image case.

## Flags

| Flag | Values | Why it matters |
|---|---|---|
| `--prompt` | free text | Required. The more specific, the better the output; include subject, style, palette, framing. |
| `--model` | any OpenRouter model ID | Default `openai/gpt-5.4-image-2`. Override per-call when quality/cost tradeoff differs. |
| `--aspect-ratio` | `1:1` `2:3` `3:2` `3:4` `4:3` `4:5` `5:4` `9:16` `16:9` `21:9` | Maps to a fixed pixel size on the server. Use `9:16` / `16:9` for phone / desktop; `1:1` for icons; `21:9` for banners. |
| `--size` | `1K` `2K` `4K` | Default 1K. Only bump to 2K/4K when the asset really needs it; it costs more and takes longer. |
| `--input-image PATH` | local image file | Enables image-to-image (edit, variation, upscale). Repeat the flag for multiple inputs. |
| `--image-only` | flag | Use `modalities: ["image"]` — required for Flux and Sourceful models that don't emit text. |
| `--timeout` | seconds | Default 180. Bump for 4K or slow networks. |

## Choosing a model

The default (`openai/gpt-5.4-image-2`) is OpenAI's flagship image model on OpenRouter. Switch when:

- `openai/gpt-5-image` / `openai/gpt-5-image-mini` — cheaper/faster OpenAI options for drafts and bulk work.
- `google/gemini-3-pro-image-preview` — Gemini's top-tier, supports 4K and image-config aspect ratios.
- `google/gemini-2.5-flash-image` — fast and cheap Gemini; good enough for most icons, thumbnails, and draft work.
- `google/gemini-3.1-flash-image-preview` — the only model that supports extended aspect ratios (`1:4`, `4:1`, `1:8`, `8:1`) and the `0.5K` size. Pick this for narrow banners, tall rails, tiny assets.
- `black-forest-labs/flux.2-pro` / `flux.2-flex` / `flux.2-max` — pure image-only output; **add `--image-only`** or the request will fail.
- `sourceful/riverflow-v2-pro` / `riverflow-v2-fast` — image-only; supports font rendering and super-resolution references. Those options aren't CLI flags — see `references/api.md` for the raw payload shape if you need them.
- `bytedance-seed/seedream-4.5` — ByteDance's image model, also on OpenRouter.

When the user asks for "the cheapest" or "a quick draft", prefer a `-mini` / `flash` / `fast` variant over the pro default.

## Writing good prompts

The quality of OpenRouter image output is dominated by prompt quality. When the user gives you a short phrase ("a logo for my app"), elaborate before sending:

- **Subject** — what is in the image
- **Style** — photorealistic, flat vector, isometric, watercolor, skeuomorphic, 3D render...
- **Palette** — specific colors matter; "warm cream and brown" beats "nice colors"
- **Composition** — framing, camera angle, background, lighting
- **Negative intent** — things to avoid ("no text", "no people")

Include any project-specific constraints the user has mentioned in-session (e.g. this codebase uses a warm skeuomorphic design language per `docs/DESIGN.md`). Confirm with the user before generating if you had to invent a lot of details.

## Image-to-image

Pass `--input-image` with a local path to enable edit / variation / upscale workflows:

```bash
python <skill-dir>/scripts/generate.py \
  --prompt "Same composition, but switch the background to a sunset sky" \
  --input-image "./draft.png" \
  --output "./draft-v2.png"
```

The script base64-encodes the file and attaches it as a user-message image. Gemini handles image-to-image natively; Sourceful also supports it (and adds super-resolution references — see `references/api.md`). Flux variants vary — check the model page if a request fails.

## What to do with the result

- Each stdout line is a saved path — report it back to the user so they can open it.
- If the image is destined for a specific project slot (a game icon under `packages/client/public/game-icons/`, a thumbnail, an avatar), ask the user for the target path before generating and pass it as `--output`. Don't guess where to drop assets into someone else's repo.
- If several candidates would help, generate 2-3 with slightly varied prompts rather than one and hope.

## Troubleshooting

**`error: OPENROUTER_API_KEY is not set`** — the env var is missing. Ask the user to export it; do not fabricate one.

**`no images in response — the model returned only text.`** — the chosen model doesn't actually support image output, or it refused the prompt. Verify at <https://openrouter.ai/models?output_modalities=image>. For Flux/Sourceful, make sure you passed `--image-only`.

**`HTTP 402`** — out of credits on OpenRouter. Relay the message and stop; the user needs to top up.

**`HTTP 400`** — usually an invalid parameter combination. Common cases: unsupported aspect ratio for the chosen model (extended ratios require gemini-3.1-flash-image-preview), `0.5K` size on the wrong model, or `image_config` on a model that doesn't accept it. Try dropping the problem flag.

**`HTTP 401`** — bad API key. Ask the user to re-check `OPENROUTER_API_KEY`.

## Advanced

For edge-case features not exposed as flags — streaming responses, Sourceful `font_inputs`, Sourceful `super_resolution_references`, OpenRouter provider routing — read `references/api.md` and POST to `/chat/completions` directly with `curl` or a one-off Python snippet. Don't extend `generate.py` unless the user asks; keep it simple.
