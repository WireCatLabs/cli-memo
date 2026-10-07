# Changelog

Notable changes to `@leemour/cli-memo`, one section per version, newest first. Versions follow
[semantic versioning](https://semver.org/); before `1.0.0` a minor release may change the API.

## Unreleased

## 0.1.2 — 07.10.2026

- cli-messaging 0.166.0, matching the final tg and max release pins, including protected conversation
  preparation during search and history fetch.

## 0.1.1 — 07.10.2026

- cli-messaging 0.164.0, matching tg and max source: person context now finds private dialogs with no
  recorded members, restoring the last message each way and direct messages in existing Telegram stores.

- The release workflow can dry-run a version already on npm, so packaging can be checked between
  releases. Publishing still refuses an existing version.

## 0.1.0 — 06.10.2026

- The `memo` command, with `--version` and `--help`.
- `memo notes about <name>` (was `memo notes <name>`): notes about a person, notes that link them, and weak plain-name mentions, from
  Markdown folders given with `--folder` or `notes.folders` in the config.
- `memo mail import`: a Gmail account's All Mail into the shared message store through Himalaya, read only;
  Gmail thread and message ids, resumable with `--max`, and deletions at the source drop the stored text.
- `memo note`: the note about a person, kept per person of the shared store. Linking identities is
  `tg|max contacts link`, not a memo command.
- `memo notes import`: Markdown and text notes into the shared store as provider `notes`; edits kept as
  revisions, deleted notes lose their text. `memo notes search <text>`: notes by their words, with the
  people they link and the known people whose full name they mention (a guess).
- `notes.ignore` in the config and `--ignore`: files, folders or globs never read or stored.
- `memo import`: notes and mail in one run, incremental — notes keep a manifest of size, change time and
  content hash in the store, so unchanged files are not read and identical ones not saved. A lock stops two
  runs at once; a failing source does not stop the others.
- `memo auto on [--every 5m] | off | status`: a systemd user timer for `memo import`. The config's
  `auto: { enabled, every }` is the source; the timer follows a hand edit at its next run.
- `memo context <messenger>:<person>`: one answer about a person — cli-messaging's person context across
  every linked identity (mail included), the note about them and the notes naming them, with what was not
  read and why. Needs cli-messaging 0.150.0, which tg and max pin.
- Notes are embedded for search by meaning: `memo import` and `memo notes import` build each changed folder
  and embed new chunks with the local e5-small model, at most 600 a run, resuming next run; `--no-embed` and
  `notes.embed: false` skip it. `memo notes search` ranks by meaning and words together (`by` on each hit) and
  falls back to words when the model is missing.
- cli-messaging 0.153.0, as tg and max pin: a long note or mail is embedded in overlapping pieces, whole.
