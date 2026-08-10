# VER-EP-07 — TTS, captions, and audio

## VER-060 — Generate TTS audio

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-03,VJ-06

As a creator, I want TTS generated from the approved spoken script so that narration can be rendered automatically.

### Acceptance criteria
- TTS uses configured provider and voice.
- Audio records provider/model/voice/effective settings.
- Identical compatible input reuses cached audio.

## VER-061 — Configure voice per genre/language

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-06,VJ-14

As an administrator, I want genre and language voice defaults with overrides so that production remains consistent.

### Acceptance criteria
- Effective voice resolution is deterministic.
- Missing required voice/provider fails preflight.
- Run captures effective voice ID/config.

## VER-062 — Generate synchronized captions

**Priority:** P1  
**Actor:** Viewer  
**Journeys:** VJ-06,VJ-10

As a viewer, I want captions synchronized to narration so that the video is accessible and usable without audio.

### Acceptance criteria
- Caption timing derives from final audio/timing source.
- Captions are localized per edition.
- Caption artifact is independently downloadable/renderable.

## VER-063 — Replace TTS without rebuilding visuals

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-08

As a creator, I want to change voice/audio without regenerating unaffected images so that voice iteration is cheap.

### Acceptance criteria
- Voice-only changes invalidate audio and timing-dependent render outputs.
- Language-independent visuals remain valid.
- Review pack highlights audio/render delta.
