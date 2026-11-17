### Fixed

- `memo context person:<id> --source …`, and `context`, `organizations context` and `projects context` in a group
  run, leave out the notes of a notes folder or documents account they do not read. Sources you added by hand are an
  account of their own and follow the same rule. The notes you wrote in memo belong to no account and always stay,
  while `search notes --source` reads them only when the list names `notes:internal`.
