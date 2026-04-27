# Mei

> Working name: **Mei** (美 — beauty). A digital wardrobe app where users photograph their clothes, get daily outfit recommendations from weather + calendar, chat with an AI stylist, and coordinate looks with friends before going out together.

## What's in this repo

| File | Purpose |
|---|---|
| `SPEC.md` | The build doc. Product overview, tech stack, design system, data model, API surface, AI/Stella spec, image pipeline, screen-by-screen specs, cross-screen flows, build plan, open questions. |
| `mockup.html` | Single-file visual reference — all 15 screens. Open in any browser. |
| `tokens.ts` | Design tokens as a TypeScript object — drop into your `packages/ui` theme. |

## How to use this with Claude Code

1. **Start by loading `SPEC.md`.** It's the source of truth and has a TOC.
2. **Open `mockup.html` in a browser** as you work — every screen in the spec references its mockup label (e.g. "see mockup → 03 · Stella").
3. **Build in milestone order.** `SPEC.md §13 Build plan` lays out P0 → P1 → P2.
4. **`tokens.ts` ships with your first commit.** All UI work pulls from it.

A reasonable opening prompt to Claude Code:

> Read SPEC.md and review mockup.html. We're starting on P0. Scaffold the monorepo per §4, set up the design token theme from tokens.ts, and build the bottom-tab navigation with placeholder screens for Today, Closet, Stella (centered raised button), Chats, and You. Use the stack in §3 — Expo + React Native + TypeScript on the frontend, AWS Lambda + DynamoDB + S3 on the backend.

## Status

- Design: complete for P0/P1 (15 screens). P2 screens (Fashion now, multi-agent Stella) not yet designed.
- Spec: complete.
- Code: not started.

## Open questions

See `SPEC.md §14`. The big ones:

- "Fashion now" sourcing — RSS pull is the chosen path, but legal review needed before launch.
- "What others are wearing" identifiability — currently specced as opt-in identified, with a privacy toggle in `You → Privacy → Discoverability`.
- Men's/unisex branding — architecture supports it, naming does not.
