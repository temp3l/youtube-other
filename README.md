## horrorr stories

- https://chatgpt.com/g/g-p-6a317d326e30819183556eca604b770c/c/6a3b3c87-809c-83eb-b2cc-a9da8d2fffc9
- ./content-ideas/content/
- 41-60 already multilanguage

---

/home/box/workspace/fehmarn-seo/youtube/other/content-ideas/dark-truth-episodes-001-110-localized-audio-ready/
check: audio-ready-thumbnails
review: https://chatgpt.com/c/6a3b3821-ec44-83eb-b964-6ed82ae37447
review: https://chatgpt.com/share/6a3b47fb-3a00-83eb-bf6b-9bdefe27f0a6

- if you could utilize openai API - how would this change the pipeline?

## comntent to video

Copy the following as one prompt into Codex: https://chatgpt.com/c/6a3b3821-ec44-83eb-b964-6ed82ae37447

##

- steal the content - research other sources - reproduce
- we need better prompts
- most expensive task: 'audio to text'
  - use linux `whisper` to transcribe locally - saving shitloads of money
  - you have fast a fast dekstop/macbook ? ;)

## cash

- 8000€ right now
- 1 share (1%) = 80€
- 80€ = 10 videos \* 4 sprachen = 40 videos
  - 50% of total revenue
- membershit

### Getting paid per channel

- history channel
- scary movies ...

### Strategy ?

- build 5 channels - 5 disctinct topics
- see how it g(rows)

## Content production in a nutshell

Facts and scientific concepts are not copyrighted.

1. History & Historical Mysteries
2. Psychology & Human Behavior
3. Science & Space
4. Programming & Technology

# howto:

## What I learned about content

- fictional stories are copywrite protected - even when rephrased
- urban legends are _less_ protected
  - financial strategies ...
  - programming lessons ...
  - historical facts ...

we might run into more or less copywrite problems depending on type of content....

- let's find an neiche with low entry barrier
- lets built followers -

## document for manual task execution

provide me documentation about how to run all tasks in sequence in order to produce a full video with openai generated audio,images and video output, and fetching the transcript from a youtube video.
I also want to write informational log file during every video generation run, which lists executed commands, results, errors and execution times.

## very fast voice

i have added the "very fast voice" configuration to docs/voice-settings.md. wire it up. and use the very fast voice setting as default for generatig voice audios.

## generate horror stories

- check: /home/box/workspace/fehmarn-seo/youtube/other/content-ideas/youtube-10-min-scary-stories/english/
- there are 0-6 without clear audio instructions inside
- 7-10 with clear audio instructions
- produce one of each

## prompt for special effects

provide me a recommendation on how to solve the following:
some of my youtube shorts scripts will contain special effects and special noises, like **Plitsch**. or **Splash**.
Analyse all the short scripts and extract these special instructions in a separate file.
I want them to be generated with audio-generation prompts. Do not generate the same effect twice, but re-use the generated file where relevant.

---

make sure all images can be grasped within the 6-9 seconds they are beeing displayed. re-use existing images in case the image prompts are expected to generate very similar output

there are only 8 files in images/generated/prompts and only 6 files in images/generated/metadata is that correct?
make sure all scenes will have the relevant generated prompts, metadata and images.

i want all new videos to have a new scene/image every 6-9 seconds. how can we make this happen? recommend a strategy.
make sure this never happens again: """  
So the images are “out of sync” because the system is using:

- stale or transcript-derived scene timing
- generic visual placeholders
- prompt text that is not a proper visual spec
  """

re-generate all audio and transcript files for the 003-Baby-Memory, start from the rewritten-script.md

name the episode: "003-Baby-Memory-2" and produce a video from this source: https://www.youtube.com/watch?v=royoy7-PyTw

name the episode: "002-Ancient-Humans-at-Night"

make sure you never use the test tone again when generating speech but the openai api call with curl command and relevant settings.
also make sure that the script.md's text is always rephrased in simple language and the simple one is used for speech generation. i prefer long sentences over multiple small ones. Also i always want you to use a human readable name with "###-${title}" format when creating new episode folders. Also make sure to always use 2 parallel api calls when generating speech to speed things up - if that is possible, otherwise fallback to sequential voice generation with a single api concurrent api call.

---

after getting the text from a youtube video source I always want it to be rephrased in a totally custom but simple way and easy language. it should be clearly distinct from the original source but carry the same message.

---

the narration.wav looks good now, continue with re-generating the transcript and metadata files with openai. then stop and let me check everything.

document, commit and push everything that is relevant. then merge the branch into master

what are the recommended next steps in order to generate the full spanish video?
there are more segments in the spanish transcript than i have generated images, can you solve that without generating new images? you might use the same image multiple times and/or consult openai API via curl command when unsure which image fits the current clip

i have changed the docs/voice-settings.md to contain a slow and a fast voice.
i want this to be configurable per episode.

