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

- **Node.js 22.16+ (the 22.x line) or 24+**, with npm. Node.js 23 is not supported. If you do not have it, ask your
  agent to help, or get it from [nodejs.org](https://nodejs.org). The command also runs under **Bun**; CI runs the
  built command under Bun too.
- Linux. macOS and Windows are not tested yet: memo's tests run on Linux only.
- About 250 MB of disk for the install. Most of it is shared WireCat code that memo does not use yet: charts, speech
  recognition and audio decoders.

Each source needs one more thing, and only when you use it:

| Source | What it needs |
|---|---|
| Notes and documents | Nothing: [files Memo can read](notes.md#files-memo-can-read) |
| Telegram or MAX messages | [tg](https://github.com/WireCatLabs/tg-cli) or [max](https://github.com/WireCatLabs/max-cli). They save your chats in the local store; Memo does not log in to a messenger |
| Search by meaning | A search model on your computer, about 135 MB. tg or max downloads it once: `npx -y @wirecat/tg-cli local models text download e5-small`. Without it, Memo searches by words |
| Mail | [Himalaya](https://github.com/pimalaya/himalaya) 2.x, the mail program Memo uses to read a mailbox. It reads its accounts from `~/.config/himalaya/config.toml` ([mail](mail.md#before-you-start)) |
| Syncing on a timer (`memo auto`) | Linux with systemd. On macOS and Windows, run `memo sync` yourself or from your own scheduler ([keeping Memo up to date](archive.md)) |

## Install

**The easiest way: ask your agent.**

```text prompt
Install Memo with npm install -g @wirecat/cli-memo, then run memo skill install --for all.
Check Node.js and npm first and help me set them up if needed.
Then run memo --version and memo --help and tell me if it works.
```

**Or install it yourself:**

```sh
npm install -g @wirecat/cli-memo
memo skill install --for all     # puts Memo's skill where your agents read it
```

npm 12 prints "install scripts blocked": that is harmless, `memo skill install` does what the script would. On
Windows, open a new terminal if `memo` is not found. With pnpm or Bun, `pnpm add -g @wirecat/cli-memo` or
`bun add -g @wirecat/cli-memo`, then the same `memo skill install --for all`.

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
memo doctor            # where Memo keeps its files and what needs attention; connects to nothing
memo commands --json   # every command and option, for agents and scripts
```

`memo doctor` lists the settings file, the store, your notes folders, the mail accounts and Himalaya, the search
model, the timer and the agent skill. Each problem comes with the command that fixes it, and the command exits 1
while something needs attention. `memo doctor --json` gives the same for an agent.

`memo --help` lists commands such as `notes`, `search`, `mail` and `sync`. If the install finished but the terminal
says `memo` is not found, open a new terminal: a terminal that was already open does not see a new command. If it is
still not found, the folder where your package manager puts commands is not on the PATH. `npm prefix -g` shows that
folder (on Linux and macOS the command is in its `bin` folder); add it to the PATH, or ask your agent to.

## First run

Memo has no login and no setup step. Add a folder of notes, read it, and search it:

```sh
memo folders add ~/Documents/Notes   # your notes folder; Obsidian format by default
memo sync --only notes                    # reads the notes, their links and tags
memo search notes "budget"
```

Then [add more folders](notes.md#add-a-folder) or [connect a mail account](mail.md).

**Your agent's skill.** `memo skill install --for all` puts Memo's skill where Claude Code
(`~/.claude/skills/cli-memo/`) and Codex or Gemini CLI (`~/.agents/skills/cli-memo/`) read it; `--for claude` or
`--for agents` installs it for one. `memo skill show` prints it. A global npm install does the same only when
`MEMO_INSTALL_AGENT` names where: `all`, `claude`, `codex`, `cursor` or `gemini`; unset or `none`, it installs no skill.

## Windows

Windows is not tested yet; these steps are what should work. Open PowerShell and use `npm.cmd`, because PowerShell can block the `npm` script:

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
| Cache, which `memo doctor` names; Memo keeps nothing there yet | `~/.cache/cli-memo/` | `%LOCALAPPDATA%\cli-memo\Cache\` |
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
(state), `MEMO_CACHE_DIR` (cache), `MESSAGING_STORE` (the store file itself) and `WIRECAT_STATE_DIR` (the WireCat
folder: the store and the models).

The task commands also read `~/.config/cli-memo-tasks/config.json` (`MEMO_TASKS_CONFIG_DIR` moves it) when it exists.
Memo never writes it, and you do not need it. The timer runs `memo sync` with `MEMO_AUTO=1`, which marks a timer run:
it skips the update check and, when the timer is off in the settings, does nothing.

> ⚠ **Set these variables everywhere, or nowhere.** A command run without them reads other settings and another
> store, and says your folders or mail are not there. The timer keeps the ones set when you ran `memo auto start`;
> run it again after you change them. tg and max read the same store only when they get the same `MESSAGING_STORE`
> or `WIRECAT_STATE_DIR`. The variables are meant for tests and throwaway profiles.

## Update

```sh
memo upgrade --check           # only say whether a newer version exists; installs nothing
memo upgrade                   # update with the package manager that installed Memo: npm, pnpm or Bun
memo skill install --for all   # the skill of the new version
```

Once a day Memo asks npm whether a newer version exists and, if so, prints one line after a command, on stderr. Only
a person at a terminal sees it: not with `--json`, not in a pipe, not on the timer's runs. Turn it off with
`"update_check": false` in the settings, or `MEMO_NO_UPDATE_CHECK=1`. Memo never updates itself.

- **The timer** runs the updated Memo on its next run; nothing to restart. After you change Node.js versions (for
  example with nvm) and install Memo there, the next `memo` command you run points the timer at that Memo, so
  removing the old Node.js does not break it. Only a global install moves the timer: a Memo run from a checkout, with `npx` or from another
  tool's own `node_modules` leaves it alone.
- **`memo mcp`** keeps running the old version until your agent restarts it. Restart the agent, or its MCP server.

From sources: `git pull && pnpm install && pnpm build`.

## Remove

Removing Memo takes away the command, not your data. Do it in this order:

```sh
memo auto stop                       # if you turned on the timer: removes it while memo still exists
npm uninstall -g @wirecat/cli-memo   # or pnpm remove -g, or bun remove -g
rm -rf ~/.claude/skills/cli-memo ~/.agents/skills/cli-memo   # the agent skill
rm -rf ~/.config/cli-memo ~/.local/share/cli-memo ~/.cache/cli-memo   # Memo's settings, state and cache
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
