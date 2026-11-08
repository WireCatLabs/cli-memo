---
title: Where does this project stand
goal: Answer who owes what, whose move it is in each chat and what has gone quiet, from the store, then stage what you confirmed for the owner.
steps:
  - run: memo projects context HRB
    why: key documents, linked chats and people, and what already waits for the owner's review
  - run: memo projects status HRB --context-query 1C
    why: per chat the last message, whose move it is, open questions, amounts with direction, and which chats to read next
  - run: memo projects status HRB --compact
    why: the same answer, one line per row, when it goes into an agent's context
  - run: max personal messages list --compact -- -900 "date>=2026-10-19"
    why: read only the chats next names, from the date it gives, one line per message
  - run: memo projects evidence HRB --source all --context-query "1 200"
    why: the fingerprint of each message you will cite, which staging needs
  - run: memo projects actions add -
    why: stage the payments and promises you read, each citing its message, on stdin; a paid one names the invoice it settles in supersedes
look:
  - an amount or promise marked pattern was found by words; read the cited message before you stage it
  - a chat the store holds only in part gets a sync line in next; run it before you trust that nothing is open
  - next names at most two chats; read those, not every chat
  - message text stays in the answer; never write it to a file
---

`projects status` reads every account its linked chats are in and lists them in `meta.accounts`. It picks no
messenger profile: when several are signed in to a chat's account, the step says `<profile>` and `missing` names
them; `--sync-profile max=<profile>` chooses one. Every step reads, except the last, which only proposes.
