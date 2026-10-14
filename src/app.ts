import { REASONS } from "./reasons.js"
import { VERSION } from "./version.js"

/** How memo names itself to the shared services: in their hints, their files and its errors. */
export const APP = {
  command: "memo",
  appName: "cli-memo",
  envPrefix: "MEMO",
  description: "Context about people across messengers, notes and mail",
  version: VERSION,
  errors: { reasons: REASONS },
}
