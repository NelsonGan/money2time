---
name: codex-imagegen
description: Generate or edit raster images (icons, illustrations, clay/3D renders, mascots, transparent cutouts, mockups, store art) through the Codex CLI's built-in image_gen tool on the user's ChatGPT/Codex subscription. Use whenever a task needs a new bitmap image or an AI edit of an existing one, e.g. "generate an icon", "make an illustration", "create artwork for X", "edit this image", "remove the background". Not for SVG/vector work, diagrams, or charts that are better drawn in code.
---

# Codex image generation

Most coding agents (Claude Code, Cursor, etc.) cannot make images. The Codex CLI can,
through its built-in `image_gen` tool, billed to the user's ChatGPT/Codex subscription,
so no `OPENAI_API_KEY` is needed. This skill wraps that in one script any agent can call.

**If you are Codex:** you already have `image_gen`. Call it directly (your own `imagegen`
system skill covers it) instead of running this script, which would only start a second
Codex. The brief-writing and checking advice below still applies.

## Run it

The script lives next to this file: `scripts/codex-image.sh`. From the repo root that is
`.agents/skills/codex-imagegen/scripts/codex-image.sh` (identical copy under
`.claude/skills/`).

```bash
.agents/skills/codex-imagegen/scripts/codex-image.sh -o <out.png> [options] "<brief>"
```

| Flag       | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| `-o PATH`  | Output file (required). With `-n` > 1 you get `PATH-1.png`, `PATH-2.png`, ...   |
| `-n COUNT` | Variants, one `image_gen` call each. Each adds roughly 30-60s.                  |
| `-t`       | Real transparent background (alpha kept). Use for icons, stickers, cutouts.     |
| `-i FILE`  | Attach an image (repeatable). By default it is a style/subject **reference**.   |
| `-e`       | Make the first `-i` image the **edit target**: change only what the brief says. |
| `-m MODEL` | Codex model override. Normally leave unset.                                     |

It prints the absolute path of each saved image, one per line. A single image takes
about 60-90s and two variants about 2 minutes, so give the shell call a timeout of at
least 5 minutes (add ~1 minute per extra variant), or run it in the background. For
several **distinct** assets, start separate invocations in parallel rather than one long
`-n` run.

Output is PNG, usually 1254x1254 for square requests (the model picks the size; ask for
"landscape 3:2" or "portrait 2:3" in the brief if the shape matters). Resize or crop
afterwards (`sips -Z 512 in.png --out out.png` on macOS, or a sharp script) when the
project needs exact pixels.

Requirements: the Codex CLI, signed in (`codex login`). The script finds it on `PATH`,
or inside the ChatGPT/Codex desktop app; set `CODEX_BIN` to point elsewhere.

## Writing the brief

Codex expands the brief itself, but a structured one gives far more consistent results.
Include only the lines that matter:

```text
Asset type: <where it will be used, e.g. 512px category icon in a mobile app>
Subject: <the thing, concretely>
Style/medium: <e.g. soft clay 3D render, matte, rounded forms>
Composition/framing: <centered, 3/4 view, fills ~80% of the canvas, no cropping>
Lighting/mood: <soft studio light from top-left, gentle ambient occlusion>
Color palette: <specific colours or "match the reference">
Text (verbatim): "<exact text>"   (omit when the image must contain no text)
Avoid: <text, watermark, background, drop shadow, extra objects>
```

For a set that must look like one family, generate the first image, check it, then pass
it back with `-i` as a style reference for every later one and say "match the style,
lighting, palette and framing of the reference exactly". If the repo already has art in
the target style, pass one or two existing assets with `-i` from the start.

## After generating

1. **Look at every output** before using it. Check subject, style, stray
   text/watermarks, cropping, and (for `-t`) that the background is really transparent
   (`sips -g hasAlpha file.png` on macOS).
2. If something is off, iterate with **one** targeted change: re-run with a sharpened
   brief, or run `-e -i <bad.png> "change only X; keep everything else"`.
3. Show the user the result before wiring it into the project, unless they said to go
   ahead.
4. Never overwrite an existing project asset unless asked; write a sibling
   (`icon-v2.png`) and let the user pick.
5. Generate drafts into a scratch/temp folder, not the repo, and copy only the chosen
   image in. Then run whatever asset pipeline the repo uses (icon registry generators,
   compression, etc.).

## Troubleshooting

- `codex CLI not found`: install Codex, or set `CODEX_BIN`. The ChatGPT desktop app
  ships it at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`.
- `No images generated`: the transcript path is printed; read the last `agent_message`
  in it. Usually a refused prompt, an expired login (the user runs `codex login`), or a
  subscription usage limit. Report it to the user rather than retrying in a loop.
- Codex may log MCP auth errors (e.g. a Cloudflare OAuth prompt) to stderr. They are
  harmless.
