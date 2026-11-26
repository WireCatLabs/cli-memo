### Added

- **`memo doctor reports show` and `memo doctor reports create`.** They come with cli-core's shared doctor. `create`
  writes one file about a failed run for the author, with every id replaced by a label, and says where to send it.

### Changed — may break callers

- **`memo doctor` is cli-core's shared doctor.** Its JSON keeps every field it had and adds the shared ones: `version`,
  `runtime`, `paths`, `read_only`, `profile_lock` and `profiles` (always `null`, since memo has no profiles). Off a
  terminal, without `--json`, it now answers JSON, as every WireCat doctor does. The `chmod` that makes a file private
  is printed on stderr, also in the text answer, and no longer at the end of the file's line.
