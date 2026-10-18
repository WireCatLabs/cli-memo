---
title: one person across every tool
goal: Know everything about one person before a call — messages in tg and MAX, mail, notes, meetings and Drive documents — with a source for each line.
steps:
  - run: memo context telegram:Kai
    why: their messages, mail, notes and open tasks in one answer, each with a link to its source; email:kai@example.com finds them by address
  - run: memo facts list subject:"person:42"
    why: decisions, promises and questions already recorded about them; the person reference comes from context's answer
  - run: memo memories list subject:"person:42"
    why: preferences and summaries kept about them
  - run: memo search meetings Kai
    why: meetings that mention them, with the passage to cite
  - run: tg contacts context Kai
    why: shared Telegram chats, the last messages each way and where others mentioned them; tg, max and drive commands start with your profile, as in tg personal contacts context Kai
  - run: max contacts context Kai
    why: the same for MAX
  - run: zm meetings context person:42
    why: what stored Zoom meetings say about them, through the identities linked to that person
  - run: drive search Kai
    why: Drive documents that name them
  - run: memo ask "what is open with Kai?" --all
    why: one cited evidence bundle across every account and the notes, ready to hand to your agent
look:
  - open tasks and promises, both ways
  - the last contact in each channel, and who wrote last
  - decisions recorded about them, and anything newer that contradicts one
  - documents worth rereading before the call
---

memo joins what the store already holds; the other tools add what only they read. Every step reads — nothing is
sent and nothing changes.
