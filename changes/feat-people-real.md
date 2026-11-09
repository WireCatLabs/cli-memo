### Changed — may break callers

- **`memo people list` lists one kind of person at a time**, people by default, the ones who write to you most first.
  `kind:` is `person`, `organization`, `automated`, `unsorted` or `all`. A person is you, someone you added by hand or
  assigned a task, or a named person with a tie to you: a one-to-one chat, a group of at most 10, mail you wrote, a
  meeting, a CRM or your address book. Bots, newsletters and notifications are `automated`; companies (an
  organization's account, `info@`, ООО, LLC, Airlines…) are `organization`; the rest, such as authors seen only in big
  groups and accounts with no name, is `unsorted`. The answer's `next` step `people.kinds` says how many each other
  kind holds. Each person now has `display_name` (no wrapping quotes; «Без имени» or a name with no letter shows the
  username, phone or email; `name` stays as stored), `kind`, `kind_signals`, `contact`, `phone`, `email`, `username`,
  `messages_from`, `last_contact` and `ties`. The list pages (`--page`) with an exact total, sorts by
  `--sort interactions|recent|name|tasks` and searches by `name:<text>` (3 characters at least). Run
  `<messenger> <profile> contacts sync` once per messenger account: until then nobody has the address-book tie.
- **`memo search people`** lists people with a tie first; each hit has `ties`, empty for someone with none.

### Added

- **`memo people check <name...>`**: people whose names start like the typed words, in any order, the same name
  first (`same_name`), so a form can show likely duplicates before adding a person.
