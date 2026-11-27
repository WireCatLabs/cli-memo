### Fixed

- **`memo import`, notes folders and `sources add` read a file up to 10 GB, not 50 MiB.** The limit is cli-core's
  shared file budget: `MESSAGING_ATTACHMENT_MAX_MIB` sets another one, in MiB ([import](../docs/import.md#limits)).
  A notes file skipped for its size is read on the next import. A file is read whole into memory, so a large one
  needs that much free memory. A recording is heard up to 2 GiB, not 256 MiB, and still up to an hour.
