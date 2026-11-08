# Sources you add by hand

This page helps you give Memo one thing to remember: a file, a web page or text you paste. Memo keeps it as a
document of its own, so you find it in search, an agent finds it when it looks something up, and facts can cite it.
A watched folder is for many files that keep changing ([Notes and folders](notes.md)); this page is for one source.

## Add a source

```sh
memo sources add ~/Downloads/runner-notes.pdf --subject project:3
memo sources add https://example.org/release-notes --title "Release notes"
pbpaste | memo sources add - --subject person:12
```

| Give | Memo reads |
|---|---|
| A file's path | The file, with the readers of [Files Memo can read](notes.md#files-memo-can-read), and web pages saved as `.html` or `.htm` |
| An `http` or `https` address | The page, once, from this computer, as it reads today |
| `-` | The text on stdin |

- **Only the text is kept.** Memo stores the text it read, the title and, for a page, the address you gave. It does
  not copy the file unless you add `--keep-copy`; then the file is copied into Memo's data folder, named by its
  content, so the same file added twice is kept once. `--keep-copy` takes a file only, not a page or pasted text.
- **The same source twice is one source.** Adding it again changes nothing but the subjects you add. A source whose
  content is already in a watched folder or in Drive is not stored again: the answer names that document as
  `duplicate_of`, and only the subjects are linked to it.
- **`--subject`** says who or what it is about: `person:`, `organization:`, `project:`, `task:`, `meeting:`, or a
  messenger contact such as `telegram:'Kai Sample'`. Repeat it for several. Your subjects count at once; an agent's
  wait unconfirmed until you confirm them.
- **`--title`** names it. Without one, Memo takes the page's or the file's own title, or the first line of the text.
- **`--max-chars`** keeps at most that many characters of text, up to 2,000,000 (default 200,000). The answer says
  `truncated: true` when only the first part was kept.

A picture or a scanned PDF has no text Memo can read: it is kept by its title and subjects only (`read: "no-text"`).

## What the answer says

```sh
memo sources add notes.txt --json
```

| Field | Means |
|---|---|
| `ref` | The document, such as `document:42`: the one to cite, show or remove |
| `created` | `true` when this call stored it; `false` when it was there already |
| `duplicate_of` | The watched-folder or Drive document with the same content, when nothing new was stored |
| `kind` | `file`, `page` or `text` |
| `mime`, `bytes` | The type and size of what was read |
| `chars`, `truncated` | How many characters of text the store keeps, and whether that is only the first part; `truncated` is `null` when the text was stored by an earlier add |
| `extractor`, `read` | The reader that read it, and `extracted` or `no-text` |
| `url` | The address you gave; the address a redirect ended at is never kept |
| `kept` | `text`, or `copy` when a copy of the file is kept too; `null` for a duplicate |
| `searchable.words` | Its text is in the word search now |
| `searchable.meaning` | Its text waits for search by meaning: the search model is downloaded and `notes.embed` is not `false`. `memo sync` embeds it |
| `subjects` | Everything it is about now, the subjects linked before included |

## Look at a source

```sh
memo sources show document:42
memo sources show document:42 --bytes 65536 --json
memo sources mentions document:42
```

`sources show` gives the text (16 KiB by default, `--bytes` for more), what it is (`kind`, the `url` you gave,
`file_name`, `mime`, `bytes`), whether a copy is kept, the subjects with whether each is confirmed, and what cites it:
`facts`, `memories` and the findings `batches` whose evidence names it. `kept` is `copy` only while the copy is
still in Memo's data folder. Any other document shows with `added: false` and these fields `null`.

`sources mentions` lists the people and organizations Memo already knows whose names appear in the text, read on
this computer. A person is found by a name Memo has seen in a messenger or a meeting, or by an e-mail address or
phone number of theirs; an organization by its whole name. A name several people share lists each of them. Memo
reads the names of up to 500 organizations; past that, the answer says so in `missing`.

## Have a reader propose facts

