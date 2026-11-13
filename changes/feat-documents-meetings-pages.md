### Added

- **`memo documents list`, `show` and `tree`: every document of every account.** Drive files, notes folders,
  sources added by hand and imports in one paged list with a total, newest change first, each with its source,
  folder, kind, size, link and whether its text is stored; narrowed by source, kind, folder, edit time, tag, person
  and words of its text. `tree` gives each account's folder tree with counts.
  See [usage](../docs/usage.md#every-document).
- **`memo meetings list` and `show`: meetings, calls and calendar events as one row per real meeting.** A calendar
  event and its Zoom meeting are one row; each row names its sources, participants with their person refs, join
  links, recording, transcript and summary flags, linked documents and findings waiting for you. A window is read by
  overlap (`started_at:`, by days or by instants with their offset), latest first or oldest first (`--order start`).
  `show` adds the transcript lines with their times. See [usage](../docs/usage.md#meetings-and-calls-in-one-list).
