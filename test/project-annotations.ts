import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openStore } from "@wirecat/cli-core/store"

export const projectAnnotationFixture = async () => {
  const directory = mkdtempSync(join(tmpdir(), "memo-project-annotations-"))
  const source = join(directory, "source.db"),
    target = join(directory, "target.db")
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: source, XDG_CONFIG_HOME: join(directory, "config") }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const sourceStore = await openStore({ path: source, env, now: () => 1700000000000 })
  const targetStore = await openStore({ path: target, env, now: () => 1700000001000 })
  try {
    const project = await sourceStore.knowledge.addProject({
      name: "Research Example",
      key: "RES",
      description: "Invented project",
    })
    await sourceStore.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Example study")
    const folder = await sourceStore.notes.addFolder({ name: "Invented evidence" })
    const { note: document } = await sourceStore.notes.saveFileNote({
      folderId: folder.id,
      path: "source.md",
      title: "Evidence",
      text: "INVENTED_SOURCE_BODY_SENTINEL",
    })
    const fact = await sourceStore.facts.add({
      type: "statement",
      statement: "An invented report",
      project: project.ref,
      by: { bot: "source-reviewer" },
      evidence: [document.ref],
    })
    const unrelated = await targetStore.knowledge.addProject({ name: "Unrelated Example", key: "PAD" })
    await targetStore.facts.add({
      type: "statement",
      statement: "A padding actor",
      project: unrelated.ref,
      by: { bot: "padding" },
    })
    const targetFact = await targetStore.facts.add({
      type: "statement",
      statement: "An unrelated statement",
      project: unrelated.ref,
      by: { bot: "target-reviewer" },
    })
    const targetProject = await targetStore.knowledge.addProject({ name: "Research Example", key: "RES" })
    const targetFolder = await targetStore.notes.addFolder({ name: "Independent sources" })
    await targetStore.notes.saveFileNote({
      folderId: targetFolder.id,
      path: "padding.md",
      title: "Padding",
      text: "Other material",
    })
    const { note: targetDocument } = await targetStore.notes.saveFileNote({
      folderId: targetFolder.id,
      path: "source.md",
      title: "Evidence",
      text: "INVENTED_SOURCE_BODY_SENTINEL",
    })
    const bindings = {
      [project.ref]: targetProject.ref,
      [document.ref]: targetDocument.ref,
      [`bot:${fact.author.id}`]: `bot:${targetFact.author.id}`,
    }
    const bindingsFile = join(directory, "bindings.json"),
      snapshotFile = join(directory, "snapshot.json")
    writeFileSync(bindingsFile, JSON.stringify(bindings))
    return {
      directory,
      source,
      target,
      env,
      project,
      targetProject,
      document,
      targetDocument,
      unrelated,
      fact,
      bindings,
      bindingsFile,
      snapshotFile,
    }
  } finally {
    await sourceStore.close()
    await targetStore.close()
  }
}

export const copyProjectAnnotationFixture = (baseline: Awaited<ReturnType<typeof projectAnnotationFixture>>) => {
  const directory = mkdtempSync(join(tmpdir(), "memo-project-annotation-copy-"))
  const source = join(directory, "source.db"),
    target = join(directory, "target.db"),
    bindingsFile = join(directory, "bindings.json")
  copyFileSync(baseline.source, source)
  copyFileSync(baseline.target, target)
  copyFileSync(baseline.bindingsFile, bindingsFile)
  return {
    ...baseline,
    directory,
    source,
    target,
    bindingsFile,
    snapshotFile: join(directory, "snapshot.json"),
    env: { ...baseline.env, MESSAGING_STORE: source, XDG_CONFIG_HOME: join(directory, "config") },
  }
}
