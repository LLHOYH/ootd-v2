# CLAUDE.md

Project rules for any Claude agent working in this repo. Read before editing.

## What this is

Mei — digital wardrobe + AI stylist. See [SPEC.md](SPEC.md).

## Source-of-truth order

1. **`SPEC.md`** — product, data, API, screen specs. If code disagrees, the
   spec wins until updated.
2. **`mockup.html`** — visual contract for screens. Every screen in `SPEC.md
   §10` references its mockup label.
3. **`packages/ui/src/theme/tokens.ts`** — design tokens. Never hardcode
   colors, spacing, or radii — pull from the theme via `useTheme()`.

## Workflow

See [AGENTS.md](AGENTS.md). TL;DR: main agent reviews; subagents work in
`feat/<name>` branches and open PRs. Main never commits to `main`.

## Stack

- **Frontend:** Expo SDK 52 + React Native + TypeScript + expo-router.
- **Backend:** AWS Lambda (Node 20) + API Gateway + DynamoDB single-table + S3.
- **AI:** Anthropic Claude (Sonnet) for Stella; Replicate for image cleanup.
- **Infra:** AWS CDK in `infra/`.
- **Monorepo:** pnpm workspaces + Turbo.

## Commands

```bash
pnpm install              # install workspace
pnpm mobile:web           # Expo web dev server (port 8081)
pnpm mobile:start         # Expo start, scan with Expo Go
pnpm typecheck            # turbo typecheck across all packages
```

## Conventions

- TypeScript strict mode. `noUncheckedIndexedAccess` is on.
- React Native components: function components only, no class components.
- Styling: `StyleSheet.create` + theme values from `useTheme()`.
- Icons: `lucide-react-native`. Default size 20, stroke 1.6.
- Two type weights only: `'400'` and `'500'`. Never higher.
- Sentence case in UI copy. Never Title Case.
