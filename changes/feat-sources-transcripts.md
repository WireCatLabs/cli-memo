### Added

- **`memo sources add` keeps meeting transcripts.** A `.vtt` (WebVTT) or `.srt` (SubRip) file exported from a video
  call is kept as searchable text, one `Name: text` line per turn without the timings; before, it was refused as
  `source.unsupported`. WireCat Desktop's "Add to memory" takes them too
  ([Sources you add by hand](../docs/sources.md#add-a-source)).
