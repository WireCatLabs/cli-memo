import type { SharedContractOverride } from "@wirecat/cli-base/commands"

const JSON_OPTION = { flags: "--json", description: "print JSON", takes_value: false, mandatory: false }

const REASON =
  "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app."

// Reviewed differences from Core; update only after reviewing both definitions.
export const mcp: readonly SharedContractOverride[] = [
  {
    command: ["mcp"],
    field: "summary",
    before: "serve this profile's commands to an AI agent, and set that up",
    after: "serve commands over stdio or authenticated HTTP",
    reason: REASON,
  },
  {
    command: ["mcp"],
    field: "description",
    before: "serve this profile to an agent over MCP and set it up — `claude mcp add memo -- memo <profile> mcp serve`",
    after:
      "serve memo commands over MCP on stdio or authenticated HTTP, limited by saved permissions — `claude mcp add memo -- memo mcp serve`",
    reason: REASON,
  },
  {
    command: ["mcp"],
    field: "children",
    before: ["serve", "revoke", "server", "config", "add", "check"],
    after: ["serve", "revoke", "server"],
    reason: REASON,
  },
  {
    command: ["mcp", "serve"],
    field: "summary",
    before: "serve this profile's commands to an AI agent",
    after: "serve memo commands to an AI agent",
    reason: REASON,
  },
  {
    command: ["mcp", "serve"],
    field: "description",
    before:
      "serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add memo -- memo <profile> mcp serve`; with no profile, `memo mcp serve` serves every profile and each tool asks which",
    after: "serve memo commands over MCP on stdio or authenticated HTTP, limited by saved permissions",
    reason: REASON,
  },
  {
    command: ["mcp", "serve"],
    field: "effects",
    before: { remote: "write", local: "write" },
    after: { remote: "none", local: "write" },
    reason: REASON,
  },
  {
    command: ["mcp", "serve"],
    field: "examples",
    before: ["memo personal mcp serve", "memo personal mcp serve --http --public-url https://laptop.example.ts.net"],
    after: ["memo mcp serve", "memo mcp serve --http --public-url https://laptop.example.ts.net"],
    reason: REASON,
  },
  {
    command: ["mcp", "serve"],
    field: "options",
    before: [
      {
        flags: "--permission <key=level>",
        description:
          "make a permission stricter for this server only, like messages.send=deny; it never loosens the profile; repeat for more keys",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--http",
        description:
          "serve over HTTP on 127.0.0.1 for ChatGPT and Claude in the browser, behind your tunnel; the profile's permissions decide",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--port <port>",
        description: "the local port for --http (default 8765)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--public-url <url>",
        description:
          "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      {
        flags: "--permission <key=level>",
        description: "tighten one saved permission for this server; repeat for more keys",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--http",
        description: "serve on 127.0.0.1 behind an HTTPS tunnel with an owner access-code login",
        takes_value: false,
        mandatory: false,
      },
      {
        flags: "--port <port>",
        description: "local HTTP port (default 8767); requires --http",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--public-url <url>",
        description:
          "tunnel's HTTPS address without /mcp, or a path of it such as https://<name>.ts.net/memo; requires --http",
        takes_value: true,
        mandatory: false,
      },
    ],
    reason: REASON,
  },
  {
    command: ["mcp", "revoke"],
    field: "description",
    before:
      "forget every login `mcp serve --http` gave a browser app, of this profile or, with no profile, of the server of every profile; each app must log in again",
    after: "forget every login `memo mcp serve --http` gave a browser app; each app must log in again",
    reason: REASON,
  },
  {
    command: ["mcp", "revoke"],
    field: "examples",
    before: ["memo personal mcp revoke"],
    after: ["memo mcp revoke --json"],
    reason: REASON,
  },
  {
    command: ["mcp", "revoke"],
    field: "options",
    before: [],
    after: [JSON_OPTION],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "start"],
    field: "examples",
    before: ["memo personal mcp server start --public-url https://laptop.example.ts.net"],
    after: ["memo mcp server start --public-url https://laptop.example.ts.net"],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "start"],
    field: "options",
    before: [
      { flags: "--port <port>", description: "the local port (default 8765)", takes_value: true, mandatory: false },
      {
        flags: "--public-url <url>",
        description:
          "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--permission <key=level>",
        description: "make a permission stricter for this server only; repeat for more keys",
        takes_value: true,
        mandatory: false,
      },
    ],
    after: [
      { flags: "--port <port>", description: "the local port (default 8767)", takes_value: true, mandatory: false },
      {
        flags: "--public-url <url>",
        description:
          "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--permission <key=level>",
        description: "make a permission stricter for this server only; repeat for more keys",
        takes_value: true,
        mandatory: false,
      },
      JSON_OPTION,
    ],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "stop"],
    field: "examples",
    before: ["memo personal mcp server stop"],
    after: ["memo mcp server stop"],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "stop"],
    field: "options",
    before: [],
    after: [JSON_OPTION],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "status"],
    field: "examples",
    before: ["memo personal mcp server status --json"],
    after: ["memo mcp server status --json"],
    reason: REASON,
  },
  {
    command: ["mcp", "server", "status"],
    field: "options",
    before: [],
    after: [JSON_OPTION],
    reason: REASON,
  },
]
