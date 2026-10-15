const BRIEF = ["ref", "chat_title", "timestamp", "sender_name", "excerpt", "score"]

/** `--brief`: the reference, when, who and the excerpt. */
export const briefHit = (hit: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(BRIEF.flatMap((key) => (hit[key] === undefined || hit[key] === null ? [] : [[key, hit[key]]])))
