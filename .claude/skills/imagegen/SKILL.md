---
name: imagegen
description: Generate or edit raster images (UI mockups, icons, illustrations, clay/3D renders, mascots, transparent cutouts, store art) with whichever image model is available, Codex's image_gen or Antigravity's image generator today, on the user's own subscriptions. Use whenever a task needs a new bitmap image or an AI edit of an existing one, e.g. "generate an icon", "make an illustration", "mock up this screen", "create artwork for X", "edit this image", "remove the background". For UI mockups that guide a UI change or a design review, start from ui-mockups, which uses this. Not for SVG/vector work, diagrams, or charts that are better drawn in code.
---

# Image generation

Most coding agents cannot make images, but the agent CLIs on this Mac can, through
their built-in image tools, billed to the user's subscriptions, so no API key is
needed. This skill wraps them in one script any agent can call. It does not care
which model draws the picture: it uses the first one that works.

| Backend       | What draws the image                                    | Needs                                   |
| ------------- | ------------------------------------------------------- | --------------------------------------- |
| `codex`       | Codex CLI, its built-in `image_gen` tool                | `codex` (or the ChatGPT app), signed in |
| `antigravity` | Antigravity CLI (`agy`), its `image-generator` subagent | `agy`, signed in                        |

The default order is `codex`, then `antigravity`. When one fails (not installed,
signed out, out of quota, a refused brief), the script says why on stderr and tries
the next, so a usage limit on one subscription does not stop the work. Both are
also providers in T3 Code, which is why they are the two here; a new image-capable
CLI is one more `run_<name>` function in the script.

**If your own harness can make images** (Codex has `image_gen`, Antigravity has its
`image-generator` subagent), call that directly instead of the script, which would
only start a second copy of yourself. The brief-writing and checking advice below
still applies.

## Run it

The script lives next to this file: `scripts/imagegen.sh`. From the repo root that is
`.agents/skills/imagegen/scripts/imagegen.sh` (identical copy under `.claude/skills/`).

```bash
.agents/skills/imagegen/scripts/imagegen.sh -o <out.png> [options] "<brief>"
```

| Flag       | Meaning                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `-o PATH`  | Output file (required). With `-n` > 1 you get `PATH-1.png`, `PATH-2.png`, ... Never overwrites: an existing file makes it `PATH-v2.png`. |
| `-n COUNT` | Variants, one generation call each. Each adds roughly 30-60s.                                                                            |
| `-t`       | Real transparent background (alpha kept). Use for icons, stickers, cutouts.                                                              |
| `-i FILE`  | Attach an image (repeatable). By default it is a style/subject **reference**.                                                            |
| `-e`       | Make the first `-i` image the **edit target**: change only what the brief says.                                                          |
| `-b LIST`  | Backends to try, in order: `codex`, `antigravity`, or both (`antigravity,codex`).                                                        |
| `-m MODEL` | Model override for that backend. Needs a single backend in `-b`.                                                                         |

`IMAGEGEN_BACKEND` sets the default for `-b`, and `CODEX_BIN` / `AGY_BIN` point at a
CLI the script cannot find. It prints the absolute path of each saved image, one per
line (use those paths: they differ from `-o` when that file already existed), and
`imagegen: made with <backend>` on stderr. A single image takes about 30-90s and two
variants about 2 minutes. Each backend gets `IMAGEGEN_TIMEOUT` seconds (default 180
plus 90 per image) before the script stops it and tries the next, so a run can take
twice that when the first backend hangs: give the shell call a timeout of at least
10 minutes, or run it in the background. For several **distinct** images, start
separate invocations in parallel rather than one long `-n` run.

Pick a backend only when it matters: `-b codex` for a real alpha channel (`-t`),
which the script checks on macOS and warns about when it is missing; `-b antigravity`
for a second opinion on a mockup, since another model often finds another layout.

Output is usually PNG, around 1254x1254 for square requests (the model picks the
size; ask for "landscape 3:2" or "portrait 2:3" in the brief if the shape matters).
Resize or crop afterwards (`sips -Z 512 in.png --out out.png` on macOS, or a sharp
script) when the project needs exact pixels.

## Writing the brief

The model expands the brief itself, but a structured one gives far more consistent
results. Include only the lines that matter:

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

UI mockups have their own brief in [ui-mockups](../ui-mockups/SKILL.md).

For a set that must look like one family, generate the first image, check it, then
pass it back with `-i` as a style reference for every later one and say "match the
style, lighting, palette and framing of the reference exactly". If the repo already
has art in the target style, pass one or two existing assets with `-i` from the
start. Keep one backend for a whole family (`-b`), since each model has its own hand.

## After generating

1. **Look at every output** before using it. Check subject, style, stray
   text/watermarks, cropping, and (for `-t`) that the background is really
   transparent (`sips -g hasAlpha file.png` on macOS).
2. If something is off, iterate with **one** targeted change: re-run with a
   sharpened brief, or run `-e -i <bad.png> "change only X; keep everything else"`.
3. Show the user the result before wiring it into the project, unless they said to
   go ahead.
4. Never overwrite an existing project asset unless asked; write a sibling
   (`icon-v2.png`) and let the user pick.
5. Generate drafts into a scratch/temp folder (UI mockups go in the ignored
   `.github/pr-assets/<topic>/`), not the tracked repo, and copy only the chosen
   image in. Then run whatever asset pipeline the repo uses (icon registry
   generators, compression, etc.).

## Troubleshooting

- `CLI not found`: install Codex or Antigravity, or set `CODEX_BIN` / `AGY_BIN`. The
  ChatGPT desktop app ships Codex at
  `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`; Homebrew's
  `antigravity-cli` cask installs `agy`.
- `no images generated`: the script prints the backend's last words. Usually a
  refused brief, an expired login (the user runs `codex login`, or signs in to
  Antigravity), or a usage limit (Antigravity names the time its quota resets). The
  script has already tried the next backend; when all fail, report it to the user
  rather than retrying in a loop.
- Antigravity runs sandboxed in an empty temp folder, with the attached images
  copied in, and the script ignores anything it returns that is only a copy of an
  attached image. Codex runs read-only.
- Codex may log MCP auth errors (e.g. a Cloudflare OAuth prompt) to stderr. They are
  harmless.
