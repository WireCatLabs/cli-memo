// Runs a dev command (`cli-dev lint` runs the built bin) with a home of its own: on 2026-11-28 a lint run with the
// developer's home moved the owner's memo folders and timers. Usage: node scripts/sandboxed.ts <command> [args…]
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error("usage: node scripts/sandboxed.ts <command> [args…]")
const home = mkdtempSync(join(tmpdir(), "wcat-dev-home-"))
const ran = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: join(home, "cache"),
    WCAT_CONFIG_DIR: join(home, "wcat", "config"),
    WCAT_STATE_DIR: join(home, "wcat", "state"),
    WCAT_CACHE_DIR: join(home, "wcat", "cache"),
    WCAT_NO_UPDATE_CHECK: "1",
    MESSAGING_STORE: join(home, "store.db"),
    DBUS_SESSION_BUS_ADDRESS: "disabled:",
  },
})
process.exitCode = ran.status ?? 1
