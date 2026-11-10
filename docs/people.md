# People and projects

This page helps you answer "what do I know about this person?" before you reply or meet them, and
keep track of the companies, teams and projects they belong to. Memo gathers the person's messages,
mail and your notes into one answer, each item with its source. It never decides that two accounts
are one person because the names match: you link them.

## Find a person by name

```sh
memo search people kai
memo search people 'Kai Sample' --source telegram --json
```

It reads every account in the store unless `--source` names some, and says which it read. A person
matches when their name, username or the alias you gave them holds every word; case and accents do
not matter. Each result shows the person's `person:<id>`, which `memo projects evidence --contact`
takes, and the accounts behind it.

## The people you know

```sh
memo people list                          # people, the ones who write to you most first
memo people list kind:organization        # companies, shops, airlines
memo people list kind:all --sort recent --page 2
memo people list name:ivan --json
memo people check ivan petrov             # before adding a person: who already has this name
```

`people list` shows one kind at a time; the first rule that holds decides it, and `kind_signals` says which:

1. **person**: you, people you added by hand, and anyone assigned a task, always.
2. **automated**: a bot, a no-reply address, a sender most of whose mail is in the bulk box or whose mail you never
   answer, or a name such as «Notifications» or «Рассылка».
3. **organization**: an account an organization owns, a shared address such as `info@`, or a legal form or company
   word in the name (ООО, LLC, Airlines, Hotel, Team…).
4. **person**: a readable name and a tie to you: a one-to-one chat or a group of at most 10 they are in or wrote in,
   mail you wrote to them, a meeting, a CRM deal or lead whose owner is your CRM user (link that user to yourself with
   `memo people link`), a CRM's own users, or your phone's address book.
5. **stranger**: a readable name and no tie, such as authors seen only in big groups and CRM contacts with no deal of
   yours.
6. **unsorted**: no readable name.

`kind:person` is the default; `kind:all` lists every kind. The answer's `next` step `people.kinds` says how many each
other kind holds. Each person has `display_name` (the name cleaned of wrapping quotes and spaces; a placeholder such as «Без
имени» gives way to the username, phone or email; `name` stays as stored), `contact` (the phone, else the email, else
the username; `username_source` names the messenger the username belongs to), `messages_from` (the messages and mail they sent), `last_contact` and `ties`. `--sort` is
`interactions` (the default), `recent`, `name` or `tasks`. Run `contacts sync` in each messenger once, or nobody has
the address-book tie.

`people check` lists people whose names start like the words you type, in any order and in either script, the same
name first (`same_name`): «Светлана» finds Svetlana too. `name:` searches find a name in either script as well. Memo
never joins people on a name alone: link them as below.

Memo never joins anyone to you on its own. An account you connect under another person's name, such as a partner's
mailbox or a spouse's messenger you read, waits in `people review` as a match with the signal `account`, and so does
anyone whose phone or address is also yours. A company's phone and a bot's number join and propose no one; a shared
mailbox such as `info@` joins no one but suggests each pair of its people, as below.

## Everything about a person

**The easiest way: ask your agent.**

```text prompt
Use memo CLI to show what I know about Kai Sample on Telegram: recent messages, mail and my notes.
Tell me what is still open between us, with the source of each point.
```

**Or run it yourself:**

```sh
memo context telegram:'Kai Sample'
memo context email:kai@example.com
memo context max:'Kai Sample' --limit 50
memo context person:7
```

Name the person by their account: `telegram:` or `max:` with a name or ID, or `email:` with an
address, or as `person:<id>` (`memo search people` gives it). `person:<id>` reads every account that saw them,
a CRM contact or a name you only added (`memo people add`) too, and `coverage` names each account it read and each
source it did not, with the reason. The answer brings together:

