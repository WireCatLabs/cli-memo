# Installation

Install wcat in a few minutes and check that it runs. Installing logs in nowhere, starts no background service and
reads none of your notes or mail. wcat reads a folder only after you add it and run `wcat sync`, and syncing on a
timer is a separate step that you turn on with `wcat jobs start`.

You need Node.js, the program that runs wcat, on Linux. npm downloads the package **`@wirecat/wirecat`** and puts
the **`wcat`** command on your computer. A skill, a short set of instructions, then tells your AI agent how to use
wcat. wcat keeps text in the local store, one database file on your computer that it shares with
[tg](https://github.com/WireCatLabs/tg-cli), [max](https://github.com/WireCatLabs/max-cli) and the other WireCat
tools.

**On this page:**

1. What it needs
2. Install
3. First run
4. Windows
5. From sources
6. Where the files are
7. Update
8. Remove
9. Development
10. Next

## What it needs

- **Node.js 22.16+ (the 22.x line) or 24+**, with npm. Node.js 23 is not supported. If you do not have it, ask your
  agent to help, or get it from [nodejs.org](https://nodejs.org). The command also runs under **Bun**.
- Linux. macOS and Windows are not tested yet.
- About 250 MB of disk for the install. Most of it is shared WireCat code: charts, speech recognition and audio
  decoders.

Each source needs one more thing, and only when you use it:

| Source | What it needs |
|---|---|
| Notes and documents | Nothing: [files wcat can read](https://wirecat.dev/en/docs/files) |
| Telegram or MAX messages | [tg](https://github.com/WireCatLabs/tg-cli) or [max](https://github.com/WireCatLabs/max-cli). They save your chats in the local store; wcat does not log in to a messenger |
| Search by meaning | A search model on your computer, about 220 MB. Download it once: `wcat models download embeddinggemma`. Without it, wcat searches by words |
| Mail | The [mail](https://github.com/WireCatLabs/mail-cli) CLI. It copies your mailbox into the local store, and wcat searches it ([mail](mail.md#bring-mail-in-with-mail)). |
| Syncing on a timer (`wcat jobs`) | Linux with systemd. On macOS and Windows, run `wcat sync` yourself or from your own scheduler ([keep your notes current](archive.md)) |

## Install

**The easiest way: ask your agent.**

```text prompt
Install wcat with npm install -g @wirecat/wirecat, then run wcat skill install --for all.
Check Node.js and npm first and help me set them up if needed.
Then run wcat --version and wcat --help and tell me if it works.
```

**Or install it yourself:**

```sh
npm install -g @wirecat/wirecat
wcat skill install --for all     # puts wcat's skill where your agents read it
```

npm 11.17 and later warn about install scripts not covered by `allowScripts`; with npm 11 the scripts still run.
npm 12 blocks them instead. Run the `npm install -g --allow-scripts=…` command npm prints under the warning;
it allows only the packages it names, once. Then run `wcat skill install --for all` to install the agent skill.
On Windows, open a new terminal if `wcat` is not found. With pnpm or Bun, `pnpm add -g @wirecat/wirecat` or
`bun add -g @wirecat/wirecat`, then the same `wcat skill install --for all`.

To try it without installing (Node.js still runs it):

```sh
npx @wirecat/wirecat --help
pnpm dlx @wirecat/wirecat --help
bunx @wirecat/wirecat --help
```

Check that it works:

```sh
wcat --version
wcat --help            # the list of commands
wcat doctor            # the state this installation is in; --online also asks npm for a newer wcat
wcat commands --json   # every command and option, for agents and scripts
```

`wcat doctor` lists the settings file, the store, your notes folders, the search
model, the timer and the agent skill. Each problem comes with the command that fixes it, and the command exits 1
while something needs attention. Problems in the settings file are listed too, in `config.issues` of
`wcat doctor --json`, the same shape every WireCat tool's doctor uses. The settings file, its folder, the store and
the run log folder are checked for other users being able to read them; any that can are listed in `files.problems`
with the mode they have and the one they should have, and the `chmod` that fixes each is printed. Neither settings
problems nor open files change the exit code from 0, so the report still reads as an answer. `wcat doctor --json`
gives the same for an agent.

`wcat --help` lists commands such as `notes`, `search`, `mail` and `sync`. If the install finished but the terminal
says `wcat` is not found, open a new terminal: a terminal that was already open does not see a new command. If it is
still not found, the folder where your package manager puts commands is not on the PATH. `npm prefix -g` shows that
folder (on Linux and macOS the command is in its `bin` folder); add it to the PATH, or ask your agent to.

## First run

wcat has no login and no setup step. Add a folder of notes, read it, and search it:

```sh
files folders add ~/Documents/Notes   # your notes folder; Obsidian format when it is a vault
wcat sync --only notes                    # reads the notes, their links and tags
wcat search notes "budget"
```

Then [add more folders](https://wirecat.dev/en/docs/files). Your chats come in through their own tools: set up
[tg](https://github.com/WireCatLabs/tg-cli), [max](https://github.com/WireCatLabs/max-cli) or wa for Telegram, MAX or
WhatsApp, and [mail](mail.md) for email. wcat searches them as soon as they are saved.

**Your agent's skill.** `wcat skill install --for all` puts wcat's skill where Claude Code
(`~/.claude/skills/wcat/`) and Codex or Gemini CLI (`~/.agents/skills/wcat/`) read it; `--for claude` or
`--for agents` installs it for one. `wcat skill show` prints it. A global npm install does the same only when
`WCAT_INSTALL_AGENT` names where: `all`, `claude`, `codex`, `cursor` or `gemini`; unset or `none`, it installs no skill.

## Windows

Windows is not tested yet. Open PowerShell and use `npm.cmd`, because PowerShell can block the `npm` script:

```powershell
npm.cmd install -g @wirecat/wirecat
wcat --version
```

Then open a new terminal: npm cannot change the PATH of the terminal it runs in. The Node.js installer usually puts
npm's command folder on the PATH already; `npm.cmd prefix -g` shows which folder that is.

## From sources

You need this to change wcat's code, or to use a version that is not released yet.

```sh
git clone git@github.com:WireCatLabs/wirecat.git
cd wirecat
pnpm install
pnpm build
```

Then either put the command on the PATH:

```sh
pnpm link --global   # now plain `wcat` works
```

or run it by its path, without linking:

```sh
node dist/bin/wcat-wirecat.js --help
```

## Where the files are

| What | Linux and macOS | Windows |
|---|---|---|
| Settings | `~/.config/wcat/` | `%APPDATA%\wcat\Config\` |
| State | `~/.local/share/wcat/` | `%LOCALAPPDATA%\wcat\Data\` |
| Cache, which `wcat doctor` names; wcat keeps nothing there yet | `~/.cache/wcat/` | `%LOCALAPPDATA%\wcat\Cache\` |
| The local store, shared with tg and max | `~/.local/share/WireCat/wirecat.db` | `%LOCALAPPDATA%\WireCat\Data\wirecat.db` |
| Shared search models | `~/.local/share/WireCat/models/` | `%LOCALAPPDATA%\WireCat\Data\models\` |
| The timer, after `wcat jobs start` | `~/.config/systemd/user/wcat-import.timer` and `.service` | — |

- **Settings**: `config.json` ([configuration](configuration.md)): the timer and the permissions.
- **State**: the lock that stops two syncs at once (`import.lock`), and how the last timer run ended (`auto/`).
- **The local store** holds your notes, mail, messages, tags, tasks and memories. Your note files and your mailbox
  stay where they are; the store holds a copy of their text.

The first start of wcat moves memo's folders (`cli-memo`), its keyring entries, its timers and its agent skill to
these names, once. A folder wcat already holds files in is never merged: memo's stays, and wcat says so.

`~` means your home folder. Environment variables move each place: `WCAT_CONFIG_DIR` (settings), `WCAT_STATE_DIR`
(state), `WCAT_CACHE_DIR` (cache), `MESSAGING_STORE` (the store file itself) and `WIRECAT_STATE_DIR` (the WireCat
folder: the store and the models).

The task commands also read `~/.config/wcat-tasks/config.json` (`WCAT_TASKS_CONFIG_DIR` moves it) when it exists.
wcat never writes it, and you do not need it. The timer runs `wcat sync` with `WCAT_AUTO=1`, which marks a timer run:
it skips the update check and, when the timer is off in the settings, does nothing.

> ⚠ **Set these variables everywhere, or nowhere.** A command run without them reads other settings and another
> store, and says your folders or mail are not there. The timer keeps the ones set when you ran `wcat jobs start`;
> run it again after you change them. tg and max read the same store only when they get the same `MESSAGING_STORE`
> or `WIRECAT_STATE_DIR`.

<a id="update-and-remove" />

## Update

```sh
wcat upgrade --check           # only say whether a newer version exists; installs nothing
wcat upgrade                   # update with the package manager that installed wcat: npm, pnpm or Bun
wcat skill install --for all   # the skill of the new version
```

Once a day wcat asks npm whether a newer version exists and, if so, prints one line after a command, on stderr. Only
a person at a terminal sees it: not with `--json`, not in a pipe, not on the timer's runs. Turn it off with
`"update_check": false` in the settings, or `WCAT_NO_UPDATE_CHECK=1`. wcat never updates itself.

- **The timer** runs the updated wcat on its next run; nothing to restart. After you change Node.js versions (for
  example with nvm) and install wcat there, the next `wcat` command you run points the timer at that wcat, so
  removing the old Node.js does not break it. Only a global install moves the timer: a wcat run from a checkout, with `npx` or from another
  tool's own `node_modules` leaves it alone.
- **`wcat mcp serve`** keeps running the old version until your agent restarts it. Restart the agent, or its MCP server.

From sources: `git pull && pnpm install && pnpm build`.

## Remove

Removing wcat takes away the command, not your data. Do it in this order:

```sh
wcat jobs stop                       # if you turned on the timer: removes it while wcat still exists
npm uninstall -g @wirecat/wirecat   # or pnpm remove -g, or bun remove -g
rm -rf ~/.claude/skills/wcat ~/.agents/skills/wcat   # the agent skill
rm -rf ~/.config/wcat ~/.local/share/wcat ~/.cache/wcat   # wcat's settings, state and cache
```

The local store stays. tg and max use it too, and it holds your notes, mail, tags and memories. Delete
`~/.local/share/WireCat/` only if no other tool uses it: it holds everything each of them saved.

## Development

To work on wcat itself, build it [from sources](#from-sources), then run the checks:

```sh
pnpm lint && pnpm typecheck && pnpm test
```

## Next

[Add your notes](https://wirecat.dev/en/docs/files), then [connect a mail account](mail.md).
