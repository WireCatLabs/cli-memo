### Fixed

- **`memo commands --serve` parses each request with its own words.** Requests that ran at once shared one program,
  so two calls of the same command both answered with the last one's options and query: WireCat Desktop asked for
  open, won and lost deals together and got the same 20 lost deals three times, and its Clients board stayed empty.
  Each request now builds and parses its own program.
