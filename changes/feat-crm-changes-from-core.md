### Changed — may break callers

- **`review agenda`'s `crm` section lists what the CRM copy says changed**, read by cli-core's `store.crm.changes`
  (cli-core 0.678.0): deals and leads made, moved between stages, won, lost or given another owner, and activities
  added or done on them, newest first. An edit that is none of these is no longer listed, and the 500 newest deals and
  leads are no longer the limit. A line no longer names the company.

### Security

- **memo shows a CRM copy only as far as the user its sync signed in as may read it**: `deals` and `leads` `list`,
  `show` and `context`, `pipelines list` and `show`, `records`, `search all` and the agenda leave out the deals and
  leads of a copy assigned to another CRM user, as the CRM's own CLI does for that profile. A copy synced by the CRM's
  administrator, or by a CRM that limits nobody, shows whole as before. A copy last synced before cli-core 0.678.0
  shows at most its sync user's own deals until its next `sync`. A list page can come back shorter than its limit.
