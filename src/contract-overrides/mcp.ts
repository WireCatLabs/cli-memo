import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core; update only after reviewing both definitions.
export const mcp: readonly SharedContractOverride[] = [
  {
    command: ["mcp"],
    field: "summary",
    before: "serve this profile's commands to an AI agent",
    after: "serve commands over stdio or authenticated HTTP",
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp"],
    field: "description",
    before:
      "serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add memo -- memo <profile> mcp`",
    after: "serve memo commands over MCP on stdio or authenticated HTTP, limited by saved permissions",
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp"],
    field: "effects",
    before: {
      remote: "write",
      local: "write",
    },
    after: {
      remote: "none",
      local: "write",
    },
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp"],
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
        description: "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--revoke",
        description: "forget every login given to a browser app; each must log in again",
        takes_value: false,
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
        flags: "--json",
        description: "print the revocation receipt as JSON",
        takes_value: false,
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
        description: "tunnel's HTTPS origin without /mcp; requires --http",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--revoke",
        description: "log every browser app out of Memo",
        takes_value: false,
        mandatory: false,
        conflicts: ["http", "port", "publicUrl", "permission"],
      },
    ],
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp"],
    field: "children",
    before: ["server", "config", "add", "check"],
    after: ["server"],
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp", "server", "start"],
    field: "examples",
    before: ["memo personal mcp server start --public-url https://laptop.example.ts.net"],
    after: ["memo mcp server start --public-url https://laptop.example.ts.net"],
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp", "server", "start"],
    field: "options",
    before: [
      {
        flags: "--port <port>",
        description: "the local port (default 8765)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--public-url <url>",
        description: "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net",
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
      {
        flags: "--port <port>",
        description: "the local port (default 8767)",
        takes_value: true,
        mandatory: false,
      },
      {
        flags: "--public-url <url>",
        description: "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net",
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
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp", "server", "stop"],
    field: "examples",
    before: ["memo personal mcp server stop"],
    after: ["memo mcp server stop"],
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
  {
    command: ["mcp", "server", "status"],
    field: "examples",
    before: ["memo personal mcp server status --json"],
    after: ["memo mcp server status --json"],
    reason:
      "Memo uses Core's stdio/HTTP transport and login while binding its profile-free local store, saved permissions and token state; connector management remains in the client app.",
  },
]
