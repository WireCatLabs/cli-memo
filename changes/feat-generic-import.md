### Added

- **`memo import` brings a folder of text, Markdown, PDF and Word files and `.vtt` or `.srt` transcripts, or a records file, into memo's search.** Each file
  becomes a document of the account you name with `--account <provider>:<account>`, keyed by its path in the folder:
  the same folder twice changes nothing, an edited file updates its own document, and a file gone from the folder is
  kept. A `.json` or `.jsonl` file goes to the records import. Links are not followed, nothing leaves the computer,
  and `--dry-run` writes nothing ([Import files and records](../docs/import.md)).
