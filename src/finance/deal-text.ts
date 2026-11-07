import type { DealBrief, DealContext } from "@wirecat/cli-core/services"
import { coverageLines, relatedLine, sectionLines } from "../knowledge/business-text.js"
import { moneyLines } from "../knowledge/money-text.js"

const amountOf = (amount: string | null, currency: string | null) => [amount, currency].filter(Boolean).join(" ")

export const dealText = (context: DealContext): string => {
  const { deal, organization, owner, project, window, communications } = context
  return [
    `${deal.title}  ${deal.ref}  ${deal.stage}  ${deal.status}  ${amountOf(deal.amount, deal.currency)}`,
    `Client   ${organization ? `${organization.name ?? organization.ref}  ${organization.ref}` : "none"}`,
    `Owner    ${owner ? relatedLine(owner).trim() : "none"}`,
    `Project  ${project ? `${project.name ?? project.ref}  ${project.ref}` : "none"}`,
    ...sectionLines("Stages", context.stages, (one) => `  ${one.at.slice(0, 10)}  ${one.from ?? "—"} → ${one.to}`),
    ...sectionLines("People", context.participants),
    ...moneyLines(context.money),
    `Between ${window.since.slice(0, 10)} and ${window.until.slice(0, 10)}, proposed: they share people, nothing links them`,
    ...sectionLines(
      "Messages, mail and meetings",
      communications,
      (one) => `  ${one.at?.slice(0, 16).replace("T", " ") ?? "—"}  ${one.kind}  ${one.title ?? ""}  ${one.ref}`,
    ),
    ...sectionLines("Open tasks", context.tasks, (one) => `  ${one.key}  ${one.title}  ${one.status}`),
    ...coverageLines(context.coverage),
  ]
    .map((line) => line.trimEnd())
    .join("\n")
}

export const dealBriefText = (brief: DealBrief): string =>
  [
    `${brief.title}  ${brief.ref}  ${brief.pipeline}/${brief.stage}  ${brief.status}  ${amountOf(brief.amount, brief.currency)}`,
    `client ${brief.organization ?? "none"}; owner ${brief.owner ?? "none"}; project ${brief.project ?? "none"}`,
    ...brief.people.map((one) => `  ${one.name ?? one.ref}  ${one.ref}  ${one.roles.join(", ")}  ${one.standing}`),
    ...(brief.stages.length ? [`stages ${brief.stages.join("; ")}`] : []),
    `invoiced ${brief.money.invoices.map((one) => `${one.status} ${one.total} ${one.currency}`).join(", ") || "none"}; ` +
      `paid ${brief.money.payments.map((one) => `${one.total} ${one.currency}`).join(", ") || "none"}`,
    `${brief.communications.messages} messages, ${brief.communications.mail} emails, ${brief.communications.meetings} meetings (proposed); ${brief.openTasks} open tasks`,
    ...brief.notRead.map(({ source, reason }) => `not read: ${source} — ${reason}`),
  ]
    .map((line) => line.trimEnd())
    .join("\n")
