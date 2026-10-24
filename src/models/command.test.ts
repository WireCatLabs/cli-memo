import { captureStreams } from "@wirecat/cli-base"
import { downloadTextModel } from "@wirecat/cli-core/services"
import { expect, it, vi } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

vi.mock("@wirecat/cli-core/services", async (original) => ({
  ...(await original<typeof import("@wirecat/cli-core/services")>()),
  downloadTextModel: vi.fn(),
}))

it("downloads through the shared service and keeps its receipt without connecting an account", async () => {
  const env = { ...process.env },
    streams = captureStreams()
  vi.mocked(downloadTextModel).mockResolvedValue({
    directory: "/synthetic/models",
    model: {
      id: "synthetic",
      title: "Synthetic",
      languages: "en",
      licence: "MIT",
      files: [],
      dims: 384,
      maxTokens: 512,
      chunksPerSecond: 10,
      pooling: "mean",
      prefix: { query: "", passage: "" },
      onnx: "model.onnx",
    },
  })
  await createProgram({ env, streams }).parseAsync(["models", "download", "synthetic", "--accept-terms", "--json"], {
    from: "user",
  })
  expect(downloadTextModel).toHaveBeenCalledWith("synthetic", expect.objectContaining({ env, acceptTerms: true }))
  expect(answerOf(streams.stdout.join(""))).toMatchObject({
    id: "synthetic",
    downloaded: true,
    path: "/synthetic/models/synthetic",
  })
})