- every account you linked to the person;
- the last message each way, recent messages in direct chats and groups, and the chats you share;
- their email, once the address is linked to them;
- the calendar events they are invited to, the next ones and the latest past ones, from every calendar gcal
  stored. The answer names the calendars it read. An event's title and place are written by whoever sent the
  invitation, and `--json` lists those fields under `untrusted`;
- the note about them, the notes that link to them, and the notes you wrote about them in Memo;
- open tasks that are about them or assigned to them.
- the Google Drive files they own or last edited, as Google reports it. You have not reviewed these links;
  they come from Google's own file record, not from a guess;
- `business`: the organizations they belong to with their role and position, whom they report to and who reports to
  them, the deals and leads they are on, their projects, and categories such as `client`. Each relationship has a
  `standing`: `confirmed` (yours), `reported` (a CRM account says so, and names it; nobody confirmed it), `proposed`
  (waits for you in `memo review`) or `ended`.

A note that only mentions the name in its text is not included; only links count
([why](how-it-works.md#links-between-notes-and-people)). If a part gave nothing, the answer says
why. `--limit` shows more than 20 items of each kind, and `--json` gives the answer to an agent.

If you have several accounts in the same messenger, add `--source` to a `<messenger>:<name>` reference, for example
`memo context telegram:101 --source telegram:1`. For `person:<id>`, `--source` only narrows the accounts read.

## Link a person's accounts

One person can have a Telegram account, a MAX account, a CRM contact and an email address. Memo treats them as one
person when:

- they have the **same email address**, in any account, work or personal, and no third person has it, unless it is
  a shared mailbox (a role address such as `info@` or `support@`, or a company's address), which only suggests a link;
- they have the **same phone number**, no one else has it, and one of them has it in Telegram, MAX or WhatsApp.

`memo sync` joins them, and so does `memo people scan`. A matching name, username or email domain is never enough,
and a no-reply address such as `noreply@` neither joins nor suggests anyone. A pair you rejected is never joined.
New evidence about it, such as the same email address after you rejected a phone match, suggests it again; the
evidence you rejected never does.

Some signals only suggest a link: a phone number only CRM contacts or cards share, a phone number or an address
that three or more people share, an address a meeting guest typed for themselves, or an agent's guess. These wait as
matches:

```sh
memo people review
memo people confirm 17090
memo people reject 17091 --reason "two people"
```

`memo people confirm` and `memo people reject` take ids and ranges (`17090-17095`) as `people review` lists them, or
`all`: everything `people review` lists with the same `--kind` (`link`, `split` or `all`) and `--limit`. `all` shows
what it would do and changes nothing until you add `--yes`. Each proposal is decided on its own, so one that changed
since is refused and the others are still decided. `memo review` lists and decides the same proposals among
everything else.

`people review` lists the highest `score` first, and matches with no score and splits after them, newest first. A
match on a shared mailbox shows `shared` (`role` for an address such as `info@`, `line` for a company's) and the
address as `mailbox`; its score is 0.1 for the mailbox alone and rises when the two people also have one name, a
phone or another address only they hold, or a chat or a company domain. When the mailbox is a company's, not either
person's, say so:

```sh
memo people resolve 17092 company                    # the company that has the address or its domain, else a new one
memo people resolve 17092 company organization:12    # this organization
memo people resolve 17092 company --name "Shop Ltd"  # a company of this name; needed for a free mailbox such as gmail.com
memo people resolve 17092 company --all              # and every other match waiting on that mailbox
```

The address goes to the organization, the two people are not joined, and that pair is not suggested again on that
address. With `--all` every match waiting on the same mailbox is closed in that one answer, and `closed` lists them.
Each match carries `mailbox` and, when three or more people share it, all of them in `candidates`. Only you answer it, as with `confirm` and `reject`.

Link two accounts yourself, or look at one person:

```sh
memo people link max:Kai telegram:Kai
memo people show telegram:Kai
```

`memo people show` lists the person's identities by source, the accounts that saw each, the merges that joined them
(`merge:12-34`, with how, by whom and when) and the matches that wait. `memo people show person:me` shows you.
`memo context` for any of the accounts shows everything from all of them.

### People that look wrong

```sh
memo people links check
memo people links check --page 2 --json
```

`memo people links check` lists people that may be wrong across the whole store, you first, with why and the command that
would fix each:

- **owner-other-name**: your own person holds an identity under another name, such as a partner's mailbox or a
  spouse's messenger you read. Spelling and script do not count: «Алексей Иванов» is Aleksei Ivanov.
- **test-data**: the people of a test, or an address at a reserved domain such as `.test` or `example.com`.
- **shared-address**: an identity joined by an address that a person of another name has, such as a shared or company
  mailbox.
- **mixed-names**: one person with different names and no phone or address in common.

What you linked yourself, the identities a person already held when you linked another to them, and identities you
kept together by rejecting a split, are left out.

When a doubt is wrong (a nickname beside a full name, say), tell memo the person is right as they are:

```sh
memo people links resolve person:42 keep
```

The identities in doubt stop being listed until one of them moves to another person. An identity that joins the person
later is checked again, and an agent's split of the kept ones is refused. Only you run it, at a terminal or in WireCat
Desktop.

### Undo a link

- `memo people unmerge merge:12-34` gives a merge's identities back to the person they came from.
- `memo people unlink telegram:12345 --from person:me` gives one identity of yours a person of its own again.
- `memo people unlink email:kai@example.com max:6789 --from person:42` moves several identities of one person to one
  new person.

`unlink` takes each identity by its exact id, as `memo people show` lists it, never by a name. `--from` names the
person they leave, as `person:<uid>` or `person:me`, and is required. When an identity sits on someone else, nothing
changes: the refusal (`identity.held-elsewhere`) names the person who holds it, so you can check before you run it
again with that person.

Yours apply at once, at a terminal or in WireCat Desktop. After them, no automatic match joins those people again.
An agent's `unlink` or `unmerge` needs `--reason` and only proposes the split: it waits in `memo people review` with
the reason, and only your `memo people confirm` carries it out. A split you reject is not proposed again while
those identities stay on that person, and `people links check` no longer lists them. An agent's `memo people link … --reason` waits the same way.

To choose the main note about the person, see [the note about a person](notes.md#the-note-about-a-person).

## Bring in a phone's contacts

Export the contacts from your phone as a vCard file (`.vcf`) and import them under the phone's name:

```sh
memo records check contacts.vcf --account phone:pixel --region ru
memo records import contacts.vcf --account phone:pixel --region ru
```

A contact is linked to the person who already has one of its e-mail addresses or phone numbers, or made a new
person. A number written without `+`, such as `8 900 000-00-02`, is read in the country `--region` names (`ru`,
`gb`, `de` and so on, in any case). Without `--region`, such a number is kept but not matched, so the contact can
become a second entry for someone you already have; the import says which cards these are.

## Organizations and projects

Organizations and projects are yours, not tied to one messenger account.

- An **organization** is a company, a team, a family or a community.
- A **project** has a name, a short key such as `HRB` (3 or 4 letters and digits), a type and,
  if you want, the organization it belongs to.

```sh
memo organizations add 'Synthetic Studio' --kind company
memo organizations list 'name:*studio*'
memo organizations show organization:1
memo organizations rename organization:1 'Synthetic Studio Ltd'
memo projects add 'Harbour' --key HRB --scope work --organization organization:1
memo projects list
memo projects context HRB
```

`--scope` is `personal` or `work`. `name:` ignores case and takes `*` as any text, so `name:*studio*` finds every name
that holds the word. An agent's `organizations add` and `organizations rename` are written at once, as yours are;
memo's `permissions` settings are what limit them. `projects context` takes a key, number, `project:<id>`, exact name or alias.
`projects context` shows the people linked to the project, the notes about it or linking to it, and its tags.
`organizations context` shows the organization's people by role, its customers, suppliers and partners, its projects,
open deals and leads, invoices, payments and orders as stored (totals per status and currency, confirmed rows only),
how much its people wrote to you, the open tasks of its projects, its categories, the notes about it and its tags. Each
relationship says its standing, and `coverage` what was not read. `memo organizations list category:client` lists the
organizations that are customers of one of your own; `supplier`, `partner` and `employer` work the same way. A
category is read from relationships each time, never stored. For a project, the view also groups pending key documents, relationships, facts and meeting follow-ups
under `review`, separate from existing open numbered tasks. It confirms nothing. The text view shows
proposal references; `--json` includes evidence, source scope and continuation commands. Fact/task
previews hold 20 records each. Meeting previews read at most five proposed batches per linked meeting
account, across eight accounts. Read a full batch before review because it can span projects.

A project's key is also used for its
tasks, such as `HRB-1` ([tasks](tasks.md#tasks-in-a-project)).

## Key documents of a project

A **key document** is a note, a file or a stored message to read first about a project, with a
short reason. It belongs to one project: the same file can be key to one and not to another.

```sh
memo projects key-documents add HRB document:3 --reason 'the plan everyone follows'
memo projects key-documents add HRB msg:telegram/1/77/42 --reason 'the agreed budget'
memo projects key-documents list HRB
memo projects key-documents remove HRB document:3
```

`projects context` starts with them: title, path and why. When the file or message is gone from
the store, the mark stays and says `available: false` until you remove it. `memo search all` and
`memo search notes` with `--project HRB` put the project's key documents first and leave out
nothing else; `search notes` also labels them `key`. A mark your agent adds waits unconfirmed and names the agent, as a
relationship does.

**Start work on a project with `memo projects context <key>`** — you, or your agent.

A global tag such as `key` (`memo tags add key --note document:3`) says nothing about the project.
Move it to a key document with `memo projects key-documents add`, then `memo tags remove key`.

## Who belongs where

A **relationship** says that a person belongs to an organization or works on a project, reports to someone, or that
one organization is a customer or partner of another:

```sh
memo relationships add person:PERSON_UID organization:1 --role employee --position CTO --start-date 2026-01-01
memo relationships add person:PERSON_UID project:1 --role contributor
memo relationships add person:PERSON_UID person:OTHER_UID --kind reports-to
memo relationships add organization:2 organization:1 --kind customer-of
memo relationships list 'about:"project:1"'
memo relationships list kind:reports-to 'to:"person:5"'
memo relationships list standing:reported include:ended --limit 50
memo relationships end 4 --end-date 2026-09-30
memo relationships remove 4
```

`--position` keeps a job title apart from the role, and `--start-date` and `--end-date` (the last
day) say when it held. `memo relationships end <id> --end-date <date>` says it no longer holds: it stays, as `ended`.

Kinds: `member-of`, `reports-to`, `customer-of` (read backwards: supplier of), `partner-of` and `related-to`. A role
is one from a list: in an organization `employee`, `contractor`, `founder`, `owner`, `manager`, `adviser`, `contact`;
in a project `owner`, `manager`, `contributor`, `client-contact`, `approver`; on a deal or lead `owner`, `contact`,
`decision-maker`, `influencer`; between people and organizations (`related-to`) the offered `colleague`, `adviser`,
`investor`, `mentor`, `family`, `friend` (another word is kept, as `custom`). A job title is not a role: give it with `--position`. `memo relationships roles list` shows the lists;
`memo relationships roles add organization board-member --label 'Board member'` adds a role of your own, and
`remove` takes it off again while no relationship holds it. Only you change the lists. A role saved before these lists stays as written, and
`relationships list` marks it `custom`; `role_list` on each row names the list its role comes from. A row with a
document at an end carries `from_document` or `to_document`: title, folder path, the link that opens it and when it last
changed.

`relationships list` filters by `kind:`, `role:`, `standing:`, `from:`, `to:` and `at:<day>` (held on that day), and
pages with `--limit` and `--page`; `at:<day>` means held at the start of that UTC day. It leaves out the ones that
ended unless you add `include:ended`, and lists the proposals waiting for you with `standing:proposed`. With
`about:<ref>` each row says its `direction` (`outgoing` or `incoming`) and, incoming, its `inverse`, such as `manages`
for `reports-to` read backwards. Every row shows its standing and, for a CRM's, the account that reported it.

What the role means here goes beside it, in your words, with `--role-note`.
A free-text role from before the lists still reads; to change it, set a listed role and keep the old words as
the note: `memo relationships update 4 --role client-contact --role-note '<the old words>'`.

A person on a project also takes an **engagement level**: how much you deal with them yourself, not how active
they are. It is `none`, `low`, `medium` or `high`; without one it is unknown. Someone who writes in the client
group but whom you rarely answer stays a member, with `low`:

```sh
memo relationships update 4 --engagement low
memo relationships update 4 --role approver --role-note 'signs the acts'
memo relationships update 4 --engagement ''    # back to unknown
```

`memo projects context` and `memo relationships list` put the project's people in this order: high, medium,
unknown, low, none.

A chat can be a project's too, so `memo projects evidence` reads all of it, not only messages that name the
project. The reference names the chat's account, so no account is guessed:

```sh
memo relationships add chat:telegram/1/123 project:1
```

Only `member-of` a project is allowed for a chat.

Relationships are statements you make. They never link two accounts into one person. One an agent
adds in its terminal is a proposal for you, naming the agent, not a relationship; `--as-owner` makes it yours
after you answer y at the terminal.

Memo can propose the chats, mail threads and people that look like a project's: its name or aliases in chat titles
and messages, groups and dialogs of its confirmed members, people who write in its confirmed chats. With no project,
it proposes people who write to you from the same company domain.

```sh
memo relationships scan HRB --source all        # lists them, writes nothing
memo relationships scan HRB --source all --yes  # proposes them for review
memo review kind:relationship
```

A person proposed because they write in a project's group says which group and how much: "wrote 40 messages in
«Sales» (25 people)". When a scan proposes two or more senders of one group, it prints the command that lists them
together, so you can decide that group's people in one go, apart from the people you work with directly:

```sh
memo review list via:chat:max/1/-100                # that group's senders; next names the confirm command
memo review confirm 17070-17074                     # all of them
memo review reject 17070-17074 --reason "not this project"
```

Proposals wait until you confirm them in `memo review`, and they do not appear in a person's context before that. A
pair you rejected is never proposed again. People are matched by the account that wrote, never by a name in a text.
Common free mail domains, such as Gmail, are never used for proposals.

## Meetings in a project

If your meetings are saved in the local store, you can link a meeting to a project:

```sh
memo projects meetings link HRB 5 --account zoom:ACCOUNT
memo projects meetings list HRB --source zoom:ACCOUNT
```

Name the meeting's account exactly. `confirmed:false` lists the links an agent proposed; to confirm one,
repeat `link` with the `--fingerprint` value shown in that list.

## Other names for projects and tags

People call the same project by different names. You can give a project or a tag other names, so a
search or an agent finds it by any of them:

```sh
memo vocabulary list kind:project
memo vocabulary show 'Harbor' --kind project
memo vocabulary aliases add project:1 'Harbor' --fingerprint VALUE
```

`vocabulary list` shows each project, tag and topic with its other names and a check value. Pass
that value to `--fingerprint` when you add or remove a name; if the list changed in the meantime, Memo
refuses and you look again. `memo vocabulary check 'on-boarding'` shows similar existing tags
before you create a new one, so you do not end up with `onboarding` and `on-boarding`.

Next: [write a note about one of them](notes.md#write-your-own-notes).
