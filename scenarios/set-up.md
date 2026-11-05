---
title: Set up memo
goal: Get notes into the local store, keep it fresh, and let your agent read them with the mail the mail CLI syncs.
steps:
  - run: memo folders add ~/notes
    why: gives your notes folder an id; memo never changes the files
  - run: memo sync --only notes
    why: imports the notes now; the mail CLI syncs mail into the same store (mail <profile> sync)
  - run: memo jobs start
    why: syncs notes and embeds new mail for search every 5 minutes from now on
  - run: memo doctor
    why: where memo keeps its files and what needs attention; it connects to nothing
  - run: memo skill install --for all
    why: teaches Claude Code, Codex and Gemini CLI how to use memo
look:
  - what doctor says needs attention
  - whether search by meaning is on, or words only
---
