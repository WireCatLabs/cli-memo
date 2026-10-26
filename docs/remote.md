# Connect a browser or phone AI app

Connect a remote AI app to Memo when the app cannot start a program on your computer. The app reaches
Memo through your own HTTPS tunnel, logs in with a code from your terminal, and uses the same search,
read and write commands as a local MCP client. The computer running Memo must stay on.

An HTTPS tunnel forwards a public address to a port on your computer. The access-code login is OAuth:
the app receives a login token after you approve its connection. Command permissions still decide what
it may do. Text returned by Memo can reach the app and its AI provider; choose your sources accordingly
([security](security.md)).

## Start the tunnel and server

[Install Memo](installation.md) and import the notes or mail you want it to read first. Messages and
meetings must already be stored by the other WireCat tools. Use the same operating system user and
Memo settings for the imports and the server. Memo does not take a leading profile name.

Set up an HTTPS tunnel that supports streaming responses. For example, install and sign in to
[Tailscale](https://tailscale.com/download), enable
[Funnel](https://tailscale.com/docs/features/tailscale-funnel), and point it at local port 8767.
The [Funnel command reference](https://tailscale.com/docs/reference/tailscale-cli/funnel) covers the
required permissions and command for your system. A named Cloudflare Tunnel also works; temporary
[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) do not support
the streaming responses this server uses.

Keep the tunnel running in one terminal. In another, replace the example origin below with the
HTTPS origin your tunnel gives you, including its port if shown:

```sh
memo mcp --http --public-url https://device.example
```

Memo listens only on `127.0.0.1:8767` and prints a one-time login code and connector address. Point
the tunnel at `http://127.0.0.1:8767`. The public origin must contain no login credentials, path, query or fragment; Memo
adds `/mcp` for the connector. Remote public origins must use HTTPS.

To use another local port, pass `--port` and change the tunnel target to match:

```sh
memo mcp --http --port 8768 --public-url https://device.example:8443
```

Each WireCat server needs its own local port and public origin. Memo's default 8767 leaves tg and
MAX's usual ports free. Follow the tunnel provider's rules when choosing a public port.

To keep it running after the terminal closes, start it in the background instead. It answers once it listens,
with the connector address and the login code:

```sh
memo mcp server start --public-url https://device.example
memo mcp server status   # running, port, connector address, the current login code, apps logged in
memo mcp server stop     # stops only a server that `mcp server start` started
```

The code is kept beside the token file (`mcp-http/memo.lock`, mode 600) and renews every ten minutes; a server
started this way does not write it to its log. WireCat Desktop shows the same status under Tools → Memo → MCP server.

## Connect the app

Add the connector address printed by Memo, ending in `/mcp`, in the app's remote MCP settings.
Choose OAuth login; the app must support dynamic client registration. When its login page opens,
enter the current code printed in your terminal. A successful login issues a token to that app;
Memo prints a new code for the next connection. Keep these codes out of messages and public logs.

Ask the app to discover Memo's commands and search for a known synthetic or non-private note.
It should offer `memo_tools_search`, `memo_read` and `memo_write`. Open a returned source before
using it as evidence. An app that cannot read the results should report that limit.

The tunnel and app are separate installations. This guide describes the server's tested protocol;
it does not certify every app, subscription or operating system setup.

## Limit what an app can do

HTTP uses the same [saved permissions](configuration.md#permissions) as stdio. Blocked commands
remain discoverable with a reason, and each call rechecks current permissions. `ask` does not show
a question in Memo's terminal; approval prompts depend on the client app.

A server override can only tighten saved permissions:

```sh
memo mcp --http --public-url https://device.example --permission notes.add=deny
```

Repeat `--permission` for more keys. `MEMO_READ_ONLY=1` refuses writes. Decisions on meeting findings,
restoring annotations, and changes to source folders or mail rules still need their explicit
permissions. Memo never sends messages or mail. [The MCP guide](mcp.md) describes those boundaries.

## Stop or revoke access

Press Ctrl-C to stop Memo and stop this tunnel's route separately. A normal restart retains app
logins. If the tunnel runs in the background, use its own route-specific stop command; do not reset
routes used by other servers.

To log every browser app out of this Memo installation:

```sh
memo mcp --revoke --json
```

Revocation also affects a running server: existing tokens stop working and apps must log in again.
It does not disconnect a messenger or remove notes and mail. Token hashes and client registrations
live under Memo's state folder in `mcp-http/memo.json`; raw tokens are not stored there. Revocation
uses that state folder, so run it with the same environment as the server.

## If connection fails

- If the connector cannot reach Memo, check that the computer, server and tunnel are running and
  that the tunnel points at the chosen local port. The public address ending in
  `/.well-known/oauth-protected-resource/mcp` should return JSON metadata.
- If the local port is already in use, choose another `--port` and update the tunnel target.
- If login fails, use the latest terminal code. Repeated wrong codes are throttled by the shared login.
- If reads work but writes fail, inspect saved permissions, server overrides and the read-only lock.
- Use `memo agents list agent:memo-mcp` to review command execution without argument contents.

Next: [review what the app saved](memories.md).
