import { defineReasons, type ErrorReason } from "@wirecat/cli-base/standards"

/** The reasons memo raises itself; cli-base's and cli-core's are merged in by `failureContext`. */
export const REASONS: ErrorReason[] = defineReasons([
  {
    reason: "sync.running",
    code: "rate_limited",
    message: "another memo sync is running (process {pid}); try again when it ends",
    details: ["pid"],
  },
])
