// cli-core's parseVtt reads Zoom's files strictly: it refuses SRT, keeps tags and entities, and splits `Name: `
// before a voice tag. Exports from other apps need this more tolerant reading.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lrm: "‎",
  rlm: "‏",
}

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? entity
    const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })

const VOICE = /<v(?:\.[^\s>]+)*\s+([^>]+)>/
const LEADING_NAME = /^([^:\n]{1,60}):\s+/

const turnOf = (cue: string) => {
  const voice = VOICE.exec(cue)?.[1]?.trim()
  const text = decode(
    cue
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
  if (voice) return { speaker: decode(voice), text }
  const named = LEADING_NAME.exec(text)
  return named ? { speaker: named[1]?.trim() ?? null, text: text.slice(named[0].length) } : { speaker: null, text }
}

/** A WebVTT or SubRip file as `Name: text` lines, one per turn, without its timings. */
export const transcriptText = (input: string) => {
  const turns: { speaker: string | null; text: string }[] = []
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  for (const block of normalized.split(/\n[ \t]*\n\s*/)) {
    const lines = block.split("\n")
    const timing = lines.findIndex((line) => line.includes("-->"))
    if (timing < 0) continue
    const turn = turnOf(lines.slice(timing + 1).join("\n"))
    if (!turn.text) continue
    const last = turns.at(-1)
    if (last && turn.speaker !== null && last.speaker === turn.speaker) last.text += ` ${turn.text}`
    else turns.push(turn)
  }
  return turns.map(({ speaker, text }) => (speaker ? `${speaker}: ${text}` : text)).join("\n")
}
