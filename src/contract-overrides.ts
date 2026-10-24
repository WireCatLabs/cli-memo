import { commands } from "./contract-overrides/commands.js"
import { doctor } from "./contract-overrides/doctor.js"
import { mcp } from "./contract-overrides/mcp.js"
import { meetings } from "./contract-overrides/meetings.js"
import { notes } from "./contract-overrides/notes.js"
import { search } from "./contract-overrides/search.js"
import { skill } from "./contract-overrides/skill.js"

export const SHELL_OVERRIDES = { search, doctor, skill, mcp, commands, notes, meetings }
