### Added

- **`memo actions edit <id> <finding> --fingerprint <hash> --set field=value`** changes a finding still waiting in a findings batch before you confirm it: its text and the fields its kind allows; `field=null` empties an optional one. Only the owner runs it; it answers the batch with its new fingerprint.
- **`memo groups rename <group> <name>` and `memo groups delete <group>`.** Rename keeps the members; delete removes the group and its memberships only. Both refuse a built-in, missing or taken name and answer with the groups. A later run in the old name is refused with the groups there are.
- **`memo people resolve <id> company --mailbox <address>`** marks an address as the company's on a match by name, not only on a shared mailbox. The answer names the `mailbox`.
- **`memo tasks list 'related:"deal:7"'`** (also `lead:` and `organization:`) lists the tasks of a deal, a lead or a client company: those `deals context` and `organizations context` count.
- **The digest reads Google Drive, Google Calendar and the CRM.** `review agenda` gains the parts `calendar` (events added, moved or cancelled, and those starting within a day), `drive` (documents edited) and `crm` (deals and leads the CRM changed, with the stage they moved to). A digest's sources take `drive`, `calendar` and `crm`.

### Changed — may break callers

- **`memo actions confirm <id> <findings...>` leaves the findings not named waiting.** Before, it rejected them. With no names it creates every finding still waiting; `reject` rejects only what waits.
- **`memo_tools_search` ranks by the words it matches** (cli-core). A task phrase in an agent's words finds its command; the help's examples count. See [the measurement](https://github.com/WireCatLabs/cli-testing/tree/main/performance/agents/tools-search).

### Fixed

- **Contacts** (cli-core): one name in private chats on two messengers is proposed as one person; a person in a two-way private chat is no longer `automated`; a person on one of your own accounts no longer takes that profile's label as their name; a person's phone, address and username come from the identity that wrote the most; `hr@` scores below `info@`, and the same company in the CRM counts as a trace.
