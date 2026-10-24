# Compared with other tools

Several open tools give an AI agent a memory. Most of them are memory engines: you push data into them
through an API. `memo` works the other way. It reads your own notes, mail and messenger archives into one
local store, and your agent searches that store. This page puts `memo` next to seven of these tools, so you
can pick the one that fits your job. The marks come from each project's own documentation and source, checked
on 24 October 2026; a tool may do more than its documentation says. Each mark for another tool links to the
page it comes from.

The tools:

- **memo** — this tool: a command line and an MCP server over a local store of your notes, mail and messages.
- **[Hindsight][hs]** — an agent memory server with retain, recall and reflect, entities and time.
- **[mem0][m0]** — a memory layer: a library, a self-hosted server, a hosted platform, a CLI and MCP.
- **[Graphiti][gr]** — a framework for temporal knowledge graphs, with a reference MCP server. Zep is its paid cloud.
- **[Cognee][cg]** — a memory platform that turns documents and conversations into a knowledge graph.
- **[basic-memory][bm]** — Markdown notes as a knowledge graph, built for MCP.
- **[Obsidian][ob] with [mcp-obsidian][obm]** — a notes app and an MCP server that talks to it through a plugin.
- **[Screenpipe][sp]** — local screen and audio recall, with MCP.

✅ yes · 🟡 partly · ❌ no · ➖ not in its documentation

## Features

