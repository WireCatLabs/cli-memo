---
title: Set up wcat
goal: Get notes into the local store, keep it fresh, and let your agent read them with the mail the mail CLI syncs.
steps:
  - run: files folders add ~/notes
    why: the files CLI gives your notes folder an id; it never changes the files
  - run: wcat sync
    why: runs files sync for the notes and embeds the mail the mail CLI synced into the same store
  - run: wcat jobs start
    why: syncs notes and embeds new mail for search every 5 minutes from now on
  - run: wcat doctor
    why: where wcat keeps its files and what needs attention; it connects to nothing
  - run: wcat skill install --for all
    why: teaches Claude Code, Codex and Gemini CLI how to use wcat
look:
  - what doctor says needs attention
  - whether search by meaning is on, or words only
---
