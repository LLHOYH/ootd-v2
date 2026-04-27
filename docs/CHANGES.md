# Mei — design changeset 01

> **Hand this file to Claude Code.** It documents one focused change to the navigation structure. SPEC.md and mockup.html have already been updated to match.

## TL;DR

Stella is no longer a separate raised-center tab. She lives as a permanently-pinned thread at the top of the **Chats** tab, treated as a normal chat conversation.

The nav now has **5 flat tabs**:

```
┌──────────────────────────────────────────────────┐
│  Today  │  Closet  │  Friends  │  Chats  │  You  │
└──────────────────────────────────────────────────┘
```

Friends has been promoted from a module-inside-Chats to its own top-level tab.

## Why

Stella *is* a chat. The raised center button signaled "AI is the hero" but at the cost of forcing a separate destination for what is structurally already a chat thread. Treating her as a pinned thread keeps the mental model consistent — whether the user is talking to Stella, a friend, or a hangout group, it's all in Chats.

Friends gets its own tab because it's a destination users will look for by name, and Mei's social hook (the OOTD feed and hangout coordination) deserves a top-level slot.

## What changed in SPEC.md

| Section | Change |
|---|---|
| **§2.1 Tab bar** | Diagram updated to 5 flat tabs. Removed "raised pink CTA" language. New rationale paragraph. |
| **§2.2 Screen inventory** | Stella's row now reads `Tab: Chats`, `Type: push (chat detail)`. Friends feed row reads `Tab: Friends`, `Type: tab root`. Mockup labels updated to match the new `01-15` numbering in mockup.html. |
| **§2.3 Modal vs push** | Stella moved from modal list to push list (she's a chat detail, like any other chat thread). |
| **§5.5 Component primitives** | `BottomNav` description updated: "5 flat tabs (Today, Closet, Friends, Chats, You)" — no center button. |
| **§10.5 Stella chat** | Route changed from `/stella` to `/chat/stella`. Type changed from modal to push. Bottom-nav active state is now Chats. New "other entry points" subsection (Today's "Try another" link, `✨ Ask Stella` chip on Chats inbox, Hangout group view). |
| **§10.6 Chats inbox** | Removed reference to optional Friends-feed module at top. Stella row description expanded: pinned, cannot be unpinned, `type: 'STELLA'` thread, auto-created on signup. New `✨ Ask Stella` quick-action chip below the header. |
| **§10.8 Friends feed** | Promoted to tab root. Route changed from `/friends` to `/(tabs)/friends`. Type changed from push to tab root. |
| **§13.1 Build plan** | Frontend bullet updated to "BottomNav with 5 flat tabs (Today, Closet, Friends, Chats, You — no raised center)". |
| **§14 Open questions** | OQ-1 ("Friends as tab vs inside Chats") resolved. |

## What changed in mockup.html

- Bottom nav block on **all 15 screens** rebuilt: Today · Closet · Friends · Chats · You. No center-raised button.
- Active tab indicator updated per screen (e.g. Stella now shows Chats active, Friends feed shows Friends active).
- Removed orphaned `.nv-center` CSS rule.
- Friends tab uses the `i-users` icon. Chats tab keeps `i-comment`.
- Updated copy in the Stella mockup description (no longer says "raised center tab").

## What did NOT change

- The Stella **chat detail screen layout** is identical. Same bubbles, same composer, same quick-reply chips. Only its entry point changed.
- The Chats inbox screen layout is materially the same — Stella was already pinned at the top in the old design.
- Token files (`tokens.ts`) — no token changes.
- Data model — `ChatThread.type` already includes `'STELLA'`; nothing to migrate.
- All other screens, all other flows.

## Implementation notes for Claude Code

If you've already started building, here's what to touch:

### Routing (Expo Router)

Old structure (if you started this way):
```
app/
├── (tabs)/
│   ├── today.tsx
│   ├── closet.tsx
│   ├── chats.tsx
│   └── you.tsx
├── stella.tsx       ← DELETE this route
```

New structure:
```
app/
├── (tabs)/
│   ├── today.tsx
│   ├── closet.tsx
│   ├── friends.tsx  ← NEW tab root (move Friends feed here)
│   ├── chats.tsx
│   └── you.tsx
├── chat/
│   ├── [id].tsx     ← regular chat detail
│   └── stella.tsx   ← Stella's chat detail (or just a special-cased [id])
```

Recommendation: don't make Stella a special route. Use `chat/[id].tsx` and let `id === 'stella'` (or her thread ID) do its own thing inside that screen — same UI shell, different message-fetching logic. One screen, two behaviors.

### BottomNav component

```tsx
const TABS = [
  { route: '/today',   label: 'Today',   icon: HomeIcon },
  { route: '/closet',  label: 'Closet',  icon: HangerIcon },
  { route: '/friends', label: 'Friends', icon: UsersIcon },
  { route: '/chats',   label: 'Chats',   icon: CommentIcon },
  { route: '/you',     label: 'You',     icon: UserIcon },
];
```

No `centerCta` prop, no special-case rendering for the third tab. Five identical tabs, evenly spaced.

### Chats inbox

The pinned Stella row stays. Add a `✨ Ask Stella` quick-action chip immediately below the "Chats" header — full-width pill, pink fill, 36pt tall. Tap navigates to `/chat/stella`. Hide the chip if Stella's row already shows an unread indicator (the unread dot is the affordance).

### Stella thread bootstrap

When a user signs up, server-side: create a `ChatThread` row with `type: 'STELLA'`, `participantIds: [userId]`, pinned by default. So when the user opens Chats for the first time, Stella is already there.

### Entry points to update

Anywhere your code currently navigates to `/stella` (the old modal route), change to `/chat/stella`:

- Today screen → "Try another →" on Today's pick
- Today screen → tap on calendar event card (Stella opens with occasion pre-filled)
- Hangout group → "Wear this" on Stella's suggestion card
- Friends feed → "Coordinate ↗" on a friend's OOTD post
- Chats inbox → `✨ Ask Stella` quick-action chip
- Chats inbox → Stella's pinned thread row

### Test checklist

- [ ] Opening the app shows 5 flat tabs, no center pink button.
- [ ] Tapping Friends shows the feed (formerly inside Chats).
- [ ] Tapping Chats shows Stella pinned at top with sparkle avatar.
- [ ] Tapping Stella opens her chat detail (slide-from-right push, not slide-up modal).
- [ ] Bottom nav stays visible on Stella's chat detail with Chats highlighted.
- [ ] All other entry points to Stella (Today, Hangouts, Coordinate) route to `/chat/stella`.

## Files updated

- `SPEC.md` — surgical edits per the table above.
- `mockup.html` — all 15 screens.

`README.md` and `tokens.ts` are unchanged.
