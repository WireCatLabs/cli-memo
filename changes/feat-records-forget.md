### Added

- **`memo records forget` deletes a test import whole.** `memo records forget --account n8n:test --yes` removes
  everything one source sent: its records, and the leads, deals and pipelines made from them. People and
  organizations stay. Without `--yes` it changes nothing and says how many records would go. It refuses an account
  that a WireCat tool syncs, such as `tg` or a CRM. Over MCP only the owner may run it. See
  [Bring data in from another system](../docs/business.md#bring-data-in-from-another-system).
