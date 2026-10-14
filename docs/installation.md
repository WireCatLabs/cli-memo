# Installation

Read this page before you run Memo for the first time, when you move to another computer, and when you update or
remove Memo. When you are done, Memo is installed, you checked that it runs, and you know where it keeps its files.
Adding your notes and mail is the next step, on its own pages.

Words this page uses:

- **npm package**: how Memo is shipped. npm (or pnpm, or Bun) downloads it and puts the `memo` command on your
  computer. The package is **`@wirecat/cli-memo`**; the command it installs is **`memo`**.
- **Node.js**: the program that runs Memo. Install it first.
- **PATH**: the list of folders where the terminal looks for a command by its name. `memo` runs by name only if its
  folder is on the PATH.
- **The local store**: one database file on your computer that holds the text of your notes, mail and messages.
  Memo shares it with [tg](https://github.com/WireCatLabs/tg-cli) and [max](https://github.com/WireCatLabs/max-cli).
- **Skill**: short instructions that tell an AI agent how to use Memo.

Installing does not log in anywhere, does not start a background service and does not read your notes or mail. Memo
reads a folder or a mailbox only when you add it and run `memo sync`. Syncing on a timer is a separate step that you
turn on with `memo auto start`.

## What it needs

- **Node.js 22.16+ (the 22.x line) or 24+**, with npm. If you do not have it, ask your agent to help, or get it from
  [nodejs.org](https://nodejs.org).
- Linux, macOS or Windows.

Each source needs one more thing, and only when you use it:

| Source | What it needs |
|---|---|
| Notes and documents | Nothing. PDF and Word (`.docx`) files need two optional readers: [files Memo can read](notes.md#files-memo-can-read) |
| Telegram or MAX messages | [tg](https://github.com/WireCatLabs/tg-cli) or [max](https://github.com/WireCatLabs/max-cli). They save your chats in the local store; Memo does not log in to a messenger |
| Search by meaning | A small search model on your computer. tg or max downloads it once: `tg models text download e5-small`. Without it, Memo searches by words |
| Mail | [Himalaya](https://github.com/pimalaya/himalaya), the mail program Memo uses to read a mailbox ([mail](mail.md)) |
| Syncing on a timer (`memo auto`) | Linux with systemd. On macOS and Windows, run `memo sync` yourself or from your own scheduler ([keeping Memo up to date](archive.md)) |

## Install

**The easiest way: ask your agent.**

```text prompt
Install Memo with npm install -g @wirecat/cli-memo.
Check Node.js and npm first and help me set them up if needed.
Then run memo --version and memo --help and tell me if it works.
```

**Or install it yourself**, with one of:

```sh
npm install -g @wirecat/cli-memo
pnpm add -g @wirecat/cli-memo
bun add -g @wirecat/cli-memo
```

To try it without installing (Node.js still runs it):

```sh
npx @wirecat/cli-memo --help
pnpm dlx @wirecat/cli-memo --help
bunx @wirecat/cli-memo --help
```

Check that it works:

```sh
memo --version
memo --help            # the list of commands
memo commands --json   # every command and option, for agents and scripts
```

`memo --help` lists commands such as `notes`, `search`, `mail` and `sync`. If the install finished but the terminal
says `memo` is not found, open a new terminal: a terminal that was already open does not see a new command. If it is
still not found, the folder where your package manager puts commands is not on the PATH. `npm prefix -g` shows that
folder (on Linux and macOS the command is in its `bin` folder); add it to the PATH, or ask your agent to.

## First run

Memo has no login and no setup step. Add a folder of notes, read it, and search it:

```sh
memo folders add ~/Documents/Notes   # your notes folder; Obsidian format by default
memo sync --notes                    # reads the notes, their links and tags
memo search notes "budget"
```

Then [add more folders](notes.md#add-a-folder) or [connect a mail account](mail.md).

**Your agent's skill.** A global install with npm also puts Memo's skill where Claude Code
(`~/.claude/skills/cli-memo/`) and Codex or Gemini CLI (`~/.agents/skills/cli-memo/`) read it.
`MEMO_INSTALL_AGENT` chooses: `all` (the default), `claude`, `codex`, `cursor`, `gemini`, or `none` to skip it.
`npx` and a local install do not put the skill in place, and pnpm and Bun can skip install scripts. In those cases
run `memo skill install --for all` yourself (`--for claude` or `--for agents` for one). `memo skill show` prints it.

## Windows

Open PowerShell and use `npm.cmd`, because PowerShell can block the `npm` script:

```powershell
npm.cmd install -g @wirecat/cli-memo
memo --version
```

Then open a new terminal: npm cannot change the PATH of the terminal it runs in. The Node.js installer usually puts
npm's command folder on the PATH already; `npm.cmd prefix -g` shows which folder that is.

## From sources

You need this to change Memo's code, or to use a version that is not released yet.

```sh
git clone git@github.com:WireCatLabs/cli-memo.git
cd cli-memo
pnpm install
pnpm build
```

Then either put the command on the PATH:

```sh
pnpm link --global   # now plain `memo` works
```

or run it by its path, without linking:

```sh
node dist/bin/memo.js --help
```

## Where the files are

| What | Linux and macOS | Windows |
|---|---|---|
| Settings | `~/.config/cli-memo/` | `%APPDATA%\cli-memo\Config\` |
| State | `~/.local/share/cli-memo/` | `%LOCALAPPDATA%\cli-memo\Data\` |
| The local store, shared with tg and max | `~/.local/share/WireCat/wirecat.db` | `%LOCALAPPDATA%\WireCat\Data\wirecat.db` |
| Search models, downloaded by tg or max | `~/.local/share/WireCat/models/` | `%LOCALAPPDATA%\WireCat\Data\models\` |
| The timer, after `memo auto start` | `~/.config/systemd/user/memo-import.timer` and `.service` | — |

- **Settings**: `config.json` ([configuration](configuration.md)): your folders, mail accounts, mail rules and the
  timer.
- **State**: what this computer imported last from each folder (`folders/`), the lock that stops two syncs at once
  (`import.lock`), and how the last timer run ended (`auto/`).
- **The local store** holds your notes, mail, messages, tags, tasks and memories. Your note files and your mailbox
  stay where they are; the store holds a copy of their text.

`~` means your home folder. Environment variables move each place: `MEMO_CONFIG_DIR` (settings), `MEMO_STATE_DIR`
(state), `MESSAGING_STORE` (the store file itself) and `WIRECAT_STATE_DIR` (the WireCat folder: the store and the
models).

> ⚠ **Set these variables everywhere, or nowhere.** A command run without them reads other settings and another
> store, and says your folders or mail are not there. The timer does not carry them: it starts `memo sync` with the
> default places. tg and max read the same store only when they get the same `MESSAGING_STORE` or
> `WIRECAT_STATE_DIR`. The variables are meant for tests and throwaway profiles.

## Update

Memo does not update itself and has no update command. Install the latest version with the same package manager:

```sh
npm install -g @wirecat/cli-memo
memo --version
memo skill install --for all   # a global npm install does this for you; pnpm and Bun may not
```

- **The timer** runs the updated Memo on its next run; nothing to restart. If you change Node.js versions (for
  example with nvm), run `memo auto start` again: the timer keeps the path of the Node.js that set it up.
- **`memo mcp`** keeps running the old version until your agent restarts it. Restart the agent, or its MCP server.

From sources: `git pull && pnpm install && pnpm build`.

## Remove

Removing Memo takes away the command, not your data. Do it in this order:

```sh
memo auto stop                       # if you turned on the timer: removes it while memo still exists
npm uninstall -g @wirecat/cli-memo   # or pnpm remove -g, or bun remove -g
rm -rf ~/.claude/skills/cli-memo ~/.agents/skills/cli-memo   # the agent skill
rm -rf ~/.config/cli-memo ~/.local/share/cli-memo            # Memo's settings and state
```

The local store stays. tg and max use it too, and it holds your notes, mail, tags and memories. Delete
`~/.local/share/WireCat/` only if no other tool uses it: it holds everything each of them saved.

## Development

To work on Memo itself, build it [from sources](#from-sources), then run the checks:

```sh
pnpm lint && pnpm typecheck && pnpm test
```

## Next

[Add your notes](notes.md#add-a-folder), then [connect a mail account](mail.md).