i want to produce the episodes in multiple languages while generating the scene images only once. I will place the translated scripts in the ./episodes/\*/languages folder. I want the language to be configurable. make sure to always use the correct voice-settings from ./docs/voice-settings.md, ask if unsure which one to use and adjust them for the specified language.
Do not generate or touch any of the existing images. just implement the multilanguage feature. make sure all metadata for seo effective upload and settings configuration will also implement the multilanguae feature. i want all clips to be generated on demand and be put into clips-{länderkürzel} folder.
generate the same amount of clips as in the english version that was generated from script.md, you might need to use the same image for the last clips if you need more images, or similar approach to match the scene and clip and image count.
i want the metadata in youtube.md to contain a text based chapter description in the following format:
"""
00:00 short and concise chapter description
00:25 short and concise chapter description
00:50 short and concise chapter description
"""

Ask me any questions you might have and provide recommendations.
should i use openai api to generate the text based chapter description? if so implement the strategy for that.

---

i want to generate the transcript files with openai API instead of running whisper locally. i want the model to be configurable from .env file, start with: gpt-4o-mini-transcribe. now wire up everything and let me choose per episode and language if i want to use local whisper or the openai API.

---

i want to run the translations of the script.md fully automatic with openai API and have a centralized config file for defining the languages to be generated

001-calhoun-experiment

i want to generate seo effective thumbnail and title for every video with the openai API.
Have the API create five title candidates, each with a score. save the response and select the highest one.
recommend me how to do this while keeping token consumption low.

# scaffolding

i need an app where i can input a youtube or ticktok url of a video. the app should then fetch the transcript of the video the transcript will contian alot of spelling mistakes and bad grammar. i want the app to fix the mistaskes and the bad grammar. the app should then rephrase the whole content so that a wide audience can easily grasp it. the app should then transform the the rephrased content from text into voice with a slow male voice. i then want it to use whisper to create a transcript from that with precicse but fast timestamps. i then want to it to generate visually appealing images from a prompt template. i will define the prompt template later on. the app should then combine the images and the audio aligned to the correct timestamps into a video the app should also generate a file with SEO effective metadata, like tags, descriptions, titles etc - so that i can easily copy paste that when uploading the video to ticktock or youtube. let's start a debate, give me recommendations and ask me anything you might need to know. goal is to create the whole app with a single codex prompt and use typescript and linux utilities to pull it off.

## scaffolding prompt

OpenArt’s Essential plan currently includes 4,000 monthly credits, eight parallel generations, image/video/audio models, consistent-character features, and personalized models. However, **OpenArt states that it currently has no public API**, so Codex cannot securely wire it as a normal programmatic provider. The prompt therefore requires a provider abstraction with an OpenArt-assisted workflow: generate timestamped prompt batches, open/import them into OpenArt, download the results, and automatically ingest and validate the files. It explicitly forbids brittle credential scraping or undocumented private-API reverse engineering. ([OpenArt][1])

The tutorial’s publicly exposed core method is incorporated: create one visual prompt for every script timestamp, preserve timestamp/scene naming, generate images in batches, and position each image at the matching narration point. ([YouTube][2])

Copy the following as **one single Codex prompt**:

You are a principal TypeScript platform architect, AI-media pipeline engineer, FFmpeg specialist, and production reliability engineer.

You are working directly inside the current repository. Build the complete initial setup and wiring for a local-first application that transforms an authorized YouTube URL, TikTok URL, or local media file into a rewritten, narrated, illustrated video with accurate captions and publishing metadata.

Do not merely explain what should be built. Inspect the repository, create or update the files, install dependencies when appropriate, implement the pipeline, create tests and documentation, and validate the result by running the available checks.

Do not ask for confirmation for ordinary engineering decisions. Make sound production-oriented decisions and document them. Only stop when progress is impossible because a required external credential, authenticated browser action, or paid-provider action is unavailable.

The target environment is Linux.

# Primary objective

Build an application that can:

1. Accept:

   - a YouTube URL;
   - a TikTok URL;
   - or a local video/audio file.

2. Acquire the source transcript:

   - prefer embedded or platform-provided subtitles;
   - otherwise extract authorized audio and transcribe it;
   - support local media as the reliable fallback.

3. Clean the transcript conservatively:

   - fix spelling;
   - fix punctuation;
   - fix sentence boundaries;
   - fix obvious grammar errors;
   - remove accidental repetitions and configurable filler words;
   - preserve names, dates, numbers, monetary values, percentages, quotations, technical terms, and factual claims;
   - flag uncertain corrections instead of silently inventing facts.

4. Rewrite the cleaned transcript for a broad audience:

   - use clear spoken language;
   - shorten long sentences;
   - explain jargon;
   - remove unnecessary repetition;
   - improve structure and transitions;
   - preserve the original factual meaning;
   - never add unsupported claims;
   - produce narration suitable for text-to-speech.

5. Convert the rewritten narration to speech:

   - use a calm, mature, slow male voice;
   - target approximately 120–135 words per minute;
   - generate audio per scene rather than as one monolithic request;
   - preserve natural pauses;
   - make the TTS provider replaceable;
   - initially support an OpenAI-compatible TTS provider and a mock provider.

6. Run Whisper against the generated narration:

   - generate fast but precise segment and word timestamps;
   - support local whisper.cpp first;
   - make transcription replaceable through an interface;
   - retain the canonical rewritten script text;
   - use Whisper primarily for timings;
   - reconcile Whisper-recognized words against canonical narration so captions do not inherit new Whisper spelling mistakes.

