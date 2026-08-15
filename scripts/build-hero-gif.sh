#!/usr/bin/env bash

set -e -o pipefail

green='\033[0;32m'
red='\033[0;31m'
nc='\033[0m'

for command_name in ffmpeg gifsicle; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo -e "${red}error${nc}: ${command_name} is required (brew install ffmpeg gifsicle)" >&2
    exit 1
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/slides-hero.XXXXXX")"
trap 'rm -rf "${build_dir}"' EXIT

ffmpeg -y -loglevel error \
  -loop 1 -t 1.5 -i "${repo_dir}/site/assets/quantumblack-preview.png" \
  -loop 1 -t 1.5 -i "${repo_dir}/site/assets/conference-preview.png" \
  -loop 1 -t 1.5 -i "${repo_dir}/site/assets/demo-preview.png" \
  -loop 1 -t 1.5 -i "${repo_dir}/references/dwmkerr-com-timeline-slide.png" \
  -filter_complex \
    '[0:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[qb];
     [1:v]crop=1152:648:24:85,scale=960:540,setsar=1[conference];
     [2:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[dwmkerr];
     [3:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1[edit];
     [qb][conference][dwmkerr][edit]concat=n=4:v=1:a=0,fps=2/3,split[frames][palette_source];
     [palette_source]palettegen=max_colors=128:stats_mode=full[palette];
     [frames][palette]paletteuse=dither=bayer:bayer_scale=5' \
  -loop 0 "${build_dir}/hero.gif"

gifsicle -O3 "${build_dir}/hero.gif" -o "${repo_dir}/site/assets/hero.gif"

echo -e "${green}✔${nc} rebuilt site/assets/hero.gif"
