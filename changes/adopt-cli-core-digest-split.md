### Fixed

- **The morning digest reaches Telegram whole.** memo is on cli-core 0.712.0: a digest longer than one Telegram
  message goes as several messages in order, split between sections or items, never inside one, with
  "(продолжение)" on the later parts. Sections show up to 25 items instead of 5 to 7. Mail and the `report.json`
  that WireCat Desktop reads are unchanged.
