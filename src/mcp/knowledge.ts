import { RESOURCES_SEARCHED, searchNotes } from "@wirecat/cli-core/services"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { contextAccountOf, memoContext } from "../context/context.js"
import { projectContext } from "../knowledge/project-context.js"
import { gatherStoredProject, windowOf } from "../knowledge/project-gathering.js"
import { allAnswer, kindAnswer, notesAnswer } from "../search/answers.js"
import { searchEverywhere, searchKind } from "../search/search.js"
import { MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"
import { define } from "./tool.js"

const query = {
  text: v.pipe(v.string(), v.minLength(1), v.description("words, phrases, Boolean operators and field queries")),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 20),
  exact: v.optional(v.boolean()),
  timezone: v.optional(v.pipe(v.string(), v.description("IANA timezone for calendar date boundaries"))),
}

/** Reads across every source the store holds: tg, max and zm read only their own. */
export const knowledgeTools = {
  project_context: define({
    title: "Review a project's context",
    description:
      "Read key documents first, then relationships, notes, tags, pending facts and meeting findings, and open numbered tasks. Accepts a project ID, key, exact name or alias. Bounded findings cover linked meeting accounts only; preserve coverage and read full batches before owner review. Confirms or assigns nothing.",
    writes: false,
    input: v.object({ project: v.pipe(v.string(), v.minLength(1)) }),
    run: async (store, { project }) => itemAnswer(await projectContext(store, project)),
  }),
  project_evidence: define({
    title: "Gather cited project evidence",
    description:
      "memo projects evidence: what the store holds about a project in stored messages, mail, meeting transcripts and imported notes folders. The project's name (an existing project brings its key and aliases), each alias, each context_query and each contact name is a separate literal search (all words of one must match); their hits are joined. New mail and documents are indexed for search first unless catch_up is false; transcript indexing is separate. Meeting hits retain exact cue references and use the meeting start date. source is required: provider:account entries, a kind or group:<name>, separated by commas, or all. since_time is days back, as 60d (default), or a start date. Each message hit carries around: before_n and after_n messages next to it in its chat (default 2), as context, never as more hits. An item found only through a contact's name has context person-only: not membership. Failed or unread sources are coverage, never absence; completeness is unknown. When checkpoint is returned, call again with the same arguments and cursor set to it. Reads only; proposes and confirms nothing.",
    writes: false,
    input: v.object({
      project: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("an existing project's id, key, name or alias, or a new name"),
      ),
      source: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("where to look: provider:account list, a kind, group:<name> or all"),
      ),
      alias: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(16))),
      catch_up: v.optional(v.boolean(), true),
      before_n: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)), 2),
      after_n: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)), 2),
      context_query: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(16))),
      contact: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(16))),
      since_time: v.optional(
        v.pipe(v.string(), v.description("how far back: 1d to 730d, or a start date such as 2026-09-01")),
        "60d",
      ),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500))),
      max_pages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(512))),
      cursor: v.optional(v.pipe(v.string(), v.minLength(1))),
    }),
    run: async (store, args, env) =>
      itemAnswer(
        await gatherStoredProject(store, env, {
          project: args.project,
          source: args.source,
          ...windowOf(args.since_time),
          catchUp: args.catch_up,
          beforeN: args.before_n,
          afterN: args.after_n,
          ...(args.alias ? { aliases: args.alias } : {}),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          ...(args.context_query ? { keywords: args.context_query } : {}),
          ...(args.contact ? { people: args.contact } : {}),
          ...(args.max_pages === undefined ? {} : { maxReads: args.max_pages }),
          ...(args.cursor === undefined ? {} : { checkpoint: args.cursor }),
        }),
      ),
  }),
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
    description: `Imported mail, every mailbox unless source names some: ${MAIL_SOURCES}, separated by commas.`,
    writes: false,
    input: v.object({ ...query, source: v.optional(v.pipe(v.string(), v.minLength(1))) }),
    run: async (store, { source, ...args }, env) => {
      const accounts = source === undefined ? undefined : await mailboxesOf(store, env, source)
      return kindAnswer(
        "mail",
        await searchKind(store, "mail", { ...args, ...(accounts === undefined ? {} : { accounts }) }),
        args.limit,
        undefined,
        args.text,
      )
    },
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
    description: `One person across messengers and mail, with the notes, tasks and confirmed relationships linked to them. person is <messenger>:<name or id>, as tg:Alice; source picks the account, as telegram:1, when that messenger has several. notRead says which sources gave nothing, and why.`,
    writes: false,
    input: v.object({
      person: v.pipe(v.string(), v.minLength(1)),
      source: v.optional(v.pipe(v.string(), v.minLength(1))),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
    }),
    run: async (store, { person, source, limit }, env) => {
      const account = source === undefined ? undefined : await contextAccountOf(store, env, person, source)
      return itemAnswer(
        await memoContext(store, person, {
          ...(limit === undefined ? {} : { limit }),
          ...(account === undefined ? {} : { account }),
        }),
      )
    },
  }),
}
