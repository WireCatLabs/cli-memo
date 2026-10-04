# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/leemour/tg-cli) and
[max-cli](https://github.com/leemour/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Everything stays on your machine; nothing is
sent or changed at the source.

**Status:** early. Notes work; mail and messages are being built.

## Notes

```sh
memo notes "Rin Example" --folder ~/Notes
```

It lists the notes *about* the person (file name or `aliases` in the front matter), the notes that
*link* them (`[[Rin Example]]`, also through an alias or a heading), and lines that only say the name —
labelled weak, since another person can have the same name. Newest first, each with its file and line;
`--json` for scripts and agents, `--limit` for more. Hidden folders such as `.obsidian` are skipped, and
nothing is ever written.

To skip `--folder`, list the folders in `~/.config/cli-memo/config.json`:

```json
{ "notes": { "folders": ["/path/to/vault"] } }
```

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

MIT
