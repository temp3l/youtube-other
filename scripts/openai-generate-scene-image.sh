#!/usr/bin/env bash
set -euo pipefail

if [ "${#}" -lt 2 ]; then
  echo "usage: $0 <episode-id> <scene-id> [scene-id ...]" >&2
  exit 2
fi

episode_id="$1"
shift
scene_ids=("$@")
manifest_file="episodes/${episode_id}/manifest.json"

if [ ! -f ".env" ]; then
  echo "missing .env" >&2
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY is not set" >&2
  exit 1
fi

if [ ! -f "${manifest_file}" ]; then
  echo "missing manifest file: ${manifest_file}" >&2
  exit 1
fi

model="${OPENAI_IMAGE_MODEL:-gpt-image-1-mini}"
size="${OPENAI_IMAGE_SIZE:-1024x1024}"
quality="${OPENAI_IMAGE_QUALITY:-low}"
concurrency="${OPENAI_IMAGE_CONCURRENCY:-1}"

if ! [[ "${concurrency}" =~ ^[0-9]+$ ]] || [ "${concurrency}" -lt 1 ]; then
  concurrency=1
fi

api_size="${size}"
if [[ "${model}" == gpt-image-2* ]]; then
  if [[ "${size}" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    width="${BASH_REMATCH[1]}"
    height="${BASH_REMATCH[2]}"
    rounded_width=$(( (width + 15) / 16 * 16 ))
    rounded_height=$(( (height + 15) / 16 * 16 ))
    api_size="${rounded_width}x${rounded_height}"
  fi
fi

generate_scene() {
  local scene_id="$1"
  local prompt_file="episodes/${episode_id}/images/generated/prompts/${scene_id}.txt"
  local prompt_text=""
  local expected_filename=""
  local output_file=""
  local base_name=""
  local response_file=""
  local raw_file=""
  local payload=""
  local response=""
  local image_b64=""
  local scene_prompt_dir=""

  if [ -f "${prompt_file}" ]; then
    prompt_text="$(cat "${prompt_file}")"
  else
    prompt_text="$(jq -r --arg scene_id "${scene_id}" '
      (.scenePlan.scenes // .scenes // [])
      | map(select(.id == $scene_id))
      | .[0].imagePrompt // empty
    ' "${manifest_file}")"
    if [ -z "${prompt_text}" ]; then
      echo "missing prompt file: ${prompt_file}" >&2
      return 1
    fi
    scene_prompt_dir="$(dirname "${prompt_file}")"
    mkdir -p "${scene_prompt_dir}"
    printf '%s\n' "${prompt_text}" > "${prompt_file}"
  fi

  expected_filename="$(jq -r --arg scene_id "${scene_id}" '
    (.scenePlan.scenes // .scenes // [])
    | map(select(.id == $scene_id))
    | .[0].expectedImageFilenames[0] // empty
  ' "${manifest_file}")"

  if [ -z "${expected_filename}" ]; then
    echo "could not determine expected filename for ${scene_id} from ${manifest_file}" >&2
    return 1
  fi

  output_file="episodes/${episode_id}/images/generated/${expected_filename}"
  base_name="${expected_filename%.*}"
  response_file="episodes/${episode_id}/images/generated/${base_name}.response.json"
  raw_file="episodes/${episode_id}/images/generated/${base_name}.openai.png"

  mkdir -p "$(dirname "${output_file}")"
  mkdir -p "$(dirname "${response_file}")"

  payload="$(jq -n \
    --arg model "${model}" \
    --arg prompt "${prompt_text}" \
    --arg size "${api_size}" \
    --arg quality "${quality}" \
    '{
      model: $model,
      prompt: $prompt,
      size: $size,
      quality: $quality,
      n: 1
    }')"

  response="$(curl -sS https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${payload}")"

  printf '%s\n' "${response}" > "${response_file}"

  error_message="$(printf '%s' "${response}" | jq -r '.error.message // empty')"
  if [ -n "${error_message}" ]; then
    printf '%s\n' "${response}" >&2
    return 1
  fi

  image_b64="$(printf '%s' "${response}" | jq -r '.data[0].b64_json // empty')"
  if [ -z "${image_b64}" ]; then
    printf '%s\n' "${response}" >&2
    echo "missing image payload in response" >&2
    return 1
  fi

  printf '%s' "${image_b64}" | base64 -d > "${raw_file}"

  node --input-type=module - "${raw_file}" "${output_file}" "${size}" <<'NODE'
import fs from "node:fs/promises";
import sharp from "sharp";

const [rawPath, outputPath, requestedSize] = process.argv.slice(2);
const match = /^(\d+)x(\d+)$/u.exec(requestedSize ?? "");

if (!match) {
  throw new Error(`invalid OPENAI_IMAGE_SIZE: ${requestedSize}`);
}

const width = Number.parseInt(match[1] ?? "", 10);
const height = Number.parseInt(match[2] ?? "", 10);

const buffer = await sharp(rawPath)
  .resize(width, height, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();

await fs.writeFile(outputPath, buffer);
NODE

  echo "${output_file}"
}

if [ "${#scene_ids[@]}" -eq 1 ]; then
  generate_scene "${scene_ids[0]}"
  exit $?
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

running=0
declare -a pids=()
declare -a scene_refs=()

for scene_id in "${scene_ids[@]}"; do
  while [ "${running}" -ge "${concurrency}" ]; do
    wait -n
    running=$((running - 1))
  done

  log_file="${tmpdir}/${scene_id}.log"
  (
    generate_scene "${scene_id}"
  ) >"${log_file}" 2>&1 &
  pids+=("$!")
  scene_refs+=("${scene_id}")
  running=$((running + 1))
done

status=0
while [ "${#pids[@]}" -gt 0 ]; do
  pid="${pids[0]}"
  scene_id="${scene_refs[0]}"
  if ! wait "${pid}"; then
    status=1
  fi
  cat "${tmpdir}/${scene_id}.log"
  pids=("${pids[@]:1}")
  scene_refs=("${scene_refs[@]:1}")
done

exit "${status}"
