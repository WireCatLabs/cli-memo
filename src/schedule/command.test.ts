import { expect, it } from "vitest"
import { scheduleCommand } from "./command.js"

it("lets the scheduled agent run mail too, each under its own read-only lock", () => {
  const agent = scheduleCommand({}).commands.find((command) => command.name() === "agent")
  expect(agent?.description()).toContain("MEMO_READ_ONLY=1 and MAIL_READ_ONLY=1")
})
