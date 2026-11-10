### Added

- **`relationships list --json` says what a document at either end is**: `from_document` / `to_document` with its
  title, its folder path (`Clients/Acme/Contract`), the link that opens it (Drive's web link), when it last changed and
  its type, so a review of a document's relationship needs no second lookup. `path` and `url` are `null` when the
  source keeps no catalog entry for the document. Each row also says in `role_list` which role list its role comes
  from (`null` where the role is free text).
- **`relationships roles list` shows the `contract` and `related` lists**, and each built-in role's `labels` in
  English, Russian and Spanish. `related` is offered for what a person or an organization is to another: `colleague`,
  `adviser`, `investor`, `mentor`, `family`, `friend`; `relationships roles add related <role>` adds your own. Any
  other word is still kept, marked `custom` (cli-core 0.634.0).

