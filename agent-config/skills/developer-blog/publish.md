# Phase 4: Publish — Reference

**Goal:** Turn the completed outline into a ready-to-commit blog post file in the repo's blog system.

## Prerequisite Gate

Two things before anything else:

1. **Scan the outline for any remaining `[NARRATIVE PROMPT]` markers.** If ANY exist, stop and list them. The author must fill them in first. Do not proceed with placeholder text.

2. **Ask the author for the blog repo path.** Phases 1-3 run in the project repo being written about, which may be different from the blog repo. Ask: "Where's your blog repo?" If the author is already in it, they can say the current directory.

## Step 1: Discover Blog Conventions

Examine the **blog repo** to learn how its blog works. Do not assume any framework — discover it.

| What to find | How to find it |
|---|---|
| Post file location | Glob for `*.md`, `*.mdx`, `*.mdoc` in content/posts/blog directories |
| Frontmatter schema | Read existing posts — extract all frontmatter fields, their types, which are required vs optional |
| Filename convention | Check if filenames use slugs, dates, numbering, or a combination |
| Slug derivation | Check if slugs come from filename, frontmatter field, or directory name |
| Existing categories/tags | Collect all values currently in use across posts |
| Content format | Note the Markdown flavor (mdsvex, MDX, plain) and available components |

If no existing posts exist, examine config files, route definitions, and content schemas for the expected format.

**Present your findings to the author.** This is a learning moment — they should understand how their own blog works. Keep it brief: a short list of "here's what I found" bullet points.

## Step 2: Assemble Frontmatter

Map the Shape output's SEO metadata to the discovered frontmatter fields.

**Field mapping rules:**
- Use the repo's exact field names. If the outline says "tags" but the repo uses `categories`, use `categories` — and tell the author about the terminology difference.
- For categories/tags: check what values already exist in the repo. Prefer existing values over inventing new ones. If the post needs a new category, flag it explicitly: "This would create new categories: X, Y. The repo currently has: Z."
- Derive the slug following the repo's convention.
- The `excerpt` is a teaser for listing pages and RSS — not the introduction. Distill from the Content Strategy meta description.

## Step 3: Assemble Post Body

Combine `[DRAFTED]` technical sections with the author's filled-in narrative sections.

**Rules:**
- Strip all `[DRAFTED]` and `[NARRATIVE PROMPT]` markers from the final output
- Insert the author's narrative text **exactly as written** — do not edit, rephrase, or "improve" their voice
- Code blocks must reference real code from the **project** repo (not the blog repo, if different) — verify each snippet still exists at the path you're pulling from
- Heading hierarchy must be clean (no jumps from h2 to h4)

## Step 4: Write the File

**Before writing, show the author:**
- The full file path you'll create
- The resulting URL/slug
- Any new categories being introduced

Wait for confirmation, then write the file.

## Step 5: Verify

After writing:
- Confirm the file is in the correct directory
- Suggest running the dev server or build to verify rendering
- Flag any empty frontmatter fields that might be required

## What This Phase Does NOT Do

- Does not commit, push, or deploy
- Does not edit the author's narrative sections
- Does not add content the author didn't write or approve
