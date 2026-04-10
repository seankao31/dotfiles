# Phase 1: Deep Mine — Reference

**Goal:** Surface a ranked menu of blogworthy angles from the project.

Use a subagent (Explore type) to scan the repo deeply without consuming the main conversation's context.

## Sources

| Source | Looking for |
|---|---|
| Git log (full history) | Interesting arcs: refactors, bug hunts, feature evolution across commits |
| Design docs / specs | Decisions made, alternatives considered, trade-offs |
| Decision records | Where the initial approach was wrong or surprising |
| CLAUDE.md / README | Project identity, architecture choices, unusual patterns |
| Code structure | Notable patterns worth explaining to others |
| Linear issues (if accessible) | Problem context, user-reported bugs, feature requests |
| Commit messages | The narrative of how the project evolved |

## Output Format

A ranked list of candidate angles, each with:
- **Topic** — what the post would be about
- **Why it's interesting** — what makes this worth *reading* (not just worth building)
- **Audience fit** — who would care
- **Content type suggestion** — dev log, deep-dive, "how I solved X", tutorial, postmortem

## Ranking Criteria

What makes something blogworthy (in priority order):
1. A non-obvious decision was made — chose A over B for reasons that aren't immediately apparent
2. Something went wrong and you learned from it — failure stories build more trust than success stories
3. The solution is transferable — other developers with similar problems could benefit
4. It reveals the thinking process — not just what was built, but how the author reasons
5. It's niche enough to own — generic topics have infinite competition; specific ones rank
