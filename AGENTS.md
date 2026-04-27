# Agent workflow

This repo is built by **one main agent + N feature subagents**, working through
the P0 build plan in `SPEC.md §13.1`.

## Roles

**Main agent** (you, when running interactively)
- Plans. Breaks features into branches. Spawns subagents.
- Reviews subagent PRs against `SPEC.md` and the design system.
- Merges to `main` when reviews pass.
- Never commits feature work directly to `main`.

**Subagents**
- Spawned per feature branch with a self-contained brief.
- Work only inside their branch. No direct merges.
- Open a PR against `main` when the feature is complete.
- May read all files but only write inside their feature's scope.

## Branching

- `main` — always green, deployable.
- `feat/<name>` — one feature, one branch. Examples: `feat/today-screen`,
  `feat/closet-api`, `feat/cdk-data-stack`.
- `fix/<name>` — bug fixes off `main`.
- `chore/<name>` — non-feature housekeeping (deps, configs, docs).

## PR rules

- Title: imperative + scope, under 70 chars. e.g. `feat(today): wire weather strip`.
- Body: link to `SPEC.md §X.Y` for the contract; "what changed" bullets;
  "how I tested" line.
- Each PR must pass `pnpm typecheck` at minimum. CI will enforce.
- Merge strategy: **squash merge**. Keeps `main` history linear and reviewable.

## Review checklist (main agent)

When reviewing a feature PR:

1. Does it match the contract in `SPEC.md`? Cite section if mismatched.
2. Does the UI match `mockup.html`? (Visual contract for screens.)
3. Are all values from `tokens.ts` / theme — never hardcoded colors?
4. `pnpm typecheck` green?
5. Any out-of-scope changes? Reject and ask for split.
6. Any new external services/secrets without explanation? Block.

## Spawning a subagent

Use the Agent tool with a self-contained prompt. The subagent:

- Doesn't see this conversation.
- Starts from `main` and creates `feat/<name>`.
- Must stop before merging. Main agent merges.

A good brief includes:
- Goal and the relevant `SPEC.md` section.
- Files in scope; files out of scope.
- Acceptance criteria.
- Non-goals (what NOT to do).

See `docs/feature-breakdown.md` for the current set of feature briefs.
