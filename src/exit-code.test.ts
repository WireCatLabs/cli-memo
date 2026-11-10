import { Command } from "commander"
import { expect, it } from "vitest"
import { keepExitCode, setExitCode } from "./exit-code.js"

it("gives the exit code to the run's own setter, leaving the process's one alone", () => {
  const codes: number[] = []
  const program = new Command("memo")
  const doctor = program.command("doctor")
  keepExitCode(program, (code) => codes.push(code))
  const before = process.exitCode
  setExitCode(doctor, 1)
  expect(codes).toEqual([1])
  expect(process.exitCode).toBe(before)
})
