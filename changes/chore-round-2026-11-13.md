### Changed — may break callers

- **`memo projects meetings link --fingerprint` with a stale fingerprint answers `conflict`, not
  `configuration_error`** (reason `meeting-project.stale`). From cli-core 0.651.0. A script that checks the code
  checks `conflict`, lists the proposals again and links with the new fingerprint.

### Fixed

- **`memo review show --compact` prints the proposal as one line**, as `review` lists it: id, kind, title, score,
  who proposed it and the day. It printed the same `key: value` lines as without `--compact`.
- **`memo review confirm` and `reject --compact` print one line per decision and one per refusal**, under
  `# decided: N` and `# refused: N`. They printed only the counts.
- **`memo projects meetings link --fingerprint` keeps your `--reason` when you confirm an agent's proposed link.** The
  agent's reason stayed. From cli-core 0.651.0.
- **`memo notes add --export` writes the note's first `--subject` as a link in the file too**, as it does every later
  one. The file named only the others. `notes edit --export` and `notes export` still leave it out: the store does not
  return a note's first subject yet.
