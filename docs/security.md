# Security

This page says what Memo reads, what it writes and what can leave your computer, so you can decide
what to point it at. Imports leave your sources unchanged; separate Gmail cleanup commands can
move mail when you run them with `--yes`. Memo keeps its records on your computer and sends text
to an AI provider only when you configure one and allow it.

<a id="your-sources-are-only-read"></a>

## Imports leave your sources unchanged

- **Note folders** are only read. Hidden folders such as `.obsidian` are skipped. Memo writes files
  only when you export notes, into the folder you name, and never overwrites a file you edited.
- **Mail imports** open your mailbox read-only and do not mark mail as read. Memo never sends mail.
- **Gmail cleanup** is separate: `memo mail trash` and `memo mail restore` show a preview unless you
  pass `--yes`. Trash moves selected mail into Gmail's Trash; Gmail deletes it permanently after
  30 days. Restore returns a logged run's mail while it remains in Trash. Cleanup requires a recent
  store backup and never runs from the sync timer. See [Gmail cleanup](mail.md#clean-up-gmail).
- **Tags** leave your files, Gmail labels and mailbox flags as they are.

## What Memo adds stays on your computer

Your notes, links, tags, tasks, reminders, memories, facts and proposed actions are kept in the local
store, a file on your computer shared with tg and max. Search by meaning uses a model that runs on
your computer. Reminders go to a program on your computer that asks for them, never to a messenger
or a mailbox.

## Deletions are respected

When you delete a note file or an email, its text leaves the local store on the next import. If an
import finds that an unusually large part of a folder or mailbox is missing at once, it deletes
nothing and tells you.

<a id="agents-suggest-you-decide"></a>

## Control agent decisions

- An agent's memories, directly recorded facts and outbound action proposals start as proposed. MCP does not
  confirm memories, directly accept existing proposed facts or approve outbound actions.
- Project proposals have a separate review flow. By default an agent can confirm or reject them with
  a recorded reason; confirmation can create accepted facts and numbered tasks or confirm a key
  document. Set [`agent_decisions: false`](configuration.md#agent_decisions) to require owner decisions
  for project proposals. Reading and proposing still work. Meeting findings still require the owner.
- A fact, memory or relationship added with the `memo` command records who wrote it.
  When an agent's terminal runs it (`AI_AGENT` or `CLAUDECODE` is set), the agent is the author and the
  directly recorded fact, memory or new relationship waits for review. An owner's memory or relationship
  is confirmed and a fact accepted at once;
  in an agent's terminal, add `--as-owner`. `--as-owner` is a label, not a lock: an agent can pass it
  too, so tell your agent never to.
- Approving an action makes it a task for you. Memo never sends a message or an email.
- The agent log records the agent, the tool, the result and the time, never what the agent sent.
- An agent that should only read runs with `MEMO_READ_ONLY=1`. Every command that changes something then
  stops with `permission_error` (exit 5), and `memo mcp` offers only its reading tools. Reads and `memo sync`
  still run, and so do the task writes a scheduled agent makes with `tasks plan` and `tasks link`, as in tg and max:
  a link is only suggested, and linking two tasks is refused. `reminders poll` is refused.
- Two accounts are treated as one person only after you link them. A matching name or email domain
  is never enough.

## What can leave your computer

- `memo ask` gives the sources to your own agent by default. It sends them to an AI provider only
  with `--analyze`, and to a provider outside your computer only with `--allow-remote` as well. The
  provider's answer is generated text: check it against the sources.
- What your agent does with the text it reads is up to that agent and its provider. Memo cannot
  control it. Point your agent only at the sources you are willing to share with it.
- Mail sync asks domain registries when a sender's domain was registered. It does this by itself, at most once a
  day, for senders you never wrote to and heard from in the last two years. `memo mail inspect --domain-age` asks
  for the groups it shows. Each question tells one registry one domain name; it is asked once and the answer is
  kept on your computer. Big mailbox providers such as gmail.com are never asked. There is no setting to turn
  this off; see [how sender domains are checked](mail.md#choose-what-to-import).
- Once a day Memo asks npm whether a newer version exists. Turn it off with `"update_check": false` in the
  settings, or `MEMO_NO_UPDATE_CHECK=1`. Memo never updates itself.
