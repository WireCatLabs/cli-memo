### Changed — may break callers

- **`memo people list` lists the people you have a tie with**, not everyone memo ever saw. A tie is a one-to-one
  chat, a group of at most 10, mail you wrote to them, a meeting, a CRM or your address book; people added by hand and
  anyone assigned a task are listed too. `--all` adds the rest, such as authors seen only in big groups (here `--all`
  means people with no tie, not every account). When some are hidden, the answer's `next` step `people.all` says how
  many. Each person now has `display_name` (no wrapping quotes or spaces; a name with no letter or digit shows the
  username, phone or email; `name` stays as stored), `username`, `phone`, `email` and `ties`. The list pages
  (`--page`), sorts by `--sort tasks|name` and searches by `name:<text>` (3 characters at least). Run
  `<messenger> <profile> contacts sync` once per messenger account: until then nobody has the address-book tie.
- **`memo search people`** lists people with a tie first; each hit has `ties`, empty for someone with none.

### Added

- **`memo people similar <name...>`**: people whose names start like the typed words, in any order, the same name
  first (`same_name`), so a form can show likely duplicates before adding a person.
