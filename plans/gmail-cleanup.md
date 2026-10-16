# Plan: Gmail cleanup (stage 3)

Status: proposed, waiting for the owner's approval. Nothing here is built yet.

## Why

The mail plan runs in three stages: probe and rules, then an import that follows the rules, then cleanup on the mail
server last, only once the local archive is verified. Stages 1 and 2 are done. On the first real mailbox, about 182,000
emails are stored as envelopes (sender, subject, date, size, labels, Gmail id, without text), decided by about 470
rules. They still fill the Gmail account. This stage moves them to Gmail's Trash, safely and reversibly.

## 1. What may be trashed

An email is a candidate only when **all** of these hold:

- it is stored as an envelope, and the envelope records the rule that decided it (`emails.mail_rule_id`);
- **the rule decision is made again at clean time** over the stored facts, with today's rules. The email is skipped
  when no rule matches any more, the matching rule is no longer `envelope` or `skip`, or a `keep` now wins;
- no **protected** rule matches it, and no protected kind or preset does either. Protection always wins and is
  checked at clean time, not taken from the stored marker;
- the owner never **replied** to its sender, and it is not **starred** or marked **important** by the owner (the
  `\Flagged` flag and Gmail's `\Important` label in the stored labels);
- it is not in `[Gmail]/Sent`, `[Gmail]/Drafts` or a label the owner created by hand;
  - Gmail system labels and category labels (`CATEGORY_*`) do not block it;
  - labels from imported Gmail filters block it, unless the rule that put the label there is the same one now cleaning;
- it is older than a minimum age (default 30 days), so mail that arrived since the last sync is never touched;
- the [archive check](#4-archive-check-before-the-first-real-run) passes.

Mail that fails a guard is reported as `kept` with the reason, and counted per reason.

## 2. How

- **One email at a time is the unit.** Gmail's IMAP works per message, and so does this cleanup: a thread with
  mixed mail (a newsletter that a friend replied to) loses only the envelope messages. The others stay where they
  are. The IMAP extensions page describes `X-GM-THRID` only as a grouping key. It says nothing about moving whole
  threads, and this design never uses it to select mail.
- **Finding the message:** each stored envelope carries its Gmail id (`X-GM-MSGID`). `UID SEARCH X-GM-MSGID <id>` in
  `[Gmail]/All Mail` gives today's UID, the same lookup `--retry-attachments` uses since BUG-250. An id Gmail no
  longer has is reported as `gone`, and the email is marked deleted locally, as a sync would mark it.
- **Moving:** `UID MOVE <uids> "[Gmail]/Trash"` through `himalaya imap raw`, in batches of up to 500 UIDs, with a
  pause between batches. If the server lacks the MOVE capability, the fallback is `UID COPY` to Trash then
  `UID STORE +FLAGS (\Deleted)` with `UID EXPUNGE`. The first PR checks `CAPABILITY` on the real account and records
  the result.
- **What Gmail does to it:**
  - Google's help says mail in Trash is kept 30 days, can be recovered in that time, and is then deleted for good
    ([Delete or recover deleted Gmail messages](https://support.google.com/mail/answer/7401)).
  - Moving a message to `[Gmail]/Trash` over IMAP removes all its labels, `All Mail` included. Google's own pages do
    not say this in so many words. The [recommended IMAP settings](https://support.google.com/mail/answer/78892)
    warn that saving deleted messages to Trash makes them "permanently deleted from Gmail in 30 days", and a
    [Help Community answer](https://support.google.com/mail/thread/35872645) states the label removal. The first
    PR confirms it on one test message before anything else.
- **Rate:** moving sends no message bodies, so the [IMAP bandwidth limit](https://knowledge.workspace.google.com/admin/gmail/gmail-bandwidth-limits)
  (2,500 MB a day of download) barely applies. Google publishes no command-rate limit for consumer accounts.
  - The cleanup therefore starts slow: one batch every few seconds, with a per-run cap (default 5,000).
  - It backs off on `[THROTTLED]` (memo's `mail.throttled` reason since BUG-234) and stops the run, keeping its
    checkpoint.

## 3. Safety

- **A preview by default.** `memo mail trash personal` changes nothing. It prints, per rule: candidates, kept by guard
  (with reasons), size, oldest and newest date. `--yes` acts.
- **A cap per run:** `--limit` (default 5,000), so the first real run is small and checkable by hand in Gmail.
- **A restore log in the store.** Each run is recorded with its id, account, start and end, and its counts. Each
  moved email is recorded with its Gmail id, its labels and flags just before the move, the batch and the time. The
  log is written before the batch is sent, then confirmed after, so a crash never leaves a moved email unlogged.
- **Undo within 30 days:** `memo mail restore personal --run <id>`.
  - It finds each logged email in `[Gmail]/Trash` by Gmail id and moves it back: to `INBOX` if it had the inbox
    label, otherwise to `[Gmail]/All Mail` through a label it had.
  - It then puts back the logged labels with `+X-GM-LABELS` and the flags.
  - **To be proven on a test message in the first PR:** that moving out of Trash restores the message to All Mail,
    and that the labels come back exactly.
  - After 30 days `restore` reports `expired`, because Gmail has deleted the mail for good.
- **Resume after interruption:** the run's checkpoint uses the shared standard (cli-core "Resumable syncs"). The
  next `--yes` run with the same selection continues the unfinished one; `--rescan` starts a new one.
- **Verification after each batch:** `UID SEARCH X-GM-MSGID` in `[Gmail]/All Mail` must no longer find the moved
  ids. Any still found are retried once, then reported as `not_moved`.
- **Visibility:**
  - `memo mail status personal` shows the last cleanup run and how much is in Trash and restorable;
  - `memo doctor` warns when a run stopped halfway, and when restorable runs are near their 30 days;
  - the failing-sync line covers cleanup too when it runs from the timer. It never does by default.
- **Never on the timer:** cleanup runs only by hand. Nothing in sync, `rules apply` or the timer trashes mail.

## 4. Archive check before the first real run

"The archive is verified" means all of these are true, and `memo mail trash … --yes` refuses until they are:

1. **Every candidate has its envelope in the store** with sender, subject, date, size, labels and Gmail id, and the
   search index has it, so it can still be found by sender and subject after it is gone from Gmail.
2. **The store backup is fresh:** the newest copy in the Drive backup folder is under 8 days old and passed its
   integrity check. memo cannot see Drive, so this check reads a marker file that the backup script writes on
   success (the folder id and time). The script needs that one line added.
3. **The owner confirmed the rule set once,** by running the preview and then a first `--yes --limit 100`, and looking
   at those 100 in Gmail's Trash. Later runs need no confirmation.
4. **Optional:** a Takeout mbox of the candidates, imported with the mbox source, for anyone who wants the full text
   kept. This design does not require it: envelopes were chosen exactly because their text is not wanted.

## 5. Command shape

Names follow cli-base's vocabulary; `trash`, `restore` and `runs` are registered verbs:

```text
memo mail trash <account> [--filter <query>] [--kind <kind>] [--limit <n>] [--yes] [--json]
memo mail restore <account> --run <id> [--yes] [--json]
memo mail runs <account> [--json]
```

- **`--filter` and `--kind`** narrow the candidates with the same query language as `rules`. Neither can widen
  them past the guards in section 1.
- **`--json`** answers `{item, meta}`. `item` holds `run`, `applied`, `candidates`, `trashed`, `kept` (by reason),
  `gone`, `not_moved` and `bytes`, plus `rules`, one entry per rule with the same counts.
- The exact option names are checked by `lint:commands`. Any not in the vocabulary go to cli-base's registry first,
  as the rules work did.

## 6. Order of pull requests

1. **cli-core:** a `mail_cleanup_runs` and `mail_cleanup_items` table, its migration and a store port, plus the
   restore-log writes. It is released by the cli-core release owner.
2. **memo, part one:** the preview and the guards; `trash --yes` behind the archive check; the restore log and
   verification. Proved first on a test account (`gmail-test`): MOVE capability, label loss, and restore bringing
   labels back.
3. **memo, part two:** `restore`, `runs`, the status and doctor lines, and resume.
4. **The backup script:** writes the freshness marker (section 4, item 2).

## Risks

- **A wrong rule trashes wanted mail.** Mitigated by:
  - the decision being made again at clean time;
  - the protected, replied, starred and age guards;
  - a small first run;
  - 30 days of undo.
- **Gmail behaves differently from the Help Community answer** about labels or restore. The first PR proves it on a
  test account before the real one.
- **Gmail deletes Trash after 30 days,** and memo cannot stop that. The restore window is fixed, and doctor warns
  before it closes.
- **The Gmail id changes or goes missing** for some messages. Those are reported as `gone` and never guessed.

## Not in scope

- Archiving (removing the inbox label) or relabelling on the server: a later stage, using the same log.
- Deleting forever, or emptying Trash: never. Gmail does it after 30 days.
- Mail providers other than Gmail.
- Running cleanup on the timer.

## Decisions for the owner

1. **The first real run's size:** **A** 100 emails, checked by hand, then 5,000 per run · **B** all at once.
   Recommended: **A**.
2. **Mail you replied to:** **A** never trash mail from a sender you ever replied to · **B** trash it if a rule
   says so. Recommended: **A**.
3. **The archive check:** **A** require a fresh Drive backup (under 8 days) and envelopes, with no mbox · **B** also
   require a Takeout mbox of everything trashed. Recommended: **A**.
4. **Minimum age:** **A** 30 days · **B** 365 days. Recommended: **A**; age is a guard against fresh mail, not a
   rule.
