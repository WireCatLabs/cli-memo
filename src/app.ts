import { REASONS } from "./reasons.js"
import { VERSION } from "./version.js"

/** How memo names itself to the shared services: in their hints, their files and its errors. */
export const APP = {
  command: "memo",
  appName: "cli-memo",
  envPrefix: "MEMO",
  description: "Context about people across messengers, notes and mail",
  messenger: false,
  version: VERSION,
  errors: { reasons: REASONS },
}

/** What Core records about each CLI that opens the shared store, so an upgrade can name memo. */
export const STORE_CLIENT = { command: APP.command, version: APP.version }
