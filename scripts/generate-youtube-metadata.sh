#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  OPENAI_API_KEY=... ./scripts/generate-youtube-metadata.sh <scenes.json>

Environment:
  OPENAI_API_KEY              Required.
  OPENAI_METADATA_MODEL       Optional. Defaults to gpt-4o-mini.
  OPENAI_METADATA_MAX_RETRIES Optional. Not used by curl helper.
  OPENAI_METADATA_KEEP_FILE   Optional. Defaults to false.

The helper uploads the scenes file to the OpenAI Files API, calls the Responses
API with the versioned metadata prompt, extracts the JSON result, and prints
the parsed metadata path on success.
EOF
}

if [[ "${1:-}" == "" || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

for dep in curl jq sha256sum; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    printf 'Missing dependency: %s\n' "$dep" >&2
    exit 1
  fi
done

SCENES_FILE="$1"
if [[ ! -f "$SCENES_FILE" ]]; then
  printf 'Missing scenes file: %s\n' "$SCENES_FILE" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  printf 'OPENAI_API_KEY is required.\n' >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPT_FILE="$ROOT_DIR/prompts/youtube-metadata.prompt.md"
if [[ ! -f "$PROMPT_FILE" ]]; then
  printf 'Missing prompt file: %s\n' "$PROMPT_FILE" >&2
  exit 1
fi

MODEL="${OPENAI_METADATA_MODEL:-gpt-4o-mini}"
TMP_DIR="$(mktemp -d)"
UPLOAD_RESPONSE_FILE="$TMP_DIR/upload-response.json"
REQUEST_FILE="$TMP_DIR/request.json"
RESPONSE_FILE="$TMP_DIR/response.json"
TEXT_FILE="$TMP_DIR/response-text.json"
FILE_ID=""

cleanup() {
  local status=$?
  if [[ -n "$FILE_ID" && "${OPENAI_METADATA_KEEP_FILE:-false}" != "true" ]]; then
    curl --fail-with-body --silent --show-error \
      -X DELETE \
      -H "Authorization: Bearer ${OPENAI_API_KEY}" \
      "https://api.openai.com/v1/files/${FILE_ID}" >/dev/null || true
  fi
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT

if ! curl --fail-with-body --silent --show-error \
  https://api.openai.com/v1/files \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -F purpose="user_data" \
  -F file=@"${SCENES_FILE}" \
  -o "$UPLOAD_RESPONSE_FILE"; then
  printf 'OpenAI file upload failed:\n' >&2
  cat "$UPLOAD_RESPONSE_FILE" >&2 || true
  exit 1
fi

FILE_ID="$(jq -er '.id' "$UPLOAD_RESPONSE_FILE")"
if [[ -z "$FILE_ID" ]]; then
  printf 'Upload did not return a file id.\n' >&2
  exit 1
fi

jq -n \
  --arg model "$MODEL" \
  --arg file_id "$FILE_ID" \
  --rawfile prompt "$PROMPT_FILE" \
  '{
    model: $model,
    input: [
      {
        role: "user",
        content: [
          {type: "input_file", file_id: $file_id},
          {type: "input_text", text: $prompt}
        ]
      }
    ]
  }' >"$REQUEST_FILE"

if ! curl --fail-with-body --silent --show-error \
  https://api.openai.com/v1/responses \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @"$REQUEST_FILE" \
  -o "$RESPONSE_FILE"; then
  printf 'OpenAI response generation failed:\n' >&2
  cat "$RESPONSE_FILE" >&2 || true
  exit 1
fi

ASSISTANT_TEXT="$(jq -r '.output_text // ([.output[]?.content[]? | select(.type == "output_text") | .text] | join(""))' "$RESPONSE_FILE")"
if [[ -z "$ASSISTANT_TEXT" || "$ASSISTANT_TEXT" == "null" ]]; then
  printf 'Response did not contain text output.\n' >&2
  exit 1
fi

printf '%s' "$ASSISTANT_TEXT" >"$TEXT_FILE"
if ! jq -e . "$TEXT_FILE" >/dev/null; then
  printf 'Response text was not valid JSON.\n' >&2
  cat "$TEXT_FILE" >&2
  exit 1
fi

if [[ "$(basename "$(dirname "$SCENES_FILE")")" == "output" ]]; then
  OUTPUT_DIR="$(dirname "$SCENES_FILE")"
else
  OUTPUT_DIR="$(dirname "$SCENES_FILE")/output"
fi
mkdir -p "$OUTPUT_DIR"
OUTPUT_JSON="$OUTPUT_DIR/youtube-metadata.json"
cp "$TEXT_FILE" "$OUTPUT_JSON"
printf '%s\n' "$OUTPUT_JSON"