A reader is a model you choose that reads a source and proposes the facts in it. You confirm each one; nothing
becomes a fact on its own.

```sh
memo sources readers list
memo sources readers set claude-code
memo sources suggest document:42 --subject person:12
memo actions confirm 17 fact-1 fact-3 --fingerprint <fingerprint>
```

**Choose a reader once.** `memo sources readers list` shows each reader: whether it is installed and signed in, its
model, whether the text leaves this computer (`leaves_computer`), and whether it could open files here
(`reads_files`). It runs one read-only check per reader and chooses nothing. `memo sources readers set <reader>`
chooses one; only you choose, and until you do, `sources suggest` refuses with `reader.none-chosen` and names the
readers.

| Reader | What reads the text | Leaves this computer | Model |
|---|---|---|---|
| `claude-code` | Your signed-in Claude Code, with every tool, MCP server, hook and saved session off, in an empty folder | Yes, to Anthropic | Its own, or `--model` |
| `codex` | Your signed-in Codex CLI in its read-only sandbox, in an empty folder. It is an agent that could still read files on this computer | Yes, to OpenAI | Its own, or `--model` |
| `ollama` | The Ollama running on this computer, at `127.0.0.1:11434` only | No | Required: one that `ollama list` shows |
| `openai`, `anthropic` | The provider's API with your own key | Yes | Required |

An API reader takes its key from the system keyring, never from an environment variable or the command line:
`memo models keys set openai` asks for it at a hidden prompt or reads it from stdin. `memo models keys remove openai`
forgets it. The key is never printed.

**What `sources suggest` does.** It sends the source's stored text to the reader with an instruction to propose
facts, each with the exact words they rest on, and treats the text as data, never as instructions. Then it checks
each answer:

- the quote must be in the text word for word, with spacing and line breaks ignored; a fact whose quote is not there
  is dropped as `quote-not-found`;
- a fact needs a statement and one of the fact types (`fact`, `statement`, `question`, `decision`, `promise`);
- a fact already stored from this source is dropped and named as `duplicate_of`, and a fact repeated in the answer
  is kept once.

What remains is one findings batch that cites the source, each fact with its quote, staged by `memo-reader` with
the reader and model as its model. **Only you confirm it**, even when `agent_decisions` is on:
`memo actions confirm <batch> [fact ids] --fingerprint <fingerprint>` creates the facts you name and rejects the
rest. A confirmed fact keeps its quote on its evidence, so a later source check knows which words it rests on. The
answer lists the `facts` staged and the `dropped` ones with why.

Reading the same text again with the same reader, model and subject returns the batch it staged before with
`reused: true` and does not ask the reader again. `--rescan` asks again. `--subject` says who or what every fact is
about: `person:`, `organization:`, `project:` or `task:`. `--provider` and `--model` read with another reader once;
only you may give them.

An agent in its terminal may run `sources suggest`, but only with the reader you chose, and the batch still waits for
you. Over MCP it is not offered: an agent cannot send a source's text off this computer.

## Remove a source

```sh
memo sources remove document:42
```

Only you remove a source you added. Its text goes, the copy Memo kept is deleted, and the answer lists the facts and
memories that cite it as `facts` and `memories`. Removing changes none of them: they keep their status, and the next
source check of `memo sync` opens a review of each, citing a source that is gone, for you to decide. A file on your
disk is never touched.

## For an agent

An agent in a terminal adds a source the same way, and its subjects wait for you to confirm them:

```text prompt
Use memo CLI to keep these meeting notes as a source about Northbridge Bench, then list the people named in it.
```

Over MCP, `sources add` takes `text` only: an agent cannot make Memo read a file on this computer or open an
address. `sources remove`, `sources suggest` and `sources readers set` are not offered over MCP
([The MCP server](mcp.md)).

## When adding fails

Each refusal names its reason and what to do next; [Troubleshooting](troubleshooting.md#adding-a-source) lists them
all, and the reasons a reader refuses. A link that needs you signed in, such as a private Google Doc, cannot be read this way: save it as a file and
add the file.
