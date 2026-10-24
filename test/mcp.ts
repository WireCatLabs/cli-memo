import type { Client } from "@modelcontextprotocol/client"

export const commandCaller = async (client: Client) => {
  const discovery = await client.callTool({ name: "memo_tools_search", arguments: {} })
  const { items } = discovery.structuredContent as { items: { command: string; writes: boolean }[] }
  return (command: string, args: Record<string, unknown>) =>
    client.callTool({
      name: items.find((item) => item.command === command)?.writes ? "memo_write" : "memo_read",
      arguments: { command, arguments: args },
    })
}

const callers = new WeakMap<Client, ReturnType<typeof commandCaller>>()
export const callCommand = async (client: Client, input: { name: string; arguments: Record<string, unknown> }) => {
  let caller = callers.get(client)
  if (!caller) {
    caller = commandCaller(client)
    callers.set(client, caller)
  }
  return (await caller)(input.name, input.arguments)
}

export const commandSchema = async (client: Client, command: string) => {
  const result = await client.callTool({ name: "memo_tools_search", arguments: { query: command } })
  const { items } = result.structuredContent as { items: { command: string; arguments: Record<string, unknown> }[] }
  return items.find((item) => item.command === command)?.arguments
}
