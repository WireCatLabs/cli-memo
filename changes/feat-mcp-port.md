### Added

- **WireCat Desktop reads the MCP port from memo itself.** The manifest (`memo --wcat-describe`) now names the fixed
  MCP port 8767. Desktop reads it from the tool and keeps its own list only as a fallback. Built on cli-base 1.2.0.
