### Fixed

- **Deleting a person or an organization also deletes your notes about them.** Before, those notes stayed and lost
  the name. A note that only links to them still stays. `memo people delete` also deletes the people merged into
  that person earlier, so their name and aliases do not come back as a new person; `--json` lists them in `merged`.
  See [Delete a person](../docs/people.md#delete-a-person).
- **Removing an account also removes the relationships it reported** and every fact, note or tag that points at its
  deals and leads. A person you merged with one it imported now stays.

### Security

- **An agent over MCP no longer gets `schedule exec`, `templates preview --file`, `templates edit`,
  `templates reset` or `models consents set`.** An agent runs a saved schedule with `memo schedule run <name>`.
  `schedule exec` runs only a schedule file in memo's own schedules folder; installed schedules keep running.
