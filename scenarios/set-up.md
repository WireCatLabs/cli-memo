---
title: Set up memo
goal: Get notes and mail into the local store, keep it fresh, and let your agent read it.
steps:
  - run: memo folders add ~/notes
    why: gives your notes folder an id; memo never changes the files
  - run: memo sync --only notes
    why: imports the notes now; mail accounts come from the mail.accounts setting
  - run: memo auto start
    why: syncs notes and mail every 5 minutes from now on
  - run: memo doctor
    why: where memo keeps its files and what needs attention; it connects to nothing
  - run: memo skill install --for all
    why: teaches Claude Code, Codex and Gemini CLI how to use memo
look:
  - what doctor says needs attention
  - whether search by meaning is on, or words only
---