| Feature | memo | Hindsight | mem0 | Graphiti | Cognee | basic-memory | Obsidian + MCP | Screenpipe |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Setup** | | | | | | | | |
| Install without Docker or a server | ✅ | 🟡 [↗][hs] | ✅ [↗][m0] | ❌ [↗][gr-db] | ✅ [↗][cg] | ✅ [↗][bm] | 🟡 [↗][obm] | ✅ [↗][sp] |
| Works with no LLM key | ✅ | ❌ [↗][hs-core] | ➖ | ❌ [↗][gr-env] | ✅ [↗][cg-news] | ✅ [↗][bm] | ✅ [↗][obm] | ➖ |
| **Sources it reads from your own accounts** | | | | | | | | |
| Telegram, MAX and WhatsApp chats | ✅ | ❌ [↗][hs-core] | ❌ [↗][m0] | ❌ [↗][gr] | ➖ | ❌ [↗][bm] | ❌ [↗][obm] | 🟡 [↗][sp] |
| Gmail and IMAP mail | ✅ | ❌ [↗][hs-core] | ❌ [↗][m0] | ❌ [↗][gr] | ✅ [↗][cg-news] | ❌ [↗][bm] | ❌ [↗][obm] | 🟡 [↗][sp] |
| A folder of notes | ✅ | ✅ [↗][hs-int] | ➖ | ❌ [↗][gr] | 🟡 [↗][cg] | ✅ [↗][bm] | ✅ [↗][obm] | ❌ [↗][sp] |
| Meeting transcripts | ✅ | ➖ | ➖ | ❌ [↗][gr] | ➖ | ❌ [↗][bm] | ❌ [↗][obm] | ✅ [↗][sp] |
| Google Drive documents | 🟡 | ➖ | ➖ | ❌ [↗][gr] | ✅ [↗][cg-news] | ❌ [↗][bm] | ❌ [↗][obm] | 🟡 [↗][sp] |
| **Search** | | | | | | | | |
| Words and meaning together | ✅ | ✅ [↗][hs-core] | ✅ [↗][m0] | ✅ [↗][gr-mcp] | ✅ [↗][cg] | ✅ [↗][bm] | 🟡 [↗][obm] | ✅ [↗][sp] |
| Every hit cites its source | ✅ | ✅ [↗][hs-core] | ➖ | 🟡 [↗][gr-mcp] | ➖ | ✅ [↗][bm] | ✅ [↗][obm] | ➖ |
| Says what it did not search | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Knowledge and memory** | | | | | | | | |
| Finds entities and facts in text by itself | ❌ | ✅ [↗][hs-core] | ✅ [↗][m0] | ✅ [↗][gr] | ✅ [↗][cg] | 🟡 [↗][bm] | ❌ [↗][obm] | ➖ |
| Facts with a date they hold from or until | 🟡 | ✅ [↗][hs-core] | ➖ | ✅ [↗][gr] | ➖ | ❌ [↗][bm] | ❌ [↗][obm] | ➖ |
| People, organizations, projects and links | ✅ | ✅ [↗][hs-core] | 🟡 [↗][m0-price] | ✅ [↗][gr] | ✅ [↗][cg] | ✅ [↗][bm] | ✅ [↗][obm] | ❌ [↗][sp] |
| Read the whole link graph | 🟡 | ➖ | ➖ | ✅ [↗][gr-mcp] | ✅ [↗][cg-news] | ✅ [↗][bm] | ✅ [↗][obm] | ❌ [↗][sp] |
| Memories an agent adds wait for your confirmation | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Tasks, agenda and reminders built in | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Writing and forgetting** | | | | | | | | |
| An agent saves a memory over MCP | ✅ | ✅ [↗][hs-mcp] | ✅ [↗][m0-mcp] | ✅ [↗][gr-mcp] | ✅ [↗][cg-mcp] | ✅ [↗][bm] | ➖ | ➖ |
| An agent edits notes, tasks and tags over MCP | ✅ | ➖ | ➖ | ➖ | ➖ | ✅ [↗][bm] | ➖ | ➖ |
| Forget or delete one item | 🟡 | ➖ | ➖ | ✅ [↗][gr-mcp] | ✅ [↗][cg] | ➖ | ➖ | ➖ |
| **Agent integration** | | | | | | | | |
| MCP over stdio | ✅ | ❌ [↗][hs-mcp] | 🟡 [↗][m0-mcp] | ✅ [↗][gr-mcp] | ✅ [↗][cg-mcp] | ✅ [↗][bm] | ✅ [↗][obm] | ✅ [↗][sp] |
| MCP over HTTP | ❌ | ✅ [↗][hs-mcp] | ✅ [↗][m0-mcp] | ✅ [↗][gr-mcp] | ✅ [↗][cg] | ➖ | ❌ [↗][obm] | ➖ |
| Skill or plugin for coding agents | ✅ | ✅ [↗][hs] | ✅ [↗][m0-int] | ➖ | ➖ | ✅ [↗][bm] | ❌ [↗][obm] | ➖ |
| Command list an agent can read as JSON | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Local store and limits** | | | | | | | | |
| Data stays on your machine by default | ✅ | 🟡 [↗][hs] | 🟡 [↗][m0-mcp] | ✅ [↗][gr] | ✅ [↗][cg] | ✅ [↗][bm] | ✅ [↗][obm] | ✅ [↗][sp] |
| Limits for an agent: permission per command, read-only switch | ✅ | ➖ | ➖ | ➖ | ➖ | 🟡 [↗][bm] | ➖ | ➖ |
| Log of every agent call | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Visual interface | ❌ | ✅ [↗][hs] | ✅ [↗][m0] | ❌ [↗][gr] | ✅ [↗][cg] | 🟡 [↗][bm] | ✅ [↗][obm] | ✅ [↗][sp] |
| **Accounts and devices** | | | | | | | | |
| Several accounts per source, chosen by you | ✅ | 🟡 [↗][hs-core] | 🟡 [↗][m0] | 🟡 [↗][gr-mcp] | ➖ | 🟡 [↗][bm] | 🟡 [↗][obm] | ➖ |
| Sync across devices | ❌ | ✅ [↗][hs-price] | ✅ [↗][m0] | ❌ [↗][gr] | ✅ [↗][cg] | ✅ [↗][bm] | ✅ [↗][ob-price] | 🟡 [↗][sp-lic] |
| **Export and evidence** | | | | | | | | |
| Export your data | 🟡 | ➖ | 🟡 [↗][m0] | ➖ | ➖ | ✅ [↗][bm] | ✅ [↗][obm] | ➖ |
| A published memory benchmark | ❌ | ✅ [↗][hs-bench] | ✅ [↗][m0] | ✅ [↗][gr] | ✅ [↗][cg] | ❌ [↗][bm] | ❌ [↗][obm] | ❌ [↗][sp] |

Notes on `memo`:

