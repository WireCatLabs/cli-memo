---
title: Start the day
goal: See what needs you today and what agents did overnight, without reading every chat or mailbox.
steps:
  - run: wcat jobs status
    why: whether the timer synced notes and mail lately; a failed run is named here
  - run: wcat tasks agenda
    why: tasks overdue or due, chats where you owe an answer and chats where you wait for one
  - run: wcat actions list status:proposed
    why: replies and invitations agents proposed, waiting for your yes or no
  - run: wcat facts list status:proposed
    why: facts agents recorded that you have not confirmed
  - run: wcat agents list --limit 20
    why: every tool call an agent made, never with its arguments
look:
  - the oldest unanswered chat
  - tasks due today
  - proposals to confirm or reject before an agent builds on them
---
