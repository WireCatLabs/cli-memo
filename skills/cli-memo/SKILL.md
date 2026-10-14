---
name: cli-memo
description: >-
  Find what the owner knows about a person or a project across Telegram, MAX, mail and notes through memo, and record facts, memories and key documents. Use when asked about a person, a project, what was agreed, or to search messages, mail and notes together.
---

# memo — the owner's context across messengers, mail and notes

memo reads the local store tg and max write, plus the owner's notes and imported mail. It never sends
anything. Add `--json` and read the answer, not the text meant for people.

## Traps

1. **Never choose an account for the owner.** A command that works in one account takes `--provider`
   and, when there are several, `--account`. Asked for one with none given, memo refuses and lists
   them: ask the owner. A read across accounts covers all of them and says so.
2. **`content:` narrows a search to the text of files, `filename:` to their names.** Whether a plain word
   also reads file text and voice transcripts depends on the version. Compare like with like:
   `memo search messages 'content:invoice'` with `tg search messages 'content:invoice'`, a plain word
   with a plain word.
3. **Each search keeps its list and references under its own keys.** `search messages` and
   `search mail`: `items[].locator`; `search all`: `items[].ref` with `kind`; `search notes`:
   `hits[].ref`. Pass a reference back unchanged.
4. **Start work on a project with `memo projects context <key>`.** Its key documents come first:
   read them before anything else. Mark one with
   `memo projects key-documents add <key> <reference> --reason '<why>'`.
5. **What you write is yours as an agent.** `memo facts add`, `memo memories add`,
   `memo relationships add`, `memo actions add` and `memo projects key-documents add` record you
   as the author and wait for the owner. Never pass `--as-owner`: only the owner does, and an agent
   that passes it writes as the owner.
6. **Do not confirm your own proposals** (`memo facts confirm`, `memo memories confirm`,
   `memo relationships confirm`). The owner decides.
7. **Never write message, mail or note text to a file.** Quote it in the answer with its reference.
8. **Before reporting a bug, compare `memo --version` with `npm view @wirecat/cli-memo version`.** An
   older install may lack the fix.
9. **zsh does not split `$c` into words.** `memo $c --help` with `c="projects add"` passes one
   argument, not a command path; write `${=c}` or loop over the words.
10. **A large first mail import takes days, not one run.** `memo sync --mail` reads about 10 emails
    (~1 MB) a second and Gmail caps IMAP downloads (2,500 MB a day for Workspace,
    <https://knowledge.workspace.google.com/admin/gmail/gmail-bandwidth-limits>; the consumer limit is
    not published). Raise `--limit` gradually; each run continues where the last stopped.
11. **Probe before a first large mail import.** `memo mail probe <account> --json` groups mail by
    sender and list from headers only; its `suggest` is a hint, not a decision.
12. **Mail rules are the owner's decision.** Suggest groups to skip or record; never run
    `memo mail rules add … --skip` or `--envelope` unasked. A skipped email is never imported. An envelope
    email is stored without its text and is never a search hit; `memo mail rules list` counts it. Mail
    already stored stays.
13. **Old years come from a Google Takeout mbox**, an account with `"mode": "mbox"` and the Gmail
    address; it syncs only when named, and reads the whole file each run, so give a large `--limit`:
    `memo sync --account <name> --since-time 2000-01-01 --limit 5000`.

## The usual path

```sh
memo context telegram:<id or name> --json        # one person: messages, mail, notes, tasks
memo projects context <key> --json               # one project: key documents first
memo search all '<words>' --project <key> --json # everything, the project's key documents first
memo search messages 'content:invoice' --json    # inside files
memo commands --json                             # every command and option
```

Cite each result by its reference (`msg:…`, `note:…`, `document:…`) so the owner can open it.