- **Sources.** Telegram, MAX, WhatsApp, Zoom meetings and Google Drive reach the store through the sister tools
  `tg`, `max`, `wa`, `zm` and `drive`. `memo` reads that store. Notes folders and mail it imports itself; mail
  goes through [Himalaya](https://github.com/pimalaya/himalaya). `search all` covers messages, mail and notes;
  meetings have their own `search meetings`.
- **Search by meaning** uses a local model that `memo models text download` fetches. Without it, word search still works.
- **No LLM key.** Sync and search never call a model. `ask --analyze` calls a model you configure, and only if you ask.
- **MCP.** `memo mcp` offers the commands as tools, writes included, except `mcp`, `upgrade`, `skill install`,
  `auto start` and `auto stop`. Permissions in the configuration set each command to `deny`, `readonly`, `ask` or
  `allow`. `MEMO_READ_ONLY=1` removes the writing tools. Memories, facts and actions an agent adds are saved as
  proposed until you confirm them.
- **Knowledge.** `memo` stores messages and the links you or your agent record. It does not find entities or
  facts in text by itself. `facts add` takes a date and `facts reverse` ends a decision; links can be listed, but
  there is no graph view.
- **Benchmark.** No memory benchmark result for `memo` is published.

## Install and licence

| | memo | [Hindsight][hs] | [mem0][m0] | [Graphiti][gr] | [Cognee][cg] | [basic-memory][bm] | [Obsidian][ob] + [mcp-obsidian][obm] | [Screenpipe][sp] |
|---|---|---|---|---|---|---|---|---|
| Install | npm, pnpm, Bun | Docker, pip or embedded | library, self-hosted server, hosted platform, CLI | needs Neo4j or FalkorDB | pip | uv | app, plugin and server | app |
| Licence | Apache-2.0 | MIT | Apache-2.0 | Apache-2.0 | Apache-2.0 | AGPL-3.0 | app free; plugin MIT | source-available commercial licence |
| Price | free | self-host free; [Cloud pay per use][hs-price] | [free Hobby plan, paid plans][m0-price] | bring your own database; Zep is paid | Cognee Cloud is optional | Cloud from $15 a month | Sync from $4 a month ([pricing][ob-price]) | [Free, Basic and Business plans][sp-lic] |

## When another tool fits better

- **Hindsight, mem0, Graphiti or Cognee** — you want entities, facts and time pulled out of text by a model, or a
  knowledge graph, and you push the data in through an API.
- **Hindsight or mem0** — you want a hosted service, a dashboard and a published memory benchmark.
- **basic-memory** — your knowledge is Markdown you write with an agent, and you want a Cloud sync between devices.
- **Obsidian with mcp-obsidian** — you live in Obsidian and want its interface, with an agent on top.
- **Screenpipe** — you want to recall what was on your screen or said aloud, not what is in your accounts.
- **Any tool with an interface or sync across devices** — `memo` has a terminal and an agent only, and one store per computer.

If `memo` fits, start with [installation](installation.md); to connect an agent without a terminal,
see [the MCP server](mcp.md).

[hs]: https://github.com/vectorize-io/hindsight
[hs-core]: https://github.com/vectorize-io/hindsight#core-concepts
[hs-mcp]: https://hindsight.vectorize.io/developer/mcp-server
[hs-int]: https://hindsight.vectorize.io/sdks/integrations/obsidian
[hs-bench]: https://benchmarks.hindsight.vectorize.io/
[hs-price]: https://vectorize.io/pricing
[m0]: https://github.com/mem0ai/mem0
[m0-mcp]: https://docs.mem0.ai/platform/mem0-mcp
[m0-int]: https://github.com/mem0ai/mem0/tree/main/integrations
[m0-price]: https://mem0.ai/pricing
[gr]: https://github.com/getzep/graphiti
[gr-db]: https://github.com/getzep/graphiti#requirements
[gr-env]: https://github.com/getzep/graphiti#optional-environment-variables
[gr-mcp]: https://github.com/getzep/graphiti/tree/main/mcp_server
[cg]: https://github.com/topoteretes/cognee
[cg-news]: https://github.com/topoteretes/cognee#latest-news
[cg-mcp]: https://docs.cognee.ai/cognee-mcp/mcp-overview
[bm]: https://github.com/basicmachines-co/basic-memory
[ob]: https://obsidian.md
[ob-price]: https://obsidian.md/pricing
[obm]: https://github.com/MarkusPfundstein/mcp-obsidian
[sp]: https://github.com/screenpipe/screenpipe
[sp-lic]: https://github.com/screenpipe/screenpipe#pricing
