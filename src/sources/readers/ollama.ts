import { CliError } from "@wirecat/cli-base"
import type { Reader } from "./types.js"

/** Only the Ollama on this computer: a remote one would be a way to send the text off it. */
const OLLAMA = "http://127.0.0.1:11434"

const notRunning = () =>
  new CliError("provider_unavailable", "Ollama is not running on this computer: start it with ollama serve", {
    reason: "reader.not-running",
  })

export const ollama: Reader = {
  id: "ollama",
  title: "Ollama",
  provider: "local",
  leavesComputer: false,
  readsFiles: false,
  needsModel: true,
  probe: async ({ fetch, signal }) => {
    try {
      const response = await fetch(`${OLLAMA}/api/tags`, { ...(signal ? { signal } : {}) })
      const body = (await response.json()) as { models?: { name?: unknown }[] }
      const models = (body.models ?? []).flatMap((model) => (typeof model.name === "string" ? [model.name] : []))
      return {
        available: true,
        signedIn: null,
        version: null,
        models,
        problem: models.length ? null : "Ollama has no model: ollama pull <model>",
      }
    } catch {
      return {
        available: false,
        signedIn: null,
        version: null,
        models: null,
        problem: "Ollama is not running on this computer",
      }
    }
  },
  read: async ({ fetch, signal }, { system, prompt, model }) => {
    let response: Response
    try {
      response = await fetch(`${OLLAMA}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, system, prompt, stream: false, format: "json" }),
        ...(signal ? { signal } : {}),
      })
    } catch {
      throw notRunning()
    }
    if (response.status === 404)
      throw new CliError("not_found", `Ollama has no model ${model}: ollama pull ${model}`, {
        reason: "reader.model-missing",
      })
    const body = (await response.json().catch(() => ({}))) as { response?: unknown }
    if (!response.ok || typeof body.response !== "string")
      throw new CliError("invalid_response", `Ollama answered ${response.status}`, { reason: "reader.failed" })
    return body.response
  },
}
