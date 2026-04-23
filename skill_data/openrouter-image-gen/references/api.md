# OpenRouter Image API — Reference

This file covers the edge cases not exposed as flags in `scripts/generate.py`. Read it only if the user needs streaming, Sourceful font rendering, Sourceful super-resolution, or custom payload tweaks.

## Endpoint

```
POST {OPENROUTER_BASE_URL}/chat/completions
Authorization: Bearer {OPENROUTER_API_KEY}
Content-Type: application/json
```

`OPENROUTER_BASE_URL` defaults to `https://openrouter.ai/api/v1`.

## Modalities

The `modalities` field selects output types:

- `["image", "text"]` — Gemini models. Response has both `message.content` (text) and `message.images[]`.
- `["image"]` — Flux, Sourceful, and other image-only models. Response has only `message.images[]`; `content` may be empty.

Sending the wrong value for a model returns HTTP 400.

## Request shape

Minimum payload:

```json
{
  "model": "openai/gpt-5.4-image-2",
  "messages": [
    { "role": "user", "content": "Generate a sunset over mountains" }
  ],
  "modalities": ["image", "text"]
}
```

With image input (image-to-image):

```json
{
  "model": "openai/gpt-5.4-image-2",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Change the sky to a sunset" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
      ]
    }
  ],
  "modalities": ["image", "text"]
}
```

Input images can be either a `data:` URL (base64) or a public https URL.

## image_config

Applies to models that accept it (Gemini family, some others). Silently ignored by models that don't.

```json
"image_config": {
  "aspect_ratio": "16:9",
  "image_size": "4K"
}
```

### Aspect ratios → pixel dimensions

| Ratio | Dimensions |
|---|---|
| 1:1  | 1024×1024 (default) |
| 2:3  | 832×1248 |
| 3:2  | 1248×832 |
| 3:4  | 864×1184 |
| 4:3  | 1184×864 |
| 4:5  | 896×1152 |
| 5:4  | 1152×896 |
| 9:16 | 768×1344 |
| 16:9 | 1344×768 |
| 21:9 | 1536×672 |

Extended ratios — **gemini-3.1-flash-image-preview only:** `1:4`, `4:1`, `1:8`, `8:1`.

### Sizes

`0.5K` (gemini-3.1-flash-image-preview only), `1K` (default), `2K`, `4K`.

## Sourceful — font_inputs

Sourceful models (`sourceful/riverflow-v2-fast`, `sourceful/riverflow-v2-pro`) can render custom fonts:

```json
"image_config": {
  "font_inputs": [
    { "font_url": "https://example.com/fonts/inter.ttf", "text": "Hello World" }
  ]
}
```

- Max 2 font inputs per request.
- +$0.03 per font input.
- The `text` value must match what's in the prompt verbatim — no quotes, no extra words.
- Include font name, color, size, and position in the prompt itself for best placement.
- Use line breaks or double spaces between headline and subhead when reusing one font.

## Sourceful — super_resolution_references

Enhance low-quality regions of an input image using high-quality reference images. Image-to-image only (requires an input image in `messages`); ignored otherwise.

```json
"image_config": {
  "super_resolution_references": [
    "https://example.com/ref1.jpg",
    "https://example.com/ref2.jpg"
  ]
}
```

- Max 4 references.
- +$0.20 per reference.
- Output image size matches the input image size — upload large inputs.

## Streaming

Set `"stream": true` to receive SSE. Each `data:` line is a JSON chunk; images arrive in `delta.images[]` across chunks.

```python
import requests, json

with requests.post(
    f"{BASE_URL}/chat/completions",
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    json={
        "model": "google/gemini-2.5-flash-image",
        "messages": [{"role": "user", "content": "A futuristic city"}],
        "modalities": ["image", "text"],
        "stream": True,
    },
    stream=True,
    timeout=300,
) as resp:
    for line in resp.iter_lines():
        if not line or not line.startswith(b"data: "):
            continue
        payload = line[6:]
        if payload == b"[DONE]":
            break
        chunk = json.loads(payload)
        delta = chunk["choices"][0].get("delta", {})
        for img in delta.get("images") or []:
            url = img["image_url"]["url"]
            # data: URL, decode and save as in generate.py
```

For almost all uses, non-streaming is fine — images arrive in a single response and latency is similar.

## Response shape

Non-streaming, success:

```json
{
  "id": "gen-...",
  "model": "google/gemini-3-pro-image-preview",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Here is the image you requested.",
        "images": [
          {
            "type": "image_url",
            "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." }
          }
        ]
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ... }
}
```

Images are always base64 data URLs. MIME is usually `image/png`; respect what's actually in the data URL prefix when saving.

## Model discovery

```
GET {OPENROUTER_BASE_URL}/models?output_modalities=image
```

Returns the current list of image-capable models with pricing. Use this when an unknown model ID fails with HTTP 404.

## Common errors

| HTTP | Meaning | Fix |
|---|---|---|
| 400 | Malformed request / invalid `image_config` for the model | Drop unsupported fields; check aspect ratio / size against the model |
| 401 | Bad API key | Re-check `OPENROUTER_API_KEY` |
| 402 | Out of credits | User needs to top up OpenRouter balance |
| 404 | Unknown model ID | Query `/models?output_modalities=image` |
| 429 | Rate limited | Back off and retry |
| 5xx | Upstream provider issue | Retry; try a different model if persistent |
