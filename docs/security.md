# Security

This page says what Memo reads, what it writes and what can leave your computer, so you can decide
what to point it at. Imports leave your sources unchanged, and Memo never changes a mailbox:
Gmail cleanup is a command of the separate `mail` program. Memo keeps its records on your computer and sends text
to an AI provider only when you configure one and allow it.

<a id="your-sources-are-only-read"></a>

## Imports leave your sources unchanged

- **Note folders** are only read. Hidden folders such as `.obsidian` are skipped. Note exports write
  into the folder you name and never overwrite a file you edited. Selected annotation exports create
  a new private file at the path you choose, as described below.
- **Mail**: Memo never opens a mailbox, sends mail or changes one. Syncing and
  [Gmail cleanup](mail.md#commands-that-moved-to-mail) are commands of the separate `mail` program.
- **Tags** leave your files, Gmail labels and mailbox flags as they are.

## What Memo adds stays on your computer

Your notes, links, tags, tasks, reminders, memories, facts and proposed actions are kept in the local
store, a file on your computer shared with tg and max. Search by meaning uses a model that runs on
your computer. Reminders go to a program on your computer that asks for them, never to a messenger
or a mailbox.

## A source you add by hand

[`memo sources add`](sources.md) keeps the text it read, not the file: a copy of the file is made only with
`--keep-copy`, into Memo's data folder, readable by you alone. Nothing says a file is kept unless a copy was made.
Reading a file or pasted text sends nothing anywhere.

A link is read once, from this computer, as one plain request:

- Only `http` and `https`, with no user name or password in the address. No cookies and no sign-in are sent, so a
  page that needs you signed in, such as a private Google Doc, is refused.
- Every address the name points to must be on the public internet. `localhost`, home and office networks
  (`10.*`, `192.168.*` and the like), link-local and cloud metadata addresses are refused, on every redirect too, and
  the connection goes to the address that was checked. A link cannot make Memo read a service on your computer or
  your network.
- At most 50 MiB, 30 seconds and 5 redirects; a redirect from `https` to plain `http` is refused.
- The site sees your IP address, as it would in a browser.
- Memo keeps the address you gave, never the one a redirect ended at, which may carry a signed token. An error
  names the site only.
- The address is a typed value, so the run log keeps it unless [`record_input`](configuration.md#record-record_input-and-keep_runs_for_days) is
  `false`. Add `--no-record` when the address carries a token.
- Over MCP an agent may add text only. It cannot make Memo read a file or open an address, and only you remove a
  source.

## Deletions are respected

When you delete a note file or an email, its text leaves the local store on the next import. If an
import finds that an unusually large part of a folder or mailbox is missing at once, it deletes
nothing and tells you.

<a id="agents-suggest-you-decide"></a>

## Control agent decisions

- An agent's memories, directly recorded facts and outbound action proposals start as proposed. MCP exposes
  command tools for decisions too, limited by saved [permissions](configuration.md#permissions).
- Project proposals have a separate review flow. By default only you confirm or reject them; reading and
  proposing still work. Set [`agent_decisions: true`](configuration.md#agent_decisions) to let an agent
  decide them with a recorded reason; confirmation can create accepted facts and numbered tasks or confirm a
  key document. Meeting decisions require explicit permissions.
- A fact, memory or relationship added with the `memo` command records who wrote it.
  When an agent's terminal runs it (`AI_AGENT` or `CLAUDECODE` is set), or nothing shows a person at a
  terminal, the agent is the author and it waits for review. Yours is confirmed or accepted at once.
- Every decision names who decides. An agent never decides its own bot's proposal, needs `--reason`, and is
  refused every decision unless `agent_decisions` is `true`. In an agent's terminal, `--as-owner` asks y/N at
  the terminal before it acts as you; without a terminal or under `--json` it refuses with exit 7.
- WireCat Desktop runs memo with no terminal, so on every decision you make in the app it passes `--from-app`,
  and memo records the decision as yours. The flag says you acted in the app; it is not a security check. Memo takes
  its word every time, even with `AI_AGENT` or `CLAUDECODE` set, so anything that can run memo as you can pass it.
  Desktop removes the agent variables from its runs. Over MCP the flag is not offered.
- Approving an action makes it a task for you. Memo never sends a message or an email.
- Selected [project annotation export and preview](recipes.md#keep-selected-project-annotations) read
  sources and targets without restoring them. Export writes a new private file and refuses existing
  paths. Restore requires a successful preview fingerprint; an MCP agent also needs explicit
  `projects.annotations.restore` permission. It preserves historical accepted/proposed state; it is not a new confirmation of a proposal.
  MCP reads still produce their normal audit entry. The format omits several project facets and
  cannot replace a full archive backup.
- The agent log records the agent, the tool, the result and the time, never what the agent sent.
- An agent that should only read runs with `MEMO_READ_ONLY=1`. Every command that changes something then
  stops with `permission_error` (exit 5), and `memo mcp serve` keeps writing commands discoverable but refuses them. Reads and `memo sync`
  still run, and so does `tasks link`, the task write a scheduled agent makes, as in tg and max:
  a link is only suggested, and linking two tasks is refused. `reminders claim` is refused.
- Two accounts are treated as one person only after you link them. A matching name or email domain
  is never enough.

## A reader that proposes facts

[`memo sources suggest`](sources.md#have-a-reader-propose-facts) sends a source's stored text to the reader you
chose, and to nothing else. Memo never chooses one: until you do, it refuses, and an agent can neither choose one nor
name another.

- `memo sources readers list` says for each reader whether the text leaves this computer and whether the reader could
  read files here. Ollama is reached at `127.0.0.1` only. Codex is an agent: its sandbox is read-only, but it could
  still read files on this computer.
- Claude Code runs with every tool, MCP server, hook, slash command and saved session off, in an empty folder, with
  the text on stdin. Codex runs in its read-only sandbox in an empty folder. Neither gets `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY` or an agent's variables from Memo's environment.
- An API key lives in the system keyring only. `memo models keys set` takes it at a hidden prompt or on stdin, never
  as an argument, and never reads one from the environment. No answer, error or run record holds it.
- The text is given as data, with an instruction never to follow what it says. A fact is proposed only with a quote
  found in the text, and only you confirm the batch, even with `agent_decisions` on.
- Over MCP, `sources suggest`, `sources readers set` and `models keys` are not offered.

## What can leave your computer

- Browser and phone apps connect through your HTTPS tunnel and the shared access-code login. They use
  the same command permissions as local MCP clients. `memo mcp revoke` invalidates their saved logins,
  including on a running server; see [remote access](remote.md).

- `memo sources suggest` sends one source's text to the reader you chose; `memo sources readers list` says whether
  it leaves this computer.
- `memo answers create` gives the sources to your own agent by default. It sends them to an AI provider only
  with `--analyze`, and to a provider outside your computer only with `--allow-remote` as well. The
  provider's answer is generated text: check it against the sources.
- What your agent does with the text it reads is up to that agent and its provider. Memo cannot
  control it. Point your agent only at the sources you are willing to share with it.
- Once a day Memo asks npm whether a newer version exists. Turn it off with `"update_check": false` in the
  settings, or `MEMO_NO_UPDATE_CHECK=1`. Memo never updates itself.
