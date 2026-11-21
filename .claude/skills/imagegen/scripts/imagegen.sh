#!/usr/bin/env bash
# Generate (or edit) raster images with whichever image model this machine can
# reach, through an agent CLI's built-in image tool on the user's subscription
# (no API key needed). Backends, tried in order until one produces an image:
#
#   codex        Codex CLI, built-in image_gen tool (ChatGPT/Codex plan)
#   antigravity  Antigravity CLI (agy), image-generator subagent (Google plan)
#
# Usage:
#   imagegen.sh -o out.png [-n COUNT] [-i ref.png]... [-e] [-t] [-b LIST] "brief"
#
#   -o PATH   Output file. With -n > 1, files are PATH-1.png, PATH-2.png, ...
#   -n COUNT  Number of variants (one generation call each). Default 1.
#   -i FILE   Reference/edit image to attach (repeatable).
#   -e        Treat the first -i image as an edit target (preserve everything
#             the brief does not ask to change), not just a style reference.
#   -t        Ask for a genuinely transparent background (keeps alpha).
#   -b LIST   Backends to try, comma-separated, in order. Default: auto
#             (= codex,antigravity, skipping any CLI that is not installed).
#             Also settable with IMAGEGEN_BACKEND.
#   -m MODEL  Model override for the backend. Needs a single backend in -b.
#
# Prints the absolute path of each saved image, one per line, on stdout, and
# which backend made them on stderr. A backend that fails (not signed in,
# usage limit, refused brief) is reported on stderr and the next one is tried.
set -euo pipefail

usage() { sed -n '2,25p' "$0" >&2; exit 2; }

out="" count=1 transparent=0 edit=0 model="" backends="${IMAGEGEN_BACKEND:-auto}"
images=()
while getopts "o:n:i:etm:b:" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    n) count="$OPTARG" ;;
    i) [[ -f "$OPTARG" ]] || { echo "imagegen: no such image: $OPTARG" >&2; exit 2; }
       images+=("$(cd "$(dirname "$OPTARG")" && pwd)/$(basename "$OPTARG")") ;;
    e) edit=1 ;;
    t) transparent=1 ;;
    m) model="$OPTARG" ;;
    b) backends="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
brief="${*:-}"
[[ -n "$out" && -n "$brief" ]] || usage
[[ "$count" =~ ^[1-9][0-9]*$ ]] || { echo "imagegen: -n must be a positive number" >&2; exit 2; }
[[ "$backends" == auto ]] && backends="codex,antigravity"
if [[ -n "$model" && "$backends" == *,* ]]; then
  echo "imagegen: -m needs a single backend, e.g. -b codex -m <model>" >&2
  exit 2
fi

out_dir="$(mkdir -p "$(dirname "$out")" && cd "$(dirname "$out")" && pwd)"
out_base="$(basename "$out")"
out_stem="${out_base%.*}"
work="$(mktemp -d "${TMPDIR:-/tmp}/imagegen.XXXXXX")"
gen="$work/generated" # each backend leaves its images here, in generation order
mkdir -p "$gen"

# --- The request, shared by every backend --------------------------------

