import type { readMeetingPreparation } from "@wirecat/cli-core/cli"

type Preparation = Awaited<ReturnType<typeof readMeetingPreparation>>["item"]

export const preparationText = (item: Preparation): string => {
  const lines = [
    `${item.series?.title ?? item.upcoming.meeting_id} — stored meeting preparation`,
    "Next meeting: unverified; no provider calendar was read.",
    `History: ${item.history_window.after} to ${item.history_window.before} (exclusive)`,
    `Archive completeness: ${item.coverage.archive_completeness}`,
  ]
  for (const entry of [...item.meetings, ...item.related.items]) {
    lines.push("", `${entry.ref}  ${entry.meeting.started_at ?? "undated"}  ${entry.meeting.title ?? "untitled"}`)
    for (const cue of entry.evidence.items)
      lines.push(`  ${cue.ref}  ${cue.speaker_name ?? "unknown speaker"}: ${cue.text}`)
    if (entry.evidence.coverage.has_more) lines.push("  More transcript evidence available; use --json for references.")
  }
  if (!item.meetings.length) lines.push("No stored occurrences found in this series and history window.")
  for (const fact of item.knowledge?.items ?? []) lines.push(`Fact ${fact.ref}: ${fact.statement}`)
  for (const note of item.notes?.items ?? []) lines.push(`Note ${note.ref}: ${note.text}`)
  if (item.project_evidence)
    lines.push(`Project word evidence: ${item.project_evidence.project}; use --json to inspect candidates.`)
  if (item.communications) {
    lines.push("", `Communications: literal words “${item.communications.coverage.query}”`)
    for (const source of item.communications.coverage.sources) {
      lines.push(
        `  ${source.selection_id}: ${source.state}; index ${source.index}; completeness ${source.completeness}`,
      )
      if (source.has_more) lines.push("  More matches available; use --json for the source cursor.")
      if (source.restart_required) lines.push("  Some matches were omitted; restart with a larger output budget.")
    }
    for (const excerpt of item.communications.items) lines.push(`${excerpt.ref}  ${excerpt.at}: ${excerpt.text}`)
  } else lines.push("Communications: not queried; select --context-source and --context-query to include them.")
  if (item.coverage.history_has_more) lines.push("More series history available; raise --meetings.")
  if (item.coverage.output_limited) lines.push("Output limited; raise --bytes to include more evidence.")
  lines.push("Use --json for linked people, projects, facts, notes, tasks and full coverage.")
  return lines.join("\n")
}
