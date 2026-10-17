import { type Command, InvalidArgumentError } from "commander"
import { ONE_ACCOUNT_HELP, sourceOptions, writeOptions } from "./store/source-list.js"

export const positive = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new InvalidArgumentError("a whole number above zero")
  return number
}

export const whole = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 100)
    throw new InvalidArgumentError("a whole number, 0 to 100")
  return number
}

export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: string): T => {
    if (!(values as readonly string[]).includes(value)) throw new InvalidArgumentError(`choose ${values.join(", ")}`)
    return value as T
  }

/** A repeatable option: `--subject a --subject b`. */
export const collect = (value: string, previous: string[] = []): string[] => [...previous, value]

/** A read's `--source`, naming one account, or several where `help` says so. */
export const readScope = (command: Command, help = ONE_ACCOUNT_HELP) =>
  sourceOptions(command, help).option("--json", "print JSON; --json=id,title keeps only those fields")

/** A write's `--account provider:account`. */
export const writeScope = (command: Command, help?: string) =>
  writeOptions(command, help).option("--json", "print JSON; --json=id,title keeps only those fields")
