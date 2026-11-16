### Changed — may break callers

- **`review agenda`'s `crm` section lists what the CRM copy says changed**, read by cli-core's `store.crm.changes`
  (cli-core 0.678.0): deals and leads made, moved between stages, won, lost or given another owner, and activities
  added or done on them, newest first. An edit that is none of these is no longer listed, and the 500 newest deals and
  leads are no longer the limit. A line no longer names the company.
