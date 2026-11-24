### Fixed

- **One bad part of the morning digest no longer costs the whole digest.** A section, item or health entry the agent
  wrote wrong is left out, and the digest ends with a line saying how many were left out. A meeting's time without an
  offset is read as local time. Both come with `@wirecat/cli-core` 0.749.0.
