import { type Command, InvalidArgumentError } from "commander"

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

/** A repeatable option: `--about a --about b`. */
export const collect = (value: string, previous: string[] = []): string[] => [...previous, value]

export const accountOptions = (command: Command) =>
  command
    .option("--provider <provider>", "source provider")
    .option("--account <account>", "exact stored account")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
