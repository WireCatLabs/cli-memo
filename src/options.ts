import { type Command, InvalidArgumentError } from "commander"

export const positive = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new InvalidArgumentError("a whole number above zero")
  return number
}

export const accountOptions = (command: Command) =>
  command
    .option("--provider <provider>", "source provider")
    .option("--account <account>", "exact stored account")
    .option("--json", "print JSON")
