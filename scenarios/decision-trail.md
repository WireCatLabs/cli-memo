---
title: What did we decide about X, across every source
goal: Find the decision on one topic and the evidence for it in notes, mail, messages, meetings and documents, then record it once.
steps:
  - run: memo facts list kind:decision project:HRB
    why: decisions already recorded for the project, each with the evidence it cites
  - run: memo search all venue
    why: messages, mail and notes that mention the topic, ranked together
  - run: memo search meetings venue
    why: what was said about it in meetings, with the passage to cite
  - run: drive search venue
    why: Drive documents about it; drive commands start with your profile, as in drive personal search venue
  - run: memo ask "what did we decide about the venue?" --all
    why: the cited evidence in one bundle, for you or your agent to read
  - run: memo facts add "The team day is at the harbour venue" --kind decision --evidence msg:telegram/1/77/42 --project HRB
    why: keep the decision with its source, so the next search finds it first
look:
  - the newest decision and who made it
  - later messages or meetings that reverse it
  - whether the recorded decision cites the source you found
---
