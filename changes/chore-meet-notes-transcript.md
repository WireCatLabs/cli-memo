### Fixed

- **`memo meetings list` counts Google Meet's transcript or Gemini notes as a transcript** (cli-core 0.668.0).
  `has_transcript` and the `has_transcript:true` filter now also count a Drive document that Meet named as the
  meeting's transcript or notes, and an imported Drive document on the calendar event whose title holds a transcript
  word ("Transcript", "Notes by Gemini", and their Russian and Spanish forms). Before, a Meet meeting with only Gemini
  notes was left out of the filter. An agenda or other document on the event does not count.
