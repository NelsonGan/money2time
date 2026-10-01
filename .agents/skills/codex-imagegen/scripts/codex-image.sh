#!/usr/bin/env bash
# Generate (or edit) raster images through the Codex CLI's built-in image_gen
# tool, billed to the ChatGPT/Codex subscription (no OPENAI_API_KEY needed).
#
# Usage:
#   codex-image.sh -o out.png [-n COUNT] [-i ref.png]... [-t] "prompt"
#
#   -o PATH   Output file. With -n > 1, files are PATH-1.png, PATH-2.png, ...
#   -n COUNT  Number of variants (one image_gen call each). Default 1.
#   -i FILE   Reference/edit image to attach (repeatable).
#   -e        Treat the first -i image as an edit target (preserve everything
#             the prompt does not ask to change), not just a style reference.
#   -t        Ask for a genuinely transparent background (keeps alpha).
#   -m MODEL  Codex model override (default: whatever config.toml says).
#
# Prints the absolute path of each saved image, one per line, on stdout.
# Codex's own transcript goes to a temp dir; its path is printed on failure.
set -euo pipefail

CODEX_BIN="${CODEX_BIN:-}"
if [[ -z "$CODEX_BIN" ]]; then
  if command -v codex >/dev/null 2>&1; then
    CODEX_BIN="$(command -v codex)"
  elif [[ -x /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex ]]; then
    CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
  elif [[ -x /Applications/Codex.app/Contents/Resources/codex ]]; then
    CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
  else
    echo "codex CLI not found (set CODEX_BIN)" >&2
    exit 127
  fi
fi
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
TMPDIR="${TMPDIR:-/tmp}"

out="" count=1 transparent=0 edit=0 model=""
images=()
while getopts "o:n:i:etm:" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    n) count="$OPTARG" ;;
    i) images+=("$(cd "$(dirname "$OPTARG")" && pwd)/$(basename "$OPTARG")") ;;
    e) edit=1 ;;
    t) transparent=1 ;;
    m) model="$OPTARG" ;;
    *) sed -n '2,20p' "$0" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
prompt="${*:-}"
[[ -n "$out" && -n "$prompt" ]] || { sed -n '2,20p' "$0" >&2; exit 2; }

out_dir="$(mkdir -p "$(dirname "$out")" && cd "$(dirname "$out")" && pwd)"
out_base="$(basename "$out")"
out_stem="${out_base%.*}"
log="$(mktemp -d "${TMPDIR%/}/codex-image.XXXXXX")/run.jsonl"

instructions="Use your built-in image_gen tool (not the CLI fallback, not SVG/HTML) to generate exactly ${count} image(s)"
if (( count > 1 )); then
  instructions+=", one separate image_gen call per variant, each a distinct take on the brief"
fi
instructions+=". Do not ask questions; make reasonable choices."
if (( transparent )); then
  instructions+=" The background must be genuinely transparent (real alpha channel), no checkerboard, no backdrop, no drop shadow plate."
fi
if (( ${#images[@]} )); then
  if (( edit )); then
    instructions+=" The first attached image is the EDIT TARGET: change only what the brief asks for and keep everything else identical. Any other attached images are references."
  else
    instructions+=" The attached image(s) are REFERENCES for style/subject only; create a new image."
  fi
fi
instructions+=" Do not copy, move or post-process the files yourself; just generate them and then reply DONE.

Brief:
${prompt}"

args=(exec --skip-git-repo-check --ephemeral -s read-only --json
      -c model_reasoning_effort=low -C "$out_dir")
[[ -n "$model" ]] && args+=(-m "$model")
for img in "${images[@]+"${images[@]}"}"; do args+=(-i "$img"); done

# `--` matters: codex's -i is variadic and would otherwise swallow the prompt.
"$CODEX_BIN" "${args[@]}" -- "$instructions" </dev/null >"$log" 2>"$log.err" || {
  echo "codex exec failed (see $log and $log.err)" >&2
  tail -20 "$log.err" >&2
  exit 1
}

thread_id="$(head -1 "$log" | sed -n 's/.*"thread_id":"\([^"]*\)".*/\1/p')"
gen_dir="$CODEX_HOME/generated_images/$thread_id"
if [[ -z "$thread_id" || ! -d "$gen_dir" ]]; then
  echo "No images generated (thread ${thread_id:-?}). Last messages:" >&2
  grep -o '"text":"[^"]*"' "$log" | tail -3 >&2
  exit 1
fi

i=0
# Oldest first so -1, -2, ... follow generation order.
while IFS= read -r src; do
  i=$((i + 1))
  ext="${src##*.}"
  if (( count == 1 && i == 1 )); then
    dest="$out_dir/$out_stem.$ext"
  else
    dest="$out_dir/$out_stem-$i.$ext"
  fi
  cp "$src" "$dest"
  echo "$dest"
done < <(ls -tr "$gen_dir"/*.png "$gen_dir"/*.jpg "$gen_dir"/*.webp 2>/dev/null)

(( i > 0 )) || { echo "Generated folder was empty: $gen_dir" >&2; exit 1; }
rm -rf "$(dirname "$log")"
