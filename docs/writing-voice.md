# Writing voice

Guidance for prose in this repo's documentation. The aim is to keep the
writing recognizably human. None of these are strict rules. Restraint
is the operating principle.

## Why this file exists

Certain words and constructions have become signals that a piece of
writing was generated or polished by an AI. Even when AI assistance is
genuine and acknowledged (as it is in this project), prose that reads
as AI-flavored undercuts trust. The README, design docs, TESTING.md,
and blog material should sound like the developer who built the
project.

This file lists the patterns to watch for. Treat the list as signals
to notice. None of them is a hard rule. The goal is to use them
sparingly so the writing reads as a person's work.

## Patterns to use with restraint

### Em-dashes as parenthetical pauses

The most common signal. Em-dashes are valid punctuation, but AI
overuses them for pause-and-elaborate constructions. Prefer periods,
commas, parentheses, or connecting words (because, since, so, while,
although).

### The "X, not Y" contrast

A signature AI structure. Examples that landed in this repo's early
drafts:

- "tests are the first consumer, not the only possible one"
- "part of the deliverable, not an afterthought"
- "Tests track the product, not the roadmap"

One or two instances across a long doc is fine. Three or four starts
to feel like a fingerprint. When a contrast is genuinely needed, two
sentences often work better than the compressed "A, not B" form.

### Pithy aphoristic closers

Short declarative sentences at the end of a paragraph that summarize
the point in a quotable way. "Test depth follows risk profile." "The
directory is the story." Two or three across a long doc is fine. More
starts to feel performative.

### Triadic structure

Three-item lists everywhere. Three bolded slogans opening a section.
"One language, one toolchain, one mental model." AI writing leans on
threes because they sound complete and balanced. Vary the count.

### Bolded slogan-statements opening paragraphs

Three or more bolded sentences in a row, each phrased as a slogan,
each opening a paragraph. The format itself signals AI rhetoric even
when the content is fine. If a section needs paragraph headers, plain
sentence openings carry the meaning without the marketing-copy feel.

### Overused words

These show up in AI prose at much higher rates than in unassisted
human writing. Each one is fine in isolation. Avoid stacking them or
repeating them within a single document.

- deliberate / deliberately
- discipline (used as virtue)
- curated
- ethos
- load-bearing
- pragmatic
- modern (qualifying a tool choice)
- robust / rigorous
- earns its keep / earn their place
- the real X (when "real" is a hedge or honesty marker)
- honest (as virtue modifier)
- delve / delve into
- in essence
- fundamentally
- underscore
- navigate (used as metaphor)
- myriad
- paramount
- intricate

### Other phrasings worth flagging

- "It's not just X, it's Y" construction
- "doing heavy lifting"
- "subtly wrong"
- "X-shaped" as an adjective ("sentence-shaped titles")
- "unfold" as a verb for an event
- "lives in" / "lives at" as metaphor
- "costs X nothing" or other cost-as-verb constructions
- "foreclose" used metaphorically
- "to be clear" / "that said" / "indeed" as transitions

## Scope

These signals matter most in prose between sections of public-facing
documents. They matter less in:

- Code, comments inside code, and commit messages (terseness wins
  there)
- Technical descriptions, command examples, env-var listings
- Per-spec test descriptions in TESTING.md and similar
- Anything inside code blocks

The bigger the connective prose passage, the more the signals stand
out. The smaller the technical description, the less anyone notices.

## What to do instead

When a sentence is heading toward one of the patterns above, ask
whether a more direct version does the same job. Most of the time, a
direct version does. Two short sentences can usually replace an
em-dash construction. A plain "because" or "since" often replaces a
parenthetical aside. Avoiding "X, not Y" usually means writing the X
part first and the Y part as its own sentence.

The goal is writing that sounds like the developer made the
decisions about what the document says. The AI helped with the
typing.

## A note on this file itself

This file should follow its own guidance. If a future revision adds
em-dash pauses, "X, not Y" constructions, or aphoristic closers, that
is a sign the file has drifted. Edit it back into shape.
