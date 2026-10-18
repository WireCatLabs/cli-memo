---
title: Prepare for a meeting
goal: Walk into a recurring meeting knowing what was said last time, what is still open and what the project's documents say.
steps:
  - run: memo meetings prepare 85012345678 --source zoom --project HRB
    why: earlier occurrences, their cues and the related messages and mail, each with a source
  - run: memo meetings actions list status:proposed --source zoom
    why: follow-ups staged from earlier meetings that nobody reviewed
  - run: memo projects context HRB
    why: the project's key documents first, then its notes, findings and open tasks
  - run: memo ask "what is still open for the Harbour kickoff?" --all
    why: one cited bundle across every account and the notes, for your agent to draft an agenda from
look:
  - promises from the last occurrence and whether they were kept
  - open tasks with no owner
  - the time of the next meeting, which preparation does not verify
---
