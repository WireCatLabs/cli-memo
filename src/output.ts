import { resolveOutput } from "@wirecat/cli-core"
import { snakeKeysKeeping } from "@wirecat/cli-core/cli"

/** Every key snake_case, except under a note's front matter or an email's headers: the owner's or a provider's words. */
export const snakeKeys = snakeKeysKeeping(["front_matter", "metadata", "headers"])

/**
 * Found messages cut to cli-core's detail level, which picks a hit's fields by their camelCase names — so before
 * `snakeKeys`. cli-core exports the cut only inside its JSON renderer.
 */
export const atDetail = <T>(value: T, level?: "brief" | "default" | "full"): T => {
  let picked = ""
  resolveOutput({
    json: true,
    streams: { data: (chunk: string) => (picked += chunk), diagnostic: () => undefined, progress: () => undefined },
    ...(level === undefined ? {} : { hitDetail: level }),
  }).renderer.result(value)
  return JSON.parse(picked) as T
}
