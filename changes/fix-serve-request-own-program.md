### Fixed

- **`memo commands --serve` answers two requests of one command at once each with its own options.** Every request
  shared one program, and commander keeps parsed options on the command, so `people list kind:person --limit 1` and
  `people list kind:organization --limit 2` sent together both answered organizations, two per page. WireCat Desktop's
  People tabs showed pairs of equal counts. Each request now builds its own program.
