# cli-memo

`memo` answers "what do I need to know about this person": who they are in each messenger, the
newest messages each way, the notes about them, and the newest mail threads — each item with a link
to its source.

It reads the local message store that [tg-cli](https://github.com/leemour/tg-cli) and
[max-cli](https://github.com/leemour/max-cli) share, Markdown notes such as an Obsidian vault, and mail
through [Himalaya](https://github.com/pimalaya/himalaya). Everything stays on your machine; nothing is
sent or changed at the source.

**Status:** early. The command exists; the readers are being built.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## License

MIT