7. Generate an image prompt for every meaningful timestamped scene:

   - one visual per timestamped narration segment;
   - align every image with the exact scene audio interval;
   - use a configurable global prompt template;
   - support future character/style references;
   - support both 16:9 and 9:16 output;
   - generate prompts in batches;
   - name prompts and image files deterministically by scene number and timestamp;
   - prevent scene/image ordering mistakes.

8. Integrate OpenArt.ai as the primary assisted image-generation workflow:

   - the user has an OpenArt Essential subscription;
   - OpenArt currently has no documented public API;
   - do not reverse-engineer private endpoints;
   - do not scrape cookies, passwords, session tokens, or credentials;
   - do not attempt to bypass anti-bot controls;
   - do not claim full unattended OpenArt automation unless a documented API becomes available;
   - instead create an OpenArt-assisted batch workflow that:

     - exports copy-ready prompt batches;
     - exports a JSON manifest;
     - exports a Markdown or HTML generation worksheet;
     - includes scene number, timestamp, aspect ratio, prompt, negative prompt, continuity references, and expected filename;
     - allows the user to generate images in OpenArt in batches;
     - watches or scans an import directory for downloaded files;
     - maps downloaded images to scenes;
     - validates dimensions, file type, ordering, duplicates, and missing scenes;
     - provides an explicit CLI command to import/rename/map the downloaded images;
     - supports rerendering only missing or rejected scenes;
     - optionally opens the OpenArt generation page in the default browser without automating login or private APIs.

   - include a generic ImageProvider interface so a documented API provider can later be added.
   - include MockImageProvider and PlaceholderImageProvider implementations for automated tests and end-to-end local validation.

9. Assemble the audio, images, captions, overlays, and transitions into final videos:

   - use FFmpeg and ffprobe;
   - support YouTube 16:9;
   - support TikTok and YouTube Shorts 9:16;
   - support subtle configurable Ken Burns motion;
   - support crossfades without causing audio drift;
   - generate captions in SRT, VTT, and ASS formats;
   - optionally burn captions into the rendered video;
   - preserve an uncaptioned output as well;
   - normalize narration loudness;
   - verify the finished container, streams, duration, codecs, dimensions, and seekability.

10. Generate platform-specific publishing metadata:

    - multiple title candidates;
    - selected recommended title;
    - YouTube description;
    - TikTok caption;
    - tags;
    - hashtags;
    - chapters derived from real timestamps;
    - thumbnail text candidates;
    - cover text candidates;
    - pinned-comment suggestion;
    - concise content summary;
    - primary and secondary keywords;
    - warnings for claims that require review;
    - metadata must accurately reflect the final output;
    - avoid misleading clickbait and unsupported promises.

# Rights and safety requirement

The application must display and document that users may only process media they own, are licensed to reuse, or otherwise have authorization to transform.

Do not build functionality intended to bypass DRM, access controls, private content, paywalls, authentication, or platform restrictions.

URL ingestion must fail safely and provide a local-file fallback.

# Tutorial workflow to incorporate

Incorporate the useful workflow demonstrated in the referenced YouTube automation tutorial:

- derive image prompts from the timestamped script;
- create one image for each timestamp or meaningful narration segment;
- keep visuals tightly tied to what is being spoken at that moment;
- generate images in manageable batches;
- identify each image using its scene number and timestamp;
- download or collect generated images into a predictable directory;
- ensure filenames map deterministically to timestamps;
- use those timestamps to place the images at the correct moments;
- prevent arbitrary images from being selected simply because they are in alphabetical or filesystem order;
- retain a manifest as the source of truth;
- allow only affected scenes to be regenerated;
- check that each visual actually represents the narration rather than merely sharing generic keywords.

Do not blindly reproduce any questionable revenue claims, marketing claims, or brittle implementation shortcuts from the tutorial. Implement the underlying media workflow robustly.

# Architecture

Use a pnpm workspace with strict TypeScript.

Use this initial structure unless the repository already has an equivalent, better-organized structure:

apps/
cli/
api/
web/

packages/
domain/
config/
source-ingestion/
transcription/
transcript-cleaning/
rewriting/
scene-planning/
speech/
alignment/
image-generation/
rendering/
metadata/
persistence/
observability/
process-runner/
shared/
testing/

Implement the CLI fully.

For the first iteration, the API and web UI may be minimal but must be correctly scaffolded and wired to shared application services. Do not duplicate pipeline logic in the CLI, API, or web application.

Use dependency inversion. Core domain code must not import provider-specific SDKs or shell-process implementations.

# Recommended technology

Use:

- Node.js 22 or the newest compatible installed LTS;
- TypeScript with full strictness;
- pnpm workspaces;
- Zod for runtime validation;
- Pino for structured logging;
- Commander or Citty for the CLI;
- SQLite for local persistence;
- Drizzle ORM unless the existing repository already standardizes on another suitable ORM;
- Vitest for unit and integration tests;
- ESLint;
- Prettier;
- FFmpeg;
- ffprobe;
- yt-dlp for authorized metadata, subtitle, and media acquisition where permitted;
- whisper.cpp for local transcription and alignment;
- Sharp and SVG for deterministic visual overlays;
- native child_process.spawn or a safe process abstraction using argument arrays;
- optional Fastify or NestJS for the API, choosing the least complex option consistent with the current repository;
- a minimal web interface only after the reusable application layer works.

