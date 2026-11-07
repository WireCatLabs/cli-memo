import type { Coverage, Related, Section } from "@wirecat/cli-core/services"

/** One related entity with every role it holds and how sure each is: `reported` is a CRM's word only. */
export const relatedLine = ({ ref, name, roles }: Related): string =>
  `  ${name ?? ref}  ${ref}  ${roles
    .map((role) =>
      [role.kind, role.role, role.position && `(${role.position})`, role.standing, role.account && `by ${role.account}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("; ")}`

/** A section's first items, and the command that lists the rest when it was cut. */
export const sectionLines = <T>(
  title: string,
  section: Section<T>,
  line: (item: T) => string = relatedLine as (item: T) => string,
): string[] =>
  section.items.length === 0
    ? []
    : [
        title,
        ...section.items.map(line),
        ...(section.hasMore ? [`  ${section.total} in all${section.next ? ` — memo ${section.next}` : ""}`] : []),
      ]

export const coverageLines = (coverage: Coverage): string[] => [
  `Read: ${coverage.accounts.join(", ") || "no account"}`,
  ...coverage.notRead.map(({ source, reason }) => `Not read: ${source} — ${reason}`),
]
