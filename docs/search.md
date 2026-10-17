# Search

This page helps you find something you wrote or received, in your notes, your mail or your Telegram
and MAX messages, and give your agent the sources behind an answer. Every result names its source,
so you can open the original and check it. An empty result means only that the local store has
nothing that matches; the chat may not be downloaded or the folder not imported yet.

## Ask your agent

```text prompt
Use memo CLI to find what was agreed about the Harbour budget, in my notes, mail and messages.
Quote the matching text, show the source of each result and tell me what you could not search.
```

Your agent picks the search, reads the matching text and shows you the sources. You can check each
one with `memo notes show` or in the original app.

## Choose where to search

| Where it is | Command |
|---|---|
| You do not know | `memo search all 'budget'` |
| Your notes and files | `memo search notes 'budget'` |
| Your email | `memo search mail 'budget'` |
| Telegram or MAX messages | `memo search messages 'budget'` |

`search all` looks in messages, mail and notes together. It does not search people, memories,
projects or tasks; use `memo context`, `memo search memories` and `memo tasks list` for those.
When you know where something is, its own search is better, because it understands more search
words.

## Search words

A search finds results that contain **every** word you type, including other forms of the word
(`meeting` also finds `meetings`).

| To find | Type |
|---|---|
| All of these words | `budget venue` |
| An exact phrase | `"budget review"` |
| One word or another | `budget OR invoice` |
| Without a word | `budget NOT cancelled` |
| With a tag | `tag:follow-up` |
| On a day, or from a day on | `date:2026-10-08`, `date:[2026-09-01 TO *]` |
| From or to someone (mail and messages) | `from:kai`, `to:kai@example.com` |
| In the subject or a mail folder (mail) | `subject:invoice`, `mailbox:important` |
| Inside an attached file (messages and mail) | `content:invoice`, `filename:*.pdf` |

`content:` narrows a search to the text of files and `filename:` to their names:
`memo search messages 'content:invoice'`. A file's text is there once tg or max has read it
(`tg attachments extract`) or an agent has written it.

Put the search in single quotes so the terminal passes it to Memo as it is:
`memo search notes '"budget review" NOT cancelled'`. `--exact` matches words only as written.

## Narrow down your notes

```sh
memo search notes 'budget' --filter 'tag:work'          # only notes with a tag
memo search notes 'budget' --source notes:2              # only one folder, by the id a hit shows
memo search notes 'budget source:internal'               # only notes you wrote in Memo
memo search notes 'budget' --filter 'date:2026-10-08'    # and a second condition
```

`source:file` shows only notes from files. The query field `source:` is the note's own source; the `--source`
option is different: it chooses which folders are read. Results come 20 at a time; when there are more, `--page 2`
shows the next page, and the answer's `page.next_page` says which page that is.

## Search mail

```sh
memo search mail 'from:kai subject:invoice'
memo search mail 'mailbox:important budget'
memo search mail 'budget' --source email:you@example.com
```

`mailbox:` finds a mail folder or a Gmail label, such as `inbox`, `important` or `starred`. Without
`--source`, Memo searches every mail account; `--source email:work,email:personal` searches those two. Text inside attachments is searched too
(`filename:` and `content:`).

## Search by meaning

With the search model on your computer, Memo also searches by meaning, so `holiday` can find a note
about a vacation. tg or max downloads the model once:

```sh
tg models text download e5-small    # or: max models text download e5-small
```

The model runs on your computer. After the download, run `memo sync` so your notes are prepared
for it. Each result says whether it was found by words, by meaning or both. Without the model,
Memo says "Searched by words only" and still finds every note that contains the words.

## What a result shows

For a note, a result shows the file and the first matching line. Below the results, Memo lists the
notes and people that the results link to:

```text
Projects/Budget.md
  # Budget review

Linked from these notes
  Kai Sample  (nobody by that name yet)  (1)
```

`nobody by that name yet` means the note links to a name that is not a known person in the local
store yet. Add `--json` to get each result's reference, its links and how it was found.

## Give your agent the sources

`memo ask` collects the sources for a question, so your agent can answer and cite them:

```sh
memo ask 'What is the Harbour budget?' 'Harbour budget' --all
```

The words after the question are what Memo searches for; without them, Memo searches for the whole
question, and every word must match. `--all` searches every account; use `--source telegram:1` for one
account. The answer lists each source with its reference and text, what was searched and whether
anything was left out. Memo does not answer the question itself and does not save the answer.

Memo can also send the sources to an AI provider you set up and return its answer: add `--analyze`,
and `--allow-remote` for a provider outside your computer. See
[configuration](configuration.md#environment-variables). The provider's answer is generated text:
check it against the sources.

Next: [see everything about one person](people.md), or [turn what you found into a task](tasks.md).
