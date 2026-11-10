### Fixed

- **The owner's partner, a spouse's account and a company's phone no longer end up on the owner's person.** cli-core
  no longer merges anyone into you by a rule: an account you connect under another person's name waits in
  `people review` with the signal `account`, and a shared phone or address with you is not offered at all. A shared
  address such as `info@`, a company's phone and a bot's number join and propose no one. Undoing such a merge with `people unmerge` gives you your own name back.
- **Telegram and WhatsApp contacts are `person` again.** Whoever wrote to you one to one, or in a group of at most 10,
  has a tie. A CRM contact counts only through a deal or lead of yours; the rest of a CRM is `stranger`.
- **Names are found in either script.** `people list name:Светлана` finds Svetlana, and `people check` puts a
  transliterated name first as the same name.
- **`sources suggest --provider=ai-model` names what is missing.** With no AI model chosen it answers the reason
  `reader.ai-not-set`, and with no key `reader.no-key` (an `authentication_error`), where both answered
  `config.invalid`.

### Added

- **`people list` rows carry `username_source`**, the messenger the username belongs to, and each identity of
  `people show` its `phone` and `email`.
