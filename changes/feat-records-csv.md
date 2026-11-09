### Added

- **`records import` and `records check` take a CSV sheet of one type** (`--type invoice`): `;` or `,`, a byte-order
  mark, `10 000,50` and `09.11.2026` as Excel writes them in Russian or Spanish. Each refusal names the sheet's line
  and column. **`records templates show <type>`** writes the header row to fill (`--locale ru` puts `;` between cells)
  or an example envelope (`--format json`); **`records templates list`** lists the types and their columns. WireCat Desktop's Storage import uses both.

### Changed — may break callers

- **memo is built on cli-core 0.625.0** (was 0.624.0): records templates and CSV sheets, and a `stranger` kind in
  `people list` for a named person with no tie.
