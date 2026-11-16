import type { ManifestIdentity } from "@wirecat/cli-base/wcat/manifest"
import { DESKTOP } from "./identity.js"

export const WCAT: ManifestIdentity = { ...DESKTOP, permissionOf: (path) => path.join(".") || null }
