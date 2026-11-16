### Changed — may break callers

- **`review agenda`'s `crm` section lists what the CRM copy says changed**, read by cli-core's `store.crm.changes`:
  deals and leads made, moved between stages, won, lost or given another owner, and activities added or done on them,
  newest first. An edit that is none of these is no longer listed, and the 500 newest deals and leads are no longer the
  limit. A line no longer names the company.

### Security

- **memo shows a CRM copy only as far as the user its sync signed in as may read it**: `deals` and `leads` `list`,
  `show` and `context`, `projects status`, `pipelines list` and `show`, `show`, `search all` and the agenda leave out
  the deals and leads of a copy assigned to another CRM user, as the CRM's own CLI does for that profile, and `deals`
  and `leads` `update`, `move` and `close` refuse them as not found. `show` marks such a reference unavailable and
  names nothing of it. A copy synced by the CRM's administrator, or by a CRM that limits nobody, shows whole as before.
  When a copy's sync named no user, or no sync of cli-core 0.678.0 or later recorded who may read it, the answer says
  why and carries `complete: false`.
