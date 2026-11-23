import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { OrganizationErasure } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { byOption } from "../author.js"
import { asOwner } from "../people/proposal-rows.js"

const counts = (rows: Record<string, number>) =>
  Object.entries(rows)
    .map(([where, n]) => `${n} ${where}`)
    .join(", ")

const planText = (plan: OrganizationErasure) =>
  [
    `${plan.erased ? "deleted" : "this deletes"} ${plan.organization} (${plan.name})`,
    ...(plan.identities.length ? [`  identities it held: ${plan.identities.join(", ")}`] : []),
    ...(Object.keys(plan.deleted).length ? [`  deleted with it: ${counts(plan.deleted)}`] : []),
    ...(Object.keys(plan.detached).length ? [`  stay, without the organization: ${counts(plan.detached)}`] : []),
  ].join("\n")

export const organizationDeleteCommand = (
  organizations: Command,
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { print } = answers(program, streams, env)
  byOption(
    annotate(organizations.command("delete"), {
      effects: LOCAL_WRITE,
      output: { entity: "organization_erasure" },
      examples: ["memo organizations delete organization:12", "memo organizations delete organization:12 --yes"],
    })
      .summary("delete an organization and what memo knows of it alone; only you")
      .description(
        "delete an organization, your notes about it, the tags, links, aliases and mentions that name it, and which " +
          "identities it held. A deal, lead, project, account or fact that names it stays and loses the name; a note " +
          "that only links to it stays. One of your own " +
          "companies is never deleted, and an invoice, order or subscription that names it must be changed first. " +
          "Without --yes it shows what would go and changes nothing",
      )
      .argument("<organization>", "its id or organization:<id>, as organizations list prints it")
      .option("--yes", "delete; nothing of the organization can be brought back"),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { yes?: boolean; json?: boolean }, command: Command) => {
      const organization = `organization:${reference.replace(/^organization:/, "")}`
      const by = await asOwner(command, env, `delete ${organization}?`)
      const plan = await withStore(env, (store) =>
        store.knowledge.eraseOrganization(organization, by, { apply: options.yes === true }),
      )
      if (!plan.erased)
        throw new CliError("confirmation_required", `${planText(plan)}\nnothing was changed — add --yes`, {
          reason: "organization.delete-confirm",
          plan,
        })
      print(options.json, itemAnswer(plan), planText(plan))
    })
}
