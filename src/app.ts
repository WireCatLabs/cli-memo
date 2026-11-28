import { REASONS } from "./reasons.js"
import { VERSION } from "./version.js"

/** How wcat names itself to the shared services: in their hints, their files and its errors. */
export const APP = {
  command: "wcat",
  appName: "wcat",
  envPrefix: "WCAT",
  description: "Local context for AI agents across messengers, mail and notes",
  messenger: false,
  version: VERSION,
  errors: { reasons: REASONS },
}

/** What Core records about each CLI that opens the shared store, so an upgrade can name wcat. */
export const STORE_CLIENT = { command: APP.command, version: APP.version }
