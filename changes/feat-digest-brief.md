### Added

- **`memo digest brief show | edit | reset`: your own instructions on what the morning digest collects.** Write
  which projects, people and topics matter, what to skip and how many items you want; `memo skill show
  morning-digest` then ends with a section "The owner's brief" holding your text, and says the brief adds to the
  skill and wins where it contradicts one of its rules. The run itself does not change: it stays read only, with
  memo as its only tool and the schedule's cost cap. `edit` opens `$EDITOR`, or takes `--file <file>` (`-` reads
  stdin); `--undo` puts back the body your last change replaced, and `reset` removes the brief, which `edit --undo`
  brings back. At most 4000 characters, because every morning run reads it (`brief.too-long`). Only you change it:
  an agent is refused (`brief.owner-only`), and so is any change under `MEMO_READ_ONLY`. `show --json` answers
  `{ body, chars, limit, updated_at, updated_by, history }`. It is kept in the shared store beside the digest's
  templates. Without a brief, the skill reads as before.