Do not introduce Kubernetes, RabbitMQ, Redis, PostgreSQL, Temporal, or other distributed infrastructure for the local-first version.

# Domain model

Create strict domain types and Zod schemas for at least:

- SourceUrl;
- SourcePlatform;
- SourceMetadata;
- SourceMedia;
- Transcript;
- TranscriptSegment;
- TranscriptWord;
- TranscriptCorrection;
- UncertainTerm;
- CleanedTranscript;
- RewrittenScript;
- Claim;
- Scene;
- ScenePlan;
- VoiceProfile;
- AudioSegment;
- AlignmentResult;
- WordTiming;
- CaptionSegment;
- ImagePrompt;
- ImageAsset;
- SceneTiming;
- RenderProfile;
- PublishingMetadata;
- ArtifactReference;
- PipelineRun;
- PipelineStepRun;
- EpisodeManifest;
- ProviderUsage;
- PipelineError.

Use branded identifiers where appropriate:

- EpisodeId;
- SceneId;
- ArtifactId;
- PipelineRunId.

Avoid `any`, unsafe casts, non-null assertions, and unvalidated external data.

Use readonly data where mutation is not required.

Validate every external boundary:

- CLI input;
- environment variables;
- URLs;
- provider responses;
- subprocess results;
- filesystem manifests;
- downloaded/imported images;
- JSON generated by an LLM;
- database records where appropriate.

# Episode workspace

For each episode, create:

episodes/<episode-slug>/
source/
source.json
source-media.\*
original-transcript.json
original-transcript.srt
transcript/
cleaned-transcript.json
cleaned-transcript.md
corrections.json
uncertain-terms.json
script/
rewritten-script.json
rewritten-script.md
claims.json
scenes.json
audio/
segments/
narration.wav
narration.mp3
alignment.json
captions/
captions.srt
captions.vtt
captions.ass
images/
prompt-template.md
prompts.json
prompt-batches/
openart-workbook.html
openart-workbook.md
inbox/
generated/
rejected/
metadata/
publishing.json
youtube.json
tiktok.json
titles.txt
description.txt
tags.txt
chapters.txt
publishing.md
output/
youtube-16x9-captioned.mp4
youtube-16x9-clean.mp4
vertical-9x16-captioned.mp4
vertical-9x16-clean.mp4
thumbnail.png
logs/
manifest.json

The manifest must be the authoritative source of pipeline state.

Do not infer scene ordering from directory listing order.

# Pipeline behavior

Implement every stage as a versioned, idempotent pipeline step.

Use an abstraction similar to:

interface PipelineStep<TInput, TOutput> {
readonly name: string;
readonly version: string;

execute(
context: PipelineContext,
input: TInput,
signal: AbortSignal,
): Promise<TOutput>;

calculateCacheKey(input: TInput): Promise<string>;
}

Each pipeline step must:

- validate input;
- calculate a deterministic cache key;
- skip execution when a valid matching artifact already exists;
- persist start time, completion time, result, provider usage, and error;
- support cancellation;
- use bounded retries only for transient errors;
- never retry deterministic validation failures;
- write temporary files atomically;
- move artifacts into place only after validation;
- expose actionable failures;
- avoid deleting successful artifacts when a later stage fails.

Pipeline stages:

1. inspect-source;
2. acquire-transcript;
3. extract-or-normalize-audio;
4. transcribe-source-if-needed;
5. clean-transcript;
6. rewrite-script;
7. extract-and-check-claims;
8. plan-scenes;
9. synthesize-scene-audio;
10. concatenate-audio;
11. align-final-audio;
12. reconcile-canonical-caption-text;
13. create-captions;
14. create-image-prompts;
15. export-openart-batches;
16. import-image-assets;
17. validate-image-assets;
18. generate-publishing-metadata;
19. render-video;
20. validate-output;
21. package-results.

Allow execution:

- from the beginning;
- from a specified stage;
- until a specified stage;
- for a single scene;
- for missing scenes only;
- for one output format only.

# Source ingestion

Create:

interface SourceAdapter {
readonly platform: SourcePlatform;

supports(url: URL): boolean;

inspect(
url: URL,
signal: AbortSignal,
): Promise<SourceMetadata>;

acquireTranscript(
source: SourceMetadata,
signal: AbortSignal,
): Promise<TranscriptAcquisitionResult>;

acquireMedia?(
source: SourceMetadata,
signal: AbortSignal,
): Promise<SourceMedia>;
}

Implement:

- YouTubeSourceAdapter;
- TikTokSourceAdapter;
- LocalFileSourceAdapter.

Prefer subtitle acquisition in this order:

1. manually supplied subtitle;
2. creator-provided subtitle;
3. platform-generated subtitle;
4. transcription from authorized media.

Never hide extraction errors.

Record which acquisition strategy was used.

Ensure URLs cannot be used for SSRF:

