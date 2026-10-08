import { parseLocator } from "@leemour/cli-messaging"
import type { TaskView } from "@leemour/cli-messaging/services"
import type { AccountKey, MessageStore, PersonRecord } from "@leemour/cli-messaging/store"

export const taskPage = async (
  store: MessageStore,
  key: AccountKey,
  options: { state?: "open" | "done" | "dismissed"; limit?: number; offset?: number; sources?: string[] } = {},
): Promise<{ items: TaskView[]; hasMore: boolean }> => {
  const page = await store.knowledge.taskIds(key, options)
  const items: TaskView[] = []
  for (const id of page.items) {
    const task = await store.tasks.get(id)
    if (!task) continue
    let source: ReturnType<typeof parseLocator>
    try {
      source = parseLocator(task.source)
    } catch {
      items.push({ ...task, message: null })
      continue
    }
    if (source.provider !== key.provider || source.account !== key.account) {
      items.push({ ...task, message: null })
      continue
    }
    const message = await store.message(key, source.message, { chatId: source.chat })
    items.push({
      ...task,
      message: message
        ? { text: message.text.slice(0, 200), senderName: message.senderName, timestamp: message.timestamp }
        : null,
    })
  }
  return { items, hasMore: page.hasMore }
}

export const personTasks = async (
  store: MessageStore,
  person: PersonRecord,
  accounts: AccountKey[],
  limit: number,
): Promise<{ items: TaskView[]; hasMore: boolean }> => {
  const items: TaskView[] = []
  let incomplete = false
  for (const key of accounts) {
    const assigned = (await store.knowledge.relations(key, `person:${person.uid}`)).filter(
      (relation) => relation.confirmed && relation.kind === "assigned-to" && relation.to === `person:${person.uid}`,
    )
    for (const relation of assigned) {
      const task = await store.tasks.get(relation.from.slice("task:".length))
      if (task?.state !== "open" || task.account !== `${key.provider}:${key.account}`) continue
      let message: Awaited<ReturnType<MessageStore["message"]>>
      try {
        const source = parseLocator(task.source)
        if (source.provider === key.provider && source.account === key.account)
          message = await store.message(key, source.message, { chatId: source.chat })
      } catch {}
      items.push({
        ...task,
        message: message
          ? { text: message.text.slice(0, 200), senderName: message.senderName, timestamp: message.timestamp }
          : null,
      })
    }
    const identities = person.identities.filter(
      (identity) => identity.provider === key.provider && identity.accounts.includes(key.account),
    )
    if (!identities.length) continue
    const ids = new Set(identities.map((identity) => identity.id))
    const chats = (await store.chats(key, { limit: 500 })).items
    const page = await taskPage(store, key, { state: "open", limit: 500 })
    incomplete ||= page.hasMore
    for (const task of page.items) {
      let source: ReturnType<typeof parseLocator>
      try {
        source = parseLocator(task.source)
      } catch {
        continue
      }
      if (source.provider !== key.provider || source.account !== key.account) continue
      const message = await store.message(key, source.message, { chatId: source.chat })
      const chat = chats.find((item) => item.id === source.chat)
      const direct =
        chat?.kind === "dialog" &&
        (ids.has(source.chat) || (await store.members(key, source.chat)).some((member) => ids.has(member.id)))
      if (!direct && (!message?.senderId || !ids.has(message.senderId))) continue
      items.push({
        ...task,
        message: message
          ? { text: message.text.slice(0, 200), senderName: message.senderName, timestamp: message.timestamp }
          : null,
      })
    }
  }
  items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
  return { items: unique.slice(0, limit), hasMore: unique.length > limit || incomplete }
}
