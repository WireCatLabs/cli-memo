import { CliError } from "@wirecat/cli-base"

export const COMMAND_MOVES: Readonly<Record<string, string>> = {
  "agents.log": "agents.list",
  auto: "jobs",
  ask: "answers.create",
  note: "notes.links",
  "folders.attach": "folders.update",
  "mail.trash": "mail.delete",
  "mail.rules.import-filters": "mail.rules.import",
  "memories.stale": "memories.invalidate",
  "relationships.suggest": "relationships.scan",
  "reminders.poll": "reminders.claim",
  "reminders.ack": "reminders.acknowledge",
  "tasks.relations": "tasks.links",
}

export const assertMemoPermissionPaths = (keys: Iterable<string>): void => {
  for (const key of keys)
    for (const [previous, next] of Object.entries(COMMAND_MOVES))
      if (key === previous || key.startsWith(`${previous}.`))
        throw new CliError(
          "configuration_error",
          `permission ${key} moved to ${next}${key.slice(previous.length)}; rename the saved key before running Memo`,
        )
}