- allowlist supported public hostnames;
- reject localhost;
- reject private IP ranges;
- reject file URLs;
- reject non-HTTP protocols;
- resolve redirects safely;
- limit redirect count;
- validate final hostname;
- limit file size and duration;
- enforce subprocess timeouts.

# Transcript cleaning and rewriting

Create provider-neutral interfaces for language-model operations.

Require structured JSON output validated with Zod.

Cleaning must be conservative.

For every material correction, preserve:

- original text;
- corrected text;
- confidence;
- category;
- reason;
- whether human review is recommended.

Protect:

- names;
- dates;
- years;
- currency;
- quantities;
- percentages;
- quotations;
- URLs;
- product names;
- legal or medical terminology;
- identifiers.

The rewrite stage must keep a mapping between rewritten sections and original transcript segment IDs.

Detect unsupported additions by comparing extracted claims before and after rewriting.

Mark uncertain claims for review.

Do not pretend automated factual verification has occurred unless an actual verification provider is implemented.

# Scene planning

Scene planning is the central source of truth for image timing.

Each scene must include:

- scene ID;
- sequence number;
- canonical narration;
- original transcript segment references;
- estimated duration;
- actual audio duration after TTS;
- start time;
- end time;
- visual purpose;
- subject;
- action;
- setting;
- composition;
- camera framing;
- mood;
- continuity references;
- on-screen text;
- negative constraints;
- output aspect ratios;
- image prompt;
- expected image filenames;
- quality status.

Prefer semantic scene boundaries.

Default constraints:

- one principal idea per scene;
- approximately 15–45 spoken words;
- typically 5–12 seconds for short-form content;
- typically 8–20 seconds for long-form educational content;
- do not split sentences unnaturally merely to hit duration targets;
- split visually overloaded scenes;
- merge scenes that would result in meaningless rapid cuts.

# Text-to-speech

Create:

interface SpeechProvider {
synthesize(
request: SpeechSynthesisRequest,
signal: AbortSignal,
): Promise<SpeechSynthesisResult>;
}

Implement:

- OpenAiCompatibleSpeechProvider;
- MockSpeechProvider.

Generate one audio file per scene.

After generation:

- inspect duration with ffprobe;
- persist actual duration;
- reject zero-length or corrupt files;
- concatenate with FFmpeg;
- preserve deterministic scene ordering;
- normalize sample rate and channel layout;
- normalize loudness;
- retain WAV for processing and MP3/AAC as delivery formats.

Default voice profile:

- male;
- calm;
- mature;
- clear;
- informative;
- warm but not theatrical;
- 120–135 words per minute;
- natural sentence pauses;
- longer section pauses;
- no exaggerated advertisement voice.

Do not hard-code a provider-specific voice ID into domain code.

OpenAI speech configuration is now available through project, episode, environment, and CLI overrides. The repo uses `docs/voice-settings.md` as the canonical prompt-level voice guide, and the speech provider reads:

