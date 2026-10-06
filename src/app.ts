import { VERSION } from "./version.js"

/** How memo names itself to the shared services: in their hints and their files. */
export const APP = {
  command: "memo",
  appName: "cli-memo",
  envPrefix: "MEMO",
  description: "Context about people across messengers, notes and mail",
  version: VERSION,
}
