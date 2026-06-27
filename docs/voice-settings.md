# voice settings

## slow voice

Use a calm adult male narrator voice.

Speak in natural, conversational English with a curious and thoughtful tone.
Keep the delivery concise, clear, and documentary-like.
Use a measured pace of approximately 145 words per minute.
Pause briefly between paragraphs and after important conclusions.
Emphasize contrasts such as abundance versus instability.
Pronounce “Calhoun” clearly and consistently.
Pronounce “Universe 25” as “Universe Twenty-Five.”
Avoid theatrical acting, exaggerated emotion, advertising energy, and
unnaturally long pauses.
Maintain consistent volume, pacing, and vocal character across all chunks.

## fast voice

Speak in natural, conversational English with a curious, confident, and thoughtful tone.

Use a brisk documentary-style delivery at approximately 180 words per minute. Keep the speech energetic and efficient without sounding rushed, breathless, theatrical, or artificial.

Maintain clear pronunciation while moving smoothly through sentences. Use short, natural pauses only after major conclusions or important transitions. Do not pause noticeably between ordinary paragraphs, list items, or closely related ideas.

Emphasize important contrasts, especially abundance versus instability, without slowing down excessively.

Pronounce “Calhoun” clearly and consistently. Pronounce “Universe 25” as “Universe Twenty-Five.”

Avoid exaggerated emotion, dramatic acting, advertising energy, slow narration, drawn-out words, and unnaturally long pauses.

Maintain consistent volume, vocal character, tempo, and speaking rhythm across every generated chunk. Begin speaking immediately and avoid slow introductions or trailing endings.

## very fast voice

Speak in natural, conversational English with a curious, confident, and focused documentary tone.

Use a very brisk but still natural delivery at approximately 190 to 205 words per minute. Aim for a target pace of 190 words per minute.

Keep the narration energetic, compact, and efficient without sounding rushed, breathless, robotic, theatrical, or like an advertisement.

Move smoothly through sentences with clear pronunciation. Use only very short pauses after major conclusions, scene changes, or important reveals. Avoid noticeable pauses between ordinary paragraphs, list items, or closely related ideas.

Do not slow down for emphasis unless the contrast is essential to understanding the sentence. Emphasize important contrasts through tone and clarity rather than long pauses.

Pronounce “Calhoun” clearly and consistently. Pronounce “Universe 25” as “Universe Twenty-Five.”

Avoid exaggerated emotion, dramatic acting, slow narration, drawn-out words, filler sounds, and unnaturally long pauses.

Maintain consistent volume, vocal character, tempo, and rhythm across every generated chunk. Begin speaking immediately and end cleanly without trailing off.

## per-episode selection

Set the voice preset in `episode.config.json` to choose the narration style for a specific episode:

```json
{
  "speechVoicePreset": "very-fast"
}
```

Use `"fast"` for a brisker delivery or `"very-fast"` for a tighter 190 wpm style. If no episode override is set, new episodes use `"fast"` by default. The preset changes the narration instructions and pacing estimate while keeping provider-side TTS configuration separate unless you override it elsewhere.

If you also set `scriptLanguage` in `episode.config.json` or `MEDIAFORGE_SCRIPT_LANGUAGE`, the narration instructions are adjusted to speak naturally in that language while still using the selected slow, fast, or very-fast pacing profile.
