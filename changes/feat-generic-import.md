### Added

- **`memo import` brings a folder of documents, transcripts and recordings, or a records file, into memo's search.**
  Text, Markdown, PDF and Word files, `.vtt` and `.srt` transcripts and, with `--transcribe`, recordings heard by the
  local speech model each become a document of the account you name with `--account <provider>:<account>`, keyed by
  its path in the folder: the same folder twice changes nothing, an edited file updates its own document, a recording
  is heard once, and a file gone from the folder is kept. A `.json` or `.jsonl` file goes to the records import. Links
  are not followed, nothing leaves the computer, and `--dry-run` writes nothing
  ([Import files and records](../docs/import.md)).
