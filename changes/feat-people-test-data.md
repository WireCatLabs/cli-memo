### Added

- **`memo people links resolve <who> test` hides a person as test data.** They leave every list, search and count, on
  every computer that reads the store; `memo people list kind:test` lists them, and `resolve <who> keep` brings one
  back as a real contact. Sure test data, a seed id or an address at a reserved domain such as `example.com` or
  `.test`, is hidden without asking.
- **`memo people show` lists every phone and address of an account** as `phones` and `emails`, as a CRM contact holds
  several.

### Fixed

- **Check the links no longer doubts a short form of a name or a name that repeats its mailbox.** Ярик and Ярослав,
  Bob and Robert, or a Drive account named after its own address no longer make a "shared address" doubt.
- **`memo search people` leaves out people hidden as test data.**