- `MEDIAFORGE_TTS_PROVIDER=openai-compatible`
- `MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL`
- `MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY`
- `MEDIAFORGE_OPENAI_SPEECH_MODEL`
- `MEDIAFORGE_OPENAI_SPEECH_VOICE`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_SPEECH_MODEL`
- `OPENAI_SPEECH_VOICE`

CLI equivalents are available via `--tts-provider`, `--openai-base-url`, `--openai-api-key`, `--openai-speech-model`, and `--openai-speech-voice`.

For direct narration generation, `mediaforge audio generate <episode-id>` reads the episode's root `script.md` first, falls back to `script/rewritten-script.md` when needed, and saves the result under that episode's `audio/` directory:

- `audio/script-source.md`
- `audio/segments/*.wav`
- `audio/narration.wav`

# Whisper and alignment

Support whisper.cpp through a safe subprocess adapter.

Provide configuration for:

- model path;
- language;
- threads;
- processors;
- word timestamps;
- segment timestamps;
- output formats;
- timeout;
- maximum media duration.

Do not download large Whisper models silently.

Create an installation/check command that reports missing binaries and model files and prints exact setup instructions.

Alignment workflow:

1. concatenate scene audio;
2. run Whisper once against final narration;
3. obtain segment and word timestamps;
4. normalize tokens;
5. compare recognized tokens with canonical tokens;
6. use a sequence-alignment algorithm;
7. retain canonical spelling;
8. transfer timestamps to aligned canonical words;
9. flag low-confidence or unmatched ranges;
10. produce SRT, VTT, and ASS captions.

Use scene audio boundaries as the primary image timing boundaries.

Use Whisper word timings for captions and optional text animation.

Do not estimate final image timestamps from character counts when actual scene audio durations are available.

# OpenArt prompt workflow

Create a versioned prompt-template system.

Provide a default template file with placeholders such as:

{{GLOBAL_STYLE}}
{{ASPECT_RATIO}}
{{SCENE_NUMBER}}
{{TIMESTAMP_START}}
{{TIMESTAMP_END}}
{{VISUAL_PURPOSE}}
{{SUBJECT}}
{{ACTION}}
{{SETTING}}
{{COMPOSITION}}
{{CAMERA}}
{{LIGHTING}}
{{MOOD}}
{{CONTINUITY}}
{{BRAND_GUIDANCE}}
{{NEGATIVE_PROMPT}}

The user will replace or extend the global template later.

The generated prompt should:

- describe the visual, not repeat the narration verbatim;
- depict the exact concept being discussed;
- avoid generic stock imagery;
- preserve recurring character and style details;
- respect the target aspect ratio;
- leave safe space for deterministic overlays;
- avoid generated text unless explicitly requested;
- avoid logos and watermarks;
- avoid accidental extra limbs or malformed anatomy where relevant;
- include a concise negative prompt;
- avoid conflicting style directions.

Create deterministic expected filenames:

scene-001**000000-000009**16x9.png
scene-001**000000-000009**9x16.png

Use filesystem-safe timestamp formatting.

Generate OpenArt batch files in configurable batch sizes, defaulting to eight because the Essential plan supports multiple parallel generations.

Each OpenArt workbook entry must include:

- checkbox/status;
- scene ID;
- timestamp;
- narration excerpt;
- visual intent;
- full prompt;
- negative prompt;
- aspect ratio;
- expected filename;
- optional reference-image paths;
- import status;
- validation status;
- rejection reason.

CLI commands must include equivalents of:

mediaforge images export-openart <episode-id>
mediaforge images open-openart <episode-id>
mediaforge images import <episode-id> --from <directory>
mediaforge images validate <episode-id>
mediaforge images missing <episode-id>
mediaforge images reject <episode-id> --scene <scene-id> --reason "<reason>"
mediaforge images regenerate-workbook <episode-id> --missing-only
mediaforge images assign <episode-id> --scene <scene-id> --file <path>

The importer must:

- use manifest mappings where available;
- recognize expected deterministic filenames;
- optionally map files by explicit sidecar manifest;
- never silently guess ambiguous mappings;
- calculate hashes;
- detect exact duplicate images;
- warn about probable perceptual duplicates if a simple image hash implementation is included;
- inspect dimensions;
- normalize to supported formats;
- preserve originals;
- create derived render-ready assets;
- report missing scenes clearly.

Do not require image-generation automation for the rest of the pipeline to be testable. Placeholder images must allow the end-to-end renderer to run.

# Deterministic typography and overlays

Do not rely on image models to generate readable titles, captions, labels, charts, or callouts.

Generate these using SVG, Sharp, HTML/CSS rendering, or FFmpeg.

Implement safe-area layouts for:

- YouTube 16:9;
- TikTok/Shorts 9:16.

Text rendering must:

- wrap correctly;
- use measured bounds;
- avoid overlap;
- avoid clipping;
- respect margins;
- limit line counts;
- reduce font size within configured bounds;
- fail validation if content still cannot fit;
- never place critical text under typical platform UI regions in vertical output.

# Rendering

Create a VideoRenderer interface.

Implement FFmpegVideoRenderer.

Use safe subprocess execution:

- executable allowlist;
- argument arrays;
- no interpolated shell command strings;
- timeout;
- cancellation;
- captured stdout and stderr;
- structured command logging with secret redaction;
- validated paths;
- explicit exit-code checking.

Rendering must:

- use the exact scene timing manifest;
- hold each scene image for the actual scene audio duration;
- support subtle zoom and pan;
- support configurable transitions;
- prevent transitions from changing total audio timing;
- concatenate narration without drift;
- support optional intro and outro;
- support optional background music at a strongly reduced level;
- duck background music under narration;
- support captioned and clean exports;
- generate 16:9 and 9:16 variants;
- use H.264 and AAC by default;
- use yuv420p for compatibility;
- include faststart metadata;
- produce stable frame rates;
- avoid unnecessary re-encoding of intermediate audio where possible.

Add render profiles in configuration rather than hard-coding all FFmpeg flags.

# Output validation

After rendering, use ffprobe to assert:

- file exists;
- file size is greater than zero;
- video stream exists;
- audio stream exists;
- expected width and height;
- expected duration within tolerance;
- expected codecs;
- valid frame rate;
- seekable MP4;
- audio sample rate;
- no severe mismatch between audio and video duration.

Extract representative frames and validate that they are not blank or fully transparent.

Check:

- no missing images;
- no unresolved prompt placeholders;
- no duplicate scene timestamps;
- timestamps are monotonic;
- no unintended gaps;
- no unintended overlaps;
- no scene has end time before start time;
- every scene references valid audio and image artifacts;
- every expected caption range is valid.

# Publishing metadata

Create a MetadataProvider interface.

Generate structured metadata from:

- final rewritten script;
- final scene plan;
- actual chapter timestamps;
- source topic;
- target platform;
- intended audience.

YouTube output must include:

- 10 title candidates;
- recommended title;
- title scoring explanation;
- description;
- chapters;
- tags;
- thumbnail text candidates;
- pinned comment;
- primary keyword;
- secondary keywords;
- content category suggestion;
- disclosure suggestions where relevant.

TikTok output must include:

- caption candidates;
- recommended caption;
- hashtags;
- opening hook;
- cover-text candidates;
- concise CTA options;
- keyword summary.

Metadata rules:

- accurately represent the actual video;
- no false urgency;
- no guaranteed-results claims;
- no invented statistics;
- no keyword stuffing;
- no excessive hashtag spam;
- respect configurable platform-length limits;
- use real timestamps;
- warn about potentially sensitive or unsupported claims.

Create copy-ready text files as well as JSON.

Do not implement automated platform publishing in the first vertical slice.

# CLI

Implement commands equivalent to:

mediaforge doctor
mediaforge init
mediaforge create --url <url>
mediaforge create --file <path>
mediaforge run <episode-id>
mediaforge run <episode-id> --from <stage>
mediaforge run <episode-id> --until <stage>
mediaforge run <episode-id> --scene <scene-id>
mediaforge status <episode-id>
mediaforge inspect <episode-id>
mediaforge retry <episode-id>
mediaforge clean <episode-id> --generated-only
mediaforge transcript export <episode-id>
mediaforge scenes list <episode-id>
mediaforge scenes inspect <episode-id> --scene <scene-id>
mediaforge audio generate <episode-id>
mediaforge align <episode-id>
mediaforge images export-openart <episode-id>
mediaforge images open-openart <episode-id>
mediaforge images import <episode-id> --from <path>
mediaforge images validate <episode-id>
mediaforge render <episode-id> --profile youtube
mediaforge render <episode-id> --profile vertical
mediaforge metadata generate <episode-id>
mediaforge package <episode-id>

Commands must provide:

- useful help;
- non-zero exit codes on failure;
- machine-readable JSON output mode;
- human-readable default output;
- quiet mode;
- verbose mode;
- dry-run where useful.

# Configuration

Create:

- `.env.example`;
- runtime-validated configuration;
- per-project config;
- per-episode overrides;
- provider-specific configuration;
- render profiles;
- voice profiles;
- prompt-template configuration.

Secrets must never be written to manifests or logs.

Add redaction for:

- API keys;
- authorization headers;
- cookies;
- access tokens;
- signed URLs.

Configuration precedence:

1. command-line overrides;
2. episode config;
3. project config;
4. environment variables;
5. safe defaults.

Document all precedence clearly.

# Persistence

Use SQLite for:

- episodes;
- pipeline runs;
- step runs;
- artifacts;
- scenes;
- provider usage;
- errors;
- cache keys.

The filesystem remains the source of media artifacts.

The database stores indexes and state.

Use migrations.

Repository interfaces must isolate the application layer from Drizzle.

All timestamps must be stored in UTC ISO-8601 format.

# Observability

Use Pino structured logs.

Every operation must include relevant fields:

- episodeId;
- pipelineRunId;
- stepName;
- sceneId;
- provider;
- artifactId;
- durationMs;
- retryCount;
- cacheHit;
- command name.

Do not log full transcript/script bodies at info level.

Create a human-readable per-episode log file and machine-readable JSON logs.

Add simple metrics to the final run summary:

- total duration;
- stage durations;
- generated audio seconds;
- image count;
- cache hits;
- provider calls;
- failed/retried calls;
- final video duration;
- estimated or recorded provider usage.

# Error handling

Create typed error classes or discriminated unions for:

- ValidationError;
- ConfigurationError;
- UnsupportedSourceError;
- SourceAcquisitionError;
- ProviderAuthenticationError;
- ProviderRateLimitError;
- ProviderResponseError;
- ProcessExecutionError;
- MediaValidationError;
- ArtifactNotFoundError;
- PipelineInvariantError;
- HumanActionRequiredError.

Include:

- safe user-facing message;
- internal cause;
- retryability;
- step;
- episode;
- scene where applicable;
- remediation instructions.

Do not swallow errors.

Do not catch an error only to log and continue with invalid state.

# Testing

Create:

1. Unit tests:

   - schemas;
   - timestamp parsing;
   - duration calculations;
   - token reconciliation;
   - scene ordering;
   - cache keys;
   - filename generation;
   - URL validation;
   - safe-area calculations;
   - prompt rendering;
   - metadata validation.

2. Integration tests:

   - SQLite repositories;
   - FFmpeg command construction;
   - ffprobe parsing;
   - subprocess timeout/cancellation;
   - placeholder-image generation;
   - caption generation;
   - OpenArt manifest export/import;
   - duplicate detection.

3. End-to-end fixture:

   - small local audio or generated test tone;
   - fixture transcript;
   - mock rewrite;
   - two or three scenes;
   - mock TTS or generated WAV files;
   - placeholder images;
   - final short MP4;
   - validated subtitles;
   - metadata package.

Do not require paid APIs in CI.

Provider integration tests must be opt-in and skipped unless credentials are present.

Use deterministic fixtures.

# Security

Implement:

- strict URL validation;
- path traversal prevention;
- output directories constrained to the configured workspace;
- safe filenames;
- maximum source size;
- maximum duration;
- subprocess timeouts;
- no shell interpolation;
- secret redaction;
- no browser credential extraction;
- no OpenArt private API reverse engineering;
- no automatic execution of arbitrary downloaded files;
- MIME and magic-byte validation;
- atomic writes;
- restrictive default file permissions for secret-bearing config;
- dependency audit script.

# Performance

Optimize for repeatability and avoiding unnecessary provider usage.

Implement:

- content-addressed artifact cache;
- per-step hashes;
- per-scene regeneration;
- bounded concurrency;
- streaming where practical;
- no full-file buffering for large media unless required;
- FFmpeg progress parsing;
- resumable runs;
- prompt batching;
- image import batching;
- configurable Whisper threads;
- provider rate limiting;
- deduplication of identical prompts.

Do not parallelize unlimited image or TTS requests.

Default OpenArt workbook batch size should be configurable and initially set to eight.

# Documentation

Create:

- README.md;
- docs/architecture.md;
- docs/pipeline.md;
- docs/openart-workflow.md;
- docs/provider-interfaces.md;
- docs/security.md;
- docs/troubleshooting.md;
- docs/development.md;
- docs/publishing-output.md;
- docs/decisions/ with ADRs.

Include ADRs for:

- scene-level audio generation;
- scene plan as timing source of truth;
- Whisper used for timing with canonical text reconciliation;
- SQLite for local persistence;
- FFmpeg as initial renderer;
- OpenArt assisted workflow because no public API is documented;
- provider abstraction;
- no direct publishing in the first iteration.

In `docs/openart-workflow.md`, document the exact user workflow:

1. Run the OpenArt export command.
2. Open the generated workbook.
3. Open OpenArt in the browser.
4. Generate prompts in batches.
5. Use the requested aspect ratio.
6. Download each result.
7. Save or move files into the episode image inbox.
8. Run the import command.
9. Review mapping warnings.
10. Validate missing or duplicate scenes.
11. Regenerate only rejected or missing scenes.
12. Render the final video.

Clearly state that OpenArt currently lacks a documented public API and therefore this workflow intentionally includes a controlled human action.

# Developer experience

Create root scripts such as:

pnpm build
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm format
pnpm doctor
pnpm mediaforge
pnpm db:migrate

Create a doctor command that checks:

- Node version;
- pnpm;
- ffmpeg;
- ffprobe;
- yt-dlp;
- whisper.cpp binary;
- Whisper model;
- writable workspace;
- SQLite support;
- required fonts;
- optional API credentials;
- browser opener;
- available disk space.

The doctor command must distinguish:

- required missing dependency;
- optional missing dependency;
- credential missing;
- manual OpenArt action required.

# Implementation order

Work in this order:

Phase 1: repository foundation

- inspect existing files;
- create workspace configuration;
- create strict TypeScript configuration;
- create lint/test/build tooling;
- create domain schemas;
- create persistence;
- create process runner;
- create logging;
- create configuration validation.

Phase 2: local end-to-end vertical slice

- local file source;
- fixture transcript;
- mock cleaner/rewriter;
- scene planner;
- mock TTS;
- placeholder images;
- captions;
- FFmpeg renderer;
- metadata;
- final validated MP4.

Phase 3: real media tooling

- FFmpeg audio extraction;
- ffprobe inspection;
- whisper.cpp integration;
- yt-dlp adapters;
- URL safety.

Phase 4: language and voice providers

- OpenAI-compatible cleaning/rewriting;
- OpenAI-compatible TTS;
- structured-output validation;
- retries and usage tracking.

Phase 5: OpenArt-assisted workflow

- prompt template;
- timestamped batches;
- workbook;
- import;
- validation;
- missing/rejected regeneration workflow.

Phase 6: API/web scaffold

- expose episode creation;
- status;
- scene review;
- image import status;
- render start;
- artifact download;
- do not duplicate application logic.

Phase 7: hardening

- security tests;
- cancellation;
- retry policies;
- caching;
- documentation;
- full validation.

# Completion criteria

The task is complete only when:

- dependencies are configured;
- the repository builds;
- strict type checking passes;
- linting passes;
- tests pass;
- database migrations run;
- CLI help works;
- doctor command works;
- a local fixture runs through the pipeline;
- a short MP4 is rendered;
- ffprobe validates the MP4;
- captions are generated;
- placeholder images align with scene timestamps;
- OpenArt prompt batches and workbook are generated;
- imported images can be mapped deterministically;
- publishing metadata files are generated;
- documentation explains setup and usage;
- missing external credentials are reported clearly rather than treated as code failures.

# Working rules

- Inspect before modifying.
- Reuse sound existing conventions where present.
- Keep modules cohesive.
- Keep provider code out of domain code.
- Prefer small typed functions.
- Add JSDoc to exported APIs and non-obvious algorithms.
- Explain invariants near the implementation.
- Do not add fake implementations that silently claim success.
- Mocks must be clearly named and confined to development/testing.
- Never store credentials in source control.
- Never use `any`.
- Never disable TypeScript strictness to make code compile.
- Never use shell command interpolation with user-controlled input.
- Never infer scene ordering from filenames alone when a manifest exists.
- Never overwrite source artifacts.
- Never regenerate paid assets unnecessarily.
- Never make OpenArt automation claims unsupported by a documented API.
- Do not pause after merely generating a plan.
- Continue implementing through the phases as far as the local environment permits.

At the end:

1. Run all available validation commands.
2. Fix failures caused by the implementation.
3. Provide a concise summary of:

   - architecture created;
   - files added or changed;
   - commands run;
   - test results;
   - generated fixture artifacts;
   - external dependencies still requiring user action;
   - exact next command the user should run.
