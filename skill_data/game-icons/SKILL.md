---
name: game-icons
description: Search and download free SVG/PNG icons from game-icons.net. Use this skill whenever the user needs game-related icons, board game piece icons, RPG icons, or any icon from game-icons.net. Triggers on phrases like "find an icon for", "download game icon", "game-icons.net", "SVG icon for [game concept]", "PNG icon", "need icons for a board game", or any request involving searching for or downloading icons related to games, fantasy, RPG, or tabletop themes.
---

# Game Icons Search & Download

Search and download SVG/PNG icons from [game-icons.net](https://game-icons.net) -- a collection of 4000+ free CC BY 3.0 icons covering games, fantasy, RPG, sci-fi, and more.

## Background

game-icons.net serves icons via a predictable URL scheme in both SVG and PNG (512x512) formats. It uses Algolia for search. All icons are CC BY 3.0 licensed (credit required: author names like lorc, delapouite, carl-olsen, skoll, etc.).

### URL Pattern

```
https://game-icons.net/icons/{fg_color}/{bg_color}/1x1/{author}/{icon-slug}.{svg|png}
```

- `{fg_color}`: hex color of the icon path (e.g. `000000` for black, `ffffff` for white)
- `{bg_color}`: hex color or `transparent` for the background
- `{author}`: icon author (e.g. `lorc`, `delapouite`)
- `{icon-slug}`: kebab-case icon name (e.g. `poker-hand`)
- Extension: `.svg` for vector, `.png` for 512x512 raster

**Color gotcha**: Using `ffffff` (white) foreground with `transparent` background produces an invisible icon on white backgrounds. Default to `000000/transparent` (black on transparent) for general use. Use `ffffff/000000` (white on black) when you need a filled tile look.

### Algolia Search API

The site's search is powered by Algolia with these public (search-only) credentials:

- **App ID**: `9HQ1YXUKVC`
- **API Key**: `fa437c6f1fcba0f93608721397cd515d` (read-only, safe to use)
- **Index**: `icons`

Each Algolia hit returns:
- `name`: Display name (e.g. "Poker Hand")
- `id`: Path used in URL (e.g. `1x1/lorc/poker-hand`)
- `tags`: Space-separated tags (e.g. "animal insect wing")
- `content`: Description text

## Bundled Scripts

### Search: `scripts/search.sh`

```bash
bash <skill-path>/scripts/search.sh <query> [hits_per_page]
```

Returns tab-separated results: `name \t id \t tags`

Example:
```bash
bash <skill-path>/scripts/search.sh "spider" 5
# Spider    1x1/carl-olsen/spider-alt    animal insect
# Spider eye    1x1/delapouite/spider-eye    creature eye insect
```

### Download: `scripts/download.sh`

```bash
bash <skill-path>/scripts/download.sh <output_dir> <fg_color> <bg_color> <format> <icon_id> [icon_id...]
```

- `format`: `svg` or `png`
- PNG files are 512x512 pixels

Examples:
```bash
# Download SVGs
bash <skill-path>/scripts/download.sh ./icons 000000 transparent svg 1x1/lorc/bee 1x1/delapouite/ant

# Download PNGs
bash <skill-path>/scripts/download.sh ./icons 000000 transparent png 1x1/lorc/bee 1x1/delapouite/ant
```

## Workflow

1. **Search** -- Run `search.sh` with the user's keyword. Show results as a table (name, tags).
2. **Confirm** -- Let the user pick which icons they want and which format (SVG or PNG).
3. **Download** -- Run `download.sh` with chosen icon IDs. Default to `000000/transparent` and `svg` unless the user specifies otherwise.

### Direct Download (no search needed)

If the user already knows the icon name and author, skip search and curl directly:

```bash
curl -s -o bee.svg 'https://game-icons.net/icons/000000/transparent/1x1/lorc/bee.svg'
curl -s -o bee.png 'https://game-icons.net/icons/000000/transparent/1x1/lorc/bee.png'
```

### Bulk Search Pattern

When the user needs icons for multiple concepts (e.g. "all Hive game pieces"), search each keyword separately and collect the best match per concept.

## Color Reference

| Use Case | fg | bg | Example |
|---|---|---|---|
| Black icon, no background | `000000` | `transparent` | General purpose, embedding in UI |
| White icon on dark tile | `ffffff` | `000000` | Dark-themed UIs, game boards |
| Custom color | any hex | any hex or `transparent` | Brand-colored icons |

## License

All icons from game-icons.net are **CC BY 3.0**. You must credit the original author. Authors include: lorc, delapouite, carl-olsen, skoll, sbed, lord-berandas, caro-asercion, cathelineau, and others. The author is embedded in the icon's `id` field (e.g. `1x1/lorc/bee` -- author is `lorc`).
