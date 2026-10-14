import { expect, it } from "vitest"
import { modelHint } from "./embed.js"

it("names the CLIs that download the model, never a tg command as memo's own", () => {
  expect(modelHint("e5-small is not downloaded — `tg models text download e5-small`")).toBe(
    "the e5-small model is not downloaded — tg or max downloads it: tg models text download e5-small",
  )
  expect(modelHint("--exact searches words as written")).toBe("--exact searches words as written")
})
