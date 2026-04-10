# Phase 3: Shape — Reference

**Goal:** Produce a structured outline with `[DRAFTED]` and `[NARRATIVE PROMPT]` sections.

## Output Template

```
Title: (from content strategy)
Meta description: (from content strategy)
Audience: (from content strategy)
Content type: (from content strategy)

---

[NARRATIVE PROMPT] Introduction
  - Hook suggestion: "..."
  - Context to establish: ...
  - Key question to answer for the reader: ...
  - (Reference what user said in Content Strategy if relevant)

[DRAFTED] Technical Context
  - (Real code snippets from repo with annotations)
  - (Architecture explanation)

[NARRATIVE PROMPT] The Story / Problem / Decision
  - Suggested beats: ...
  - Key tension or turning point: ...
  - "You mentioned [X] — expand on that here"

[DRAFTED] Technical Deep-Dive
  - (Before/after comparisons if applicable)
  - (Key implementation details with explanation)

[NARRATIVE PROMPT] Reflection / What I Learned / What's Next
  - Suggested themes: ...
  - Open questions to pose to readers (engagement driver)

[DRAFTED] SEO metadata
  - Final title, description, slug
  - Suggested tags/categories
```

## Shape Principles

1. `[DRAFTED]` sections pull **real code from the repo** — never fabricated examples
2. `[NARRATIVE PROMPT]` sections reference the **Content Strategy conversation** — echo back what the user said
3. Code snippets are **curated, not dumped** — only the parts that illustrate the point
4. No fluff filler — actively reject AI-blog cliches

## Anti-Patterns to Reject

| Anti-pattern | What it looks like | Do this instead |
|---|---|---|
| Influencer voice | "10 things I learned building X" | Specific, honest, grounded titles |
| AI slop | "In the ever-evolving landscape of..." | Start with the interesting thing |
| Resume blogging | Listing technologies without explaining why | Focus on decisions, not inventory |
| Tutorial without opinion | "Step 1, Step 2, Step 3" with no perspective | Include why this approach over alternatives |
| Humblebragging | "I casually built this little thing..." | Be direct about what you're proud of |
| Over-explaining basics | Two paragraphs explaining what JavaScript is | Know your audience, link out for prerequisites |

## Voice Guardrails (for [DRAFTED] sections only)

- Write like explaining to a colleague, not presenting at a conference
- Short paragraphs. Developers skim.
- If a code block says it, don't also say it in prose
- No "Let's dive in!", "Without further ado", "In today's fast-paced world"

## The "Would I Actually Read This?" Test

Before finalizing, gut-check: would a developer scrolling search results click this title? Would they finish reading? If not, the angle needs sharpening.
