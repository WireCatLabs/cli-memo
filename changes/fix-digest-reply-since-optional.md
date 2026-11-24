### Fixed

- **The morning digest is kept when the agent cannot date one reply.** From 2026-11-21 one `reply` without `since` made
  the whole digest fail its check, and WireCat Desktop showed its raw text. A reply's `since` is now optional, as the
  morning-digest skill says.
