import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

it("lists shared text models without an account and refuses offline downloads", async () => {
  const streams = captureStreams()
  await createProgram({ env: {}, streams }).parseAsync(["models", "list", "kind:text", "id:e5-small", "--json"], {
    from: "user",
  })
  expect(JSON.parse(streams.stdout.join("")).items).toEqual([
    expect.objectContaining({ id: "e5-small", kind: "text", downloaded: false }),
  ])
  await expect(
    createProgram({ env: {}, streams }).parseAsync(["models", "download", "e5-small", "--offline"], { from: "user" }),
  ).rejects.toThrow("--offline")
})