request="Generate exactly ${count} image(s)"
(( count > 1 )) && request+=", one separate generation call per variant, each a distinct take on the brief"
request+=". Do not ask questions; make reasonable choices."
(( transparent )) && request+=" The background must be genuinely transparent (real alpha channel), no checkerboard, no backdrop, no drop shadow plate."
if (( ${#images[@]} )); then
  if (( edit )); then
    request+=" The first attached image is the EDIT TARGET: change only what the brief asks for and keep everything else identical. Any other attached images are references."
  else
    request+=" The attached image(s) are REFERENCES for style/subject only; create a new image."
  fi
fi

is_image() { file -b "$1" | grep -qiE '^(PNG|JPEG|RIFF.*Web/?P)'; }

# --- Backends: each fills $gen with images and returns 0, or returns 1 ------

find_codex() {
  local c
  for c in "${CODEX_BIN:-}" "$(command -v codex 2>/dev/null || true)" \
    /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex \
    /Applications/Codex.app/Contents/Resources/codex; do
    [[ -n "$c" && -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

run_codex() {
  local bin log thread_id gen_dir src n=0
  bin="$(find_codex)" || { echo "imagegen: codex: CLI not found (set CODEX_BIN)" >&2; return 1; }
  log="$work/codex.jsonl"
  local prompt="Use your built-in image_gen tool (not the CLI fallback, not SVG/HTML). ${request} Do not copy, move or post-process the files yourself; just generate them and then reply DONE.

Brief:
${brief}"
  local args=(exec --skip-git-repo-check --ephemeral -s read-only --json
    -c model_reasoning_effort=low -C "$work")
  [[ -n "$model" ]] && args+=(-m "$model")
  for img in "${images[@]+"${images[@]}"}"; do args+=(-i "$img"); done
  # `--` matters: codex's -i is variadic and would otherwise swallow the prompt.
  if ! "$bin" "${args[@]}" -- "$prompt" </dev/null >"$log" 2>"$log.err"; then
    echo "imagegen: codex: exec failed:" >&2
    tail -5 "$log.err" >&2
    return 1
  fi
  thread_id="$(head -1 "$log" | sed -n 's/.*"thread_id":"\([^"]*\)".*/\1/p')"
  gen_dir="${CODEX_HOME:-$HOME/.codex}/generated_images/$thread_id"
  if [[ -n "$thread_id" && -d "$gen_dir" ]]; then
    while IFS= read -r src; do
      is_image "$src" || continue
      n=$((n + 1))
      cp "$src" "$gen/$(printf '%02d' "$n").${src##*.}"
    done < <(ls -tr "$gen_dir"/*.png "$gen_dir"/*.jpg "$gen_dir"/*.jpeg "$gen_dir"/*.webp 2>/dev/null)
  fi
  if (( n == 0 )); then
    echo "imagegen: codex: no images generated. Its last messages:" >&2
    grep -o '"text":"[^"]*"' "$log" | tail -3 >&2 || true
    return 1
  fi
}

find_agy() {
  local c
  for c in "${AGY_BIN:-}" "$(command -v agy 2>/dev/null || true)" \
    /Applications/Antigravity.app/Contents/Resources/bin/agy; do
    [[ -n "$c" && -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

run_antigravity() {
  local bin ws json src n=0 i=0 refs=""
  bin="$(find_agy)" || { echo "imagegen: antigravity: agy CLI not found (set AGY_BIN)" >&2; return 1; }
  # agy works in its own empty workspace: the references are copied in, and
  # it saves the images there, so it never touches the caller's files.
  ws="$work/antigravity"
  mkdir -p "$ws"
  for img in "${images[@]+"${images[@]}"}"; do
    i=$((i + 1))
    cp "$img" "$ws/reference-$i.${img##*.}"
    refs+=" $ws/reference-$i.${img##*.}"
  done
  local prompt="Use the built-in image-generator subagent (invoke_subagent with TypeName image-generator) to make the images; do not draw them with code, SVG or HTML. ${request}"
  [[ -n "$refs" ]] && prompt+=" The attached images, in order, are:${refs}. Give them to the image generator as its input images."
  prompt+=" Save every generated image in ${ws} as image-1.png, image-2.png, ... (keep the real extension if it is not PNG) by copying the file the generator returns with run_command. Do not create or change any other file. Reply DONE when the files are saved, or with the exact error if generation failed.

Brief:
${brief}"
  local args=(-p "$prompt" --dangerously-skip-permissions --output-format json
    --print-timeout "${IMAGEGEN_TIMEOUT:-900}s")
  [[ -n "$model" ]] && args+=(--model "$model")
  json="$work/antigravity.json"
  if ! (cd "$ws" && "$bin" "${args[@]}" </dev/null >"$json" 2>"$json.err"); then
    echo "imagegen: antigravity: agy failed:" >&2
    tail -5 "$json.err" >&2
    return 1
  fi
  while IFS= read -r src; do
    is_image "$src" || continue
    n=$((n + 1))
    cp "$src" "$gen/$(printf '%02d' "$n").${src##*.}"
  done < <(ls -tr "$ws"/image-*.png "$ws"/image-*.jpg "$ws"/image-*.jpeg "$ws"/image-*.webp 2>/dev/null)
  if (( n == 0 )); then
    echo "imagegen: antigravity: no images generated. Its reply:" >&2
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("response","").strip()[:600])' "$json" >&2 || cat "$json" >&2
    else
      head -c 600 "$json" >&2
    fi
    return 1
  fi
}

# --- Try each backend in turn ---------------------------------------------

used=""
IFS=',' read -r -a order <<<"$backends"
for b in "${order[@]}"; do
  case "$b" in
    codex) run_codex && { used=codex; break; } ;;
    antigravity | agy) run_antigravity && { used=antigravity; break; } ;;
    *) echo "imagegen: unknown backend '$b' (use codex or antigravity)" >&2 ;;
  esac
  rm -f "$gen"/*
done

if [[ -z "$used" ]]; then
  echo "imagegen: no backend produced an image (tried: $backends). Work files: $work" >&2
  exit 1
fi

i=0 total="$(ls "$gen" | wc -l | tr -d ' ')"
for src in "$gen"/*; do
  i=$((i + 1))
  if (( count == 1 && total == 1 )); then
    dest="$out_dir/$out_stem.${src##*.}"
  else
    dest="$out_dir/$out_stem-$i.${src##*.}"
  fi
  cp "$src" "$dest"
  if (( transparent )) && command -v sips >/dev/null 2>&1 &&
    ! sips -g hasAlpha "$dest" 2>/dev/null | grep -q 'hasAlpha: yes'; then
    echo "imagegen: warning: $dest has no alpha channel" >&2
  fi
  echo "$dest"
done
(( i == count )) || echo "imagegen: warning: asked for $count image(s), got $i" >&2
echo "imagegen: made with $used" >&2
rm -rf "$work"
