import { RESOURCES_SEARCHED, searchNotes } from "@wirecat/cli-core/services"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { memoContext } from "../context/context.js"
import { allAnswer, kindAnswer, notesAnswer } from "../search/answers.js"
import { searchEverywhere, searchKind } from "../search/search.js"
import { define } from "./tool.js"

const query = {
  text: v.pipe(v.string(), v.minLength(1), v.description("words, phrases, Boolean operators and field queries")),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 20),
  exact: v.optional(v.boolean()),
  timezone: v.optional(v.pipe(v.string(), v.description("IANA timezone for calendar date boundaries"))),
}

/** Reads across every source the store holds: tg, max and zm read only their own. */
export const knowledgeTools = {
  search_all: define({
    title: "Search everything",
    description: `Messages from every messenger, mail and notes ranked together, with the open tasks that point at a hit. Use it when you do not know where something was written; search_messages, search_mail or search_notes read one kind with all its fields. content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names, as content:invoice. Each result's reference is ref.`,
    writes: false,
    input: v.object({ ...query, only: v.optional(v.array(v.picklist(RESOURCES_SEARCHED))) }),
    run: async (store, args, env) => allAnswer(await searchEverywhere(store, env, args), args.limit, args.exact),
  }),
  search_messages: define({
    title: "Search messages",
    description: `Stored messages from every messenger, with all their fields. content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names, as content:invoice; has:voice, has:file or NOT has:attachment keeps voice messages, files or plain text. Each hit's reference is ref.`,
    writes: false,
    input: v.object(query),
    run: async (store, args) =>
      kindAnswer("messages", await searchKind(store, "messages", args), args.limit, undefined, args.text),
  }),
  search_mail: define({
    title: "Search mail",
    description: `Imported mail, every mail account unless account names one by its address.`,
    writes: false,
    input: v.object({ ...query, account: v.optional(v.pipe(v.string(), v.minLength(1))) }),
    run: async (store, args) =>
      kindAnswer("mail", await searchKind(store, "mail", args), args.limit, undefined, args.text),
  }),
  search_notes: define({
    title: "Search notes",
    description: `Notes from imported folders and your own, by words and, with the local model, meaning. Each note's reference is ref.`,
    writes: false,
    input: v.object({
      ...query,
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
      filter: v.optional(
        v.pipe(v.string(), v.minLength(1), v.description("a query every note must match, as tag:work")),
      ),
    }),
    run: async (store, { text, page, ...options }, env) =>
      notesAnswer(
        await searchNotes(store, text, { ...options, offset: (page - 1) * options.limit, env }),
        options.limit,
        page,
        {
          text,
          ...(options.filter === undefined ? {} : { filter: options.filter }),
          ...(options.exact ? { exact: true } : {}),
        },
      ),
  }),
  person_context: define({
    title: "What the store holds about a person",
    description: `One person across messengers and mail, with the notes, tasks and confirmed relationships linked to them. person is <messenger>:<name or id>, as tg:Alice; account picks one when that messenger has several. notRead says which sources gave nothing, and why.`,
    writes: false,
    input: v.object({
      person: v.pipe(v.string(), v.minLength(1)),
      account: v.optional(v.pipe(v.string(), v.minLength(1))),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
    }),
    run: async (store, { person, ...options }) => itemAnswer(await memoContext(store, person, options)),
  }),
}
