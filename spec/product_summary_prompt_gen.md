You are helping me maintain a single canonical product summary file for our app **Kavim**.

## Goal

Regenerate `product_summary.md` so it becomes the **one extended, up-to-date summary of the product and its features**.

This file should be accurate, self-contained, and readable for:
- Developers on the project
- New contributors
- Product / marketing people who need a clear overview

## Source Material (very important)

Look through all relevant files in this repo that describe the product and its features, including but not limited to:

- `README.md`
- `/src/*`
- The existing (if exist) `product_summary.md` (treat this as previous version, not as the source of truth)
- Any other feature/UX docs in the current workspace that clearly describe the product

Prefer **newer / more detailed** information when there are conflicts.

## Output Requirements

1. **Output ONLY a complete Markdown file** that should be saved as `product_summary.md`.
2. Start the file with:
   - `# Kavim Product Summary`
   - A short line: `Last updated: YYYY-MM-DD` (use today’s date).
3. Keep the structure generally consistent across runs so Git diffs stay clean. Use clear headings like:

   - What is Kavim?
   - Who is it for? (Ideal Users / ICP)
   - Core Concepts
   - Main Features
     - Collaboration & Canvas
     - AI Features
     - Privacy & Local-First
     - Notable Tools (e.g., Linear History, Keyboard Shortcuts)
   - How it Works (high-level technical view)
   - Key Differentiators
   - Common Use Cases
   - Philosophy / Design Principles

4. **Summarize features and behavior, not implementation details.**
   - Explain what the user can do and why it’s useful.
   - Mention important workflows like:
     - Visual brainstorming canvas
     - Real-time collaboration on a shared canvas
     - “Bring your own AI” (using user’s own keys)
     - Local-first storage and privacy
     - Linear History panel and what it shows
     - Keyboard shortcuts and how they improve flow
5. Highlight core product ideas:
   - Open-source, local-first, privacy-first
   - Peer-to-peer collaboration (no central server for content)
   - AI-agnostic: works with multiple model providers via user API keys
   - Visual, non-linear thinking vs. linear chat threads

6. Be:
   - Clear and concise
   - Neutral and descriptive (no hype, no emojis)
   - Written in simple, readable English
   - Focused on **what Kavim is, who it’s for, and what it can do today**

7. Integrate **new features or changes** you find in the source files and:
   - Add new sections or bullets where they logically fit.
   - Remove or update anything that is clearly outdated or contradicted.
   - Make sure the file reads as a single coherent document, not stitched fragments.

8. Do **not** include:
   - Internal development notes
   - Raw changelog or release notes
   - Marketing copy aimed at external landing pages

When you are done, return ONLY the final Markdown content for `product_summary.md`, with no extra explanations or chat around it.
