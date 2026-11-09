import type { OrganizationContext } from "@wirecat/cli-core/services"
import type { NotesAbout } from "../notes/about.js"
import { coverageLines, sectionLines } from "./business-text.js"
import { moneyLines } from "./money-text.js"

export const organizationText = (answer: OrganizationContext & { notes: NotesAbout; tags: string[] }): string => {
  const { organization, categories, communications } = answer
  return [
    `${organization.name}  ${organization.ref}${organization.own ? "  (your own)" : ""}`,
    ...(categories.length ? [`Categories  ${categories.join(", ")}`] : []),
    ...(answer.tags.length ? [`Tags  ${answer.tags.join(", ")}`] : []),
    ...sectionLines("People", answer.people),
    ...sectionLines("Customers", answer.customers),
    ...sectionLines("Suppliers", answer.suppliers),
    ...sectionLines("Partners", answer.partners),
    ...sectionLines("Projects", answer.projects, (one) => `  ${one.name}  ${one.ref}  via ${one.via.join(", ")}`),
    ...sectionLines(
      "Open deals and leads",
      answer.deals,
      (one) => `  ${one.title}  ${one.ref}  ${one.stage}  ${[one.amount, one.currency].filter(Boolean).join(" ")}`,
    ),
    ...moneyLines(answer.money),
    `Written by its people  ${communications.messages} messages, ${communications.mail} emails, ${communications.meetings} meetings`,
    ...sectionLines("Open tasks", answer.tasks, (one) => `  ${one.key}  ${one.title}  ${one.status}`),
    ...(answer.notes.about.length ? ["Notes about it", ...answer.notes.about.map((note) => `  ${note.ref}`)] : []),
    ...coverageLines(answer.coverage),
  ]
    .map((line) => line.trimEnd())
    .join("\n")
}
