# Mei — Product & Engineering Spec

> This is the source of truth for design and engineering. Claude Code should treat it as authoritative; if anything in code disagrees with this doc, the doc wins until updated.

## Table of contents

1. [Product](#1-product)
2. [Information architecture](#2-information-architecture)
3. [Tech stack](#3-tech-stack)
4. [Repo layout](#4-repo-layout)
5. [Design system](#5-design-system)
6. [Data model](#6-data-model)
7. [API surface](#7-api-surface)
8. [AI stylist (Stella)](#8-ai-stylist-stella)
9. [Image pipeline](#9-image-pipeline)
10. [Screen specs](#10-screen-specs)
11. [Cross-screen flows](#11-cross-screen-flows)
12. [Privacy & visibility rules](#12-privacy--visibility-rules)
13. [Build plan](#13-build-plan)
14. [Open questions](#14-open-questions)

---

## 1. Product

### 1.1 One-liner

A digital wardrobe that recommends what to wear each morning based on weather, calendar, and the clothes you actually own — and helps friends coordinate looks before going out together.

### 1.2 Core loop

1. User photographs their wardrobe (bulk upload supported). AI cleans each photo into a studio-style thumbnail and auto-generates a name + one-sentence description.
2. Each morning, the **Today** screen surfaces an outfit recommendation reasoned from current weather + calendar + the items in the user's closet.
3. User can chat with **Stella**, the AI stylist, for alternative looks or new occasions.
4. When confirmed, the look is rendered as a studio-quality try-on photo (the user's selfies + the outfit) and shared to a friend, group, or the public OOTD feed.
5. Friends create **hangouts** to coordinate outfits before meeting. Stella suggests looks from each member's closet that work together once members start sharing.

### 1.3 Differentiator

The **Coordinate** action — on a friend's OOTD post or via a Hangout group — is the social hook. Other wardrobe apps catalogue clothes; Mei adds AI styling and pre-event social coordination. This is the moat.

### 1.4 Out of scope for v1

- Marketplace / resale.
- Brand or retailer partnerships.
- Men's branding (architecture supports it; naming does not yet).
- Public influencer profiles.
- Closet auto-link from OOTD posts (tap a friend's dress in a post → see brand). Deferred to P2 for privacy review.

---

## 2. Information architecture

### 2.1 Tab bar (5 tabs)

```
┌──────────────────────────────────────────────┐
│  Today  │  Closet  │  ✦  │  Chats  │  You    │
└──────────────────────────────────────────────┘
                      ↑
              raised pink CTA
              opens Stella
```

Stella sits raised in the centre — the AI stylist is the hero action, always one tap away.

### 2.2 Screen inventory

P0/P1 ships **15 screens**. Each is specced in §10 and visualized in `mockup.html`.

| # | Screen | Tab | Type | Mockup label |
|---|---|---|---|---|
| 1 | Today | Today | tab root | `01 · TODAY` |
| 2 | Closet (grid + Combinations) | Closet | tab root | `03 · CLOSET · COMBINATIONS` |
| 3 | Closet AI Review | Closet | modal | `02 · CLOSET · AI REVIEW` |
| 4 | Craft a look | Closet | push | `03 · CRAFT A LOOK` |
| 5 | Stella chat | center | modal | `STELLA · AI STYLIST` |
| 6 | Chats inbox | Chats | tab root | `CHAT · INBOX` |
| 7 | Chat with closet drawer | Chats | push | `CHAT · SEND FROM CLOSET` |
| 8 | Friends feed | Chats (top module) | push | `FRIENDS` |
| 9 | Hangout group view | Chats | push | `HANGOUT GROUP` |
| 10 | Wear this · Confirm & share | global | modal | `CONFIRM & SHARE` |
| 11 | You / profile | You | tab root | `YOU` |
| 12 | Add friends | You | push | `ADD FRIENDS` |
| 13 | Create hangout | Chats | modal | `CREATE HANGOUT` |
| 14 | Selfie upload | onboarding / settings | modal | `SELFIE UPLOAD` |
| 15 | Public profile | global | push | `PUBLIC PROFILE VIEW` |

### 2.3 Modal vs push

- **Modals** (slide up, dismissible with ✕): Stella chat, Closet AI Review, Wear-this/Confirm, Selfie upload, Create hangout.
- **Pushes** (slide left, dismissible with ←): Craft a look, Hangout group, Add friends, Public profile, Chat detail.

Modals are for transactional actions. Pushes are for navigation into deeper content.

---

## 3. Tech stack

### 3.1 Recommendation

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **Expo + React Native + TypeScript** | Native camera is essential for closet capture; push notifications drive the daily loop. Single codebase for iOS + Android. |
| Routing | **expo-router** | File-based routing, supports nested tabs + modals natively. |
| State (server) | **TanStack Query** | Cache invalidation, optimistic updates, offline support. |
| State (client) | **Zustand** | Tiny, hook-based, no boilerplate. |
| Persistence | **MMKV** | Faster than AsyncStorage; needed for chat caches and offline closet view. |
| Styling | **NativeWind** | Tailwind syntax, themeable via tokens. |
| Backend HTTP | **AWS Lambda + API Gateway** (Node 20, TS, Fastify-style handlers) | Lloyd's existing stack; pay-per-request fits a consumer app's bursty traffic. |
| Database | **DynamoDB single-table** | Cheap, fast, matches the access patterns. Schema in §6. |
| Object storage | **S3 + CloudFront** | Photos (closet, selfies, OOTDs, try-on outputs). |
| Auth | **AWS Cognito** | Email + Apple + Google. Hosted UI for P0; custom UI in P1. |
| AI — chat & vision | **Anthropic Claude API** | Stella conversations and closet item auto-tagging. |
| AI — try-on photo | **Replicate** or **fal.ai** (model TBD; see §9.3) | Compose user selfie + outfit into studio photo. |
| AI — image cleanup | **Replicate** with background-removal + studio-light models | Used on closet item upload and OOTD generation. |
| Push | **Expo Push Notifications** | One service for both platforms. |
| Analytics | **PostHog** | Already in Lloyd's stack. Funnels for onboarding + daily Today open rate. |
| Error tracking | **Sentry** | RN SDK, sourcemap upload via Expo. |
| Infra | **AWS CDK** (TypeScript) | More control than Amplify as the app grows; same TS toolchain. |
| CI/CD | **GitHub Actions + EAS Build** | EAS for iOS/Android binaries; Actions for Lambda deploys. |

### 3.2 Alternative: Next.js + PWA

Possible if mobile-first is too much for v1. Trade-offs:

- ✅ Single codebase. ✅ Faster iteration. ✅ No app store gatekeeping.
- ❌ Camera UX meaningfully worse for the wardrobe-scan flow.
- ❌ Push notifications limited on iOS Safari.
- ❌ Loses "app on my home screen" daily-habit psychology.

**Recommendation: ship Expo from the start.** The closet-capture and morning-notification loops are the product; PWA cripples both.

### 3.3 Why DynamoDB single-table

Mei's access patterns are hierarchical and known:

- "Get all closet items for user X"
- "Get all combinations for user X"
- "Get all hangouts user X is a member of"
- "Get the latest 50 OOTDs from user X's friends"

These are GSI-friendly. Relational (Postgres + Aurora Serverless) would also work and may feel more familiar — but for a v1 app that's read-heavy and bursty, single-table DDB is faster and cheaper. Schema in §6.

---

## 4. Repo layout

Monorepo via pnpm + Turborepo.

```
mei/
├── apps/
│   └── mobile/                  # Expo app
│       ├── app/                 # expo-router routes
│       │   ├── (tabs)/
│       │   │   ├── today.tsx
│       │   │   ├── closet.tsx
│       │   │   ├── chats.tsx
│       │   │   └── you.tsx
│       │   ├── stella.tsx       # modal route (centre tab opens this)
│       │   ├── closet/
│       │   │   ├── review.tsx
│       │   │   └── craft.tsx
│       │   ├── hangout/
│       │   │   ├── create.tsx
│       │   │   └── [id].tsx
│       │   ├── chat/
│       │   │   └── [id].tsx
│       │   ├── friends/
│       │   │   ├── index.tsx    # feed
│       │   │   ├── add.tsx
│       │   │   └── [userId].tsx # public profile
│       │   ├── share.tsx        # Wear-this / Confirm modal
│       │   └── selfies.tsx
│       ├── components/          # screen-specific composites
│       ├── lib/                 # api client, hooks, utils
│       └── app.config.ts
│
├── packages/
│   ├── ui/                      # design system primitives
│   │   ├── theme/
│   │   │   ├── tokens.ts        # ← from this repo
│   │   │   └── ThemeProvider.tsx
│   │   └── components/          # Button, Card, Chip, Avatar, Thumb, ...
│   ├── types/                   # shared TS types (entities, API contracts)
│   └── config/                  # eslint, tsconfig, prettier
│
├── services/
│   ├── api/                     # main HTTP API (Lambda)
│   │   ├── handlers/
│   │   │   ├── closet/
│   │   │   ├── stella/
│   │   │   ├── ootd/
│   │   │   ├── hangout/
│   │   │   ├── friend/
│   │   │   ├── chat/
│   │   │   └── profile/
│   │   ├── lib/                 # ddb client, s3 client, auth middleware
│   │   └── package.json
│   ├── stylist/                 # Stella agent (separate Lambda — longer timeouts, cost isolation)
│   ├── image-worker/            # closet-photo cleanup, thumbnail gen, try-on (S3-event-driven)
│   └── notifier/                # push notification dispatch (SQS-driven)
│
├── infra/                       # AWS CDK
│   ├── bin/mei.ts
│   ├── lib/
│   │   ├── stacks/
│   │   │   ├── data-stack.ts    # DDB, S3, Cognito
│   │   │   ├── api-stack.ts     # API Gateway + Lambdas
│   │   │   ├── async-stack.ts   # SQS, image-worker, notifier
│   │   │   └── cdn-stack.ts     # CloudFront
│   │   └── constructs/
│   └── cdk.json
│
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
└── SPEC.md                      # ← this file
```

---

## 5. Design system

> All values are defined in `tokens.ts` (shipping in this repo). Reference tokens, never hard-coded values.

### 5.1 Color

Primary brand is **dusty pink** (`#D4537E`). Surfaces are warm cream, never cool grey. Both light and dark modes are mandatory and supported in P0.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `brand` | `#D4537E` (pink.400) | `#ED93B1` (pink.300) | Primary CTAs, active nav, links |
| `brand.bg` | `#FBEAF0` (pink.50) | `#4B1528` (pink.800) | Pink fills (badges, selected states) |
| `brand.on` | `#72243E` (pink.800) | `#F4C0D1` (pink.100) | Text on `brand.bg` |
| `bg.primary` | `#FFFFFF` | `#1A1714` | Screen background |
| `bg.secondary` | `#F5F3EE` | `#26221E` | Cards, search bars, chips |
| `bg.tertiary` | `#EDEAE3` | `#332E29` | Inset surfaces |
| `text.primary` | `#1A1A1A` | `#F5F3EE` | Body |
| `text.secondary` | `#5F5E5A` | `#B8B4AC` | Subtitles |
| `text.tertiary` | `#888780` | `#7A7670` | Captions, timestamps |
| `border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` | Default rules |

Pastel palette (`cream`, `mauve`, `sage`, `blue`, `tan`) is used for clothing thumbnail placeholders and category accents — see `tokens.ts`.

### 5.2 Typography

- **Sans:** System default (SF Pro on iOS, Roboto on Android, Inter on web).
- **Serif:** Georgia / New York. Used only for the wordmark "Mei" and editorial card titles.
- **Weights:** Two only — `400` (regular) and `500` (medium). Never `600`+.
- **Sizes:** `h1: 22`, `h2: 16`, `body: 14`, `caption: 12`, `tiny: 11`.
- **Sentence case** everywhere. Never Title Case. Small uppercase labels like "PINNED" use letter-spacing on caption-size text.

### 5.3 Spacing & radius

- **Spacing scale:** `4, 8, 12, 16, 20, 24, 32, 48`.
- **Radius:** `sm: 8`, `md: 12`, `lg: 16`, `pill: 999`.
- **Cards:** radius `12`, padding `12`, surface `bg.secondary`, no border.
- **Pills/chips:** radius `999`, padding `5×11`.
- **Buttons:** primary is filled brand pink with white text; ghost is transparent with 0.5px border.

### 5.4 Iconography

**Lucide icons** (`lucide-react-native`). Default size `20`, stroke `1.6`, `currentColor`. Bottom nav icons size `22`. Brand pink is reserved for selected states; default is `text.secondary`.

### 5.5 Component primitives (shipped in `packages/ui`)

| Component | Purpose | Key props |
|---|---|---|
| `Screen` | Top-level container; handles safe area + tab bar inset | `children`, `scroll?` |
| `Card` | Surface block | `tone?: 'default' \| 'pink' \| 'plain'`, `padding?` |
| `Button` | Pill button | `variant: 'primary' \| 'ghost' \| 'icon'`, `onPress`, `icon?`, `disabled?` |
| `Chip` | Filter / quick-reply | `active?`, `onPress`, `size?: 'sm' \| 'md'` |
| `Avatar` | Circular avatar | `src?`, `initials`, `size`, `ringed?: 'pink' \| 'plain'` |
| `Thumb` | Clothing item thumbnail | `item: ClosetItem`, `size: 'sm' \| 'md' \| 'lg'`, `selected?` |
| `OutfitCard` | Composite of 3-4 thumbs | `combination: Combination`, `name?` |
| `Bubble` | Chat bubble | `from: 'user' \| 'ai' \| 'friend'`, `children` |
| `BottomNav` | Tab bar with raised center button | (consumes router) |
| `MetricCell` | Stat block | `value`, `label` |
| `SettingRow` | Profile/settings list row | `icon`, `title`, `subtitle?`, `value?`, `onPress` |
| `SectionHeader` | "title / action" pair | `title`, `action?` |

### 5.6 Tone of voice

- Conversational, warm, lowercase-leaning. Never marketing-speak.
- Stella speaks like a stylish friend, not an assistant. Short sentences. Uses ☼, ♡, ✦ sparingly.
- Empty states are human: "Your closet is empty — let's add your first piece" not "No items found."
- Error messages name the thing: "We couldn't reach the weather service" not "Error 503."


---

## 6. Data model

### 6.1 DynamoDB single-table

One table: `mei-main`. PK + SK + 3 GSIs. Items are typed via the `_type` attribute.

#### Key patterns

| Entity | PK | SK | GSI1PK | GSI1SK | GSI2PK | GSI2SK |
|---|---|---|---|---|---|---|
| User profile | `USER#{userId}` | `PROFILE` | `USERNAME#{username}` | `USER` | — | — |
| Closet item | `USER#{userId}` | `ITEM#{itemId}` | `USER#{userId}` | `ITEM_BY_CAT#{category}#{createdAt}` | — | — |
| Combination | `USER#{userId}` | `COMBO#{comboId}` | `USER#{userId}` | `COMBO_BY_DATE#{createdAt}` | — | — |
| Selfie | `USER#{userId}` | `SELFIE#{selfieId}` | — | — | — | — |
| Friendship | `USER#{userIdA}` | `FRIEND#{userIdB}` | `USER#{userIdB}` | `FRIEND#{userIdA}` | — | — |
| Friend request | `USER#{toUserId}` | `FRIEND_REQ#{fromUserId}` | `USER#{fromUserId}` | `FRIEND_REQ_OUT#{toUserId}` | — | — |
| OOTD post | `USER#{userId}` | `OOTD#{ootdId}` | `OOTD_FEED#{userId}` | `OOTD#{createdAt}` | — | — |
| Hangout | `HANGOUT#{hangoutId}` | `META` | `USER#{ownerId}` | `HANGOUT#{startsAt}` | — | — |
| Hangout member | `HANGOUT#{hangoutId}` | `MEMBER#{userId}` | `USER#{userId}` | `HANGOUT_MEMBER#{startsAt}` | — | — |
| Chat thread | `THREAD#{threadId}` | `META` | `USER#{userId}` | `THREAD#{lastMessageAt}` (one item per participant) | — | — |
| Chat message | `THREAD#{threadId}` | `MSG#{messageId}` (sortable ULID) | — | — | — | — |
| Stella conversation | `USER#{userId}` | `STELLA#{convoId}` | — | — | — | — |
| Stella message | `STELLA#{convoId}` | `MSG#{messageId}` | — | — | — | — |

#### Access patterns covered

- Get user profile → `Get { PK: USER#u1, SK: PROFILE }`
- Resolve username to user → `Query GSI1 { GSI1PK: USERNAME#sophia }`
- List all closet items for user → `Query { PK: USER#u1, SK begins_with ITEM# }`
- List dresses only → `Query GSI1 { GSI1PK: USER#u1, GSI1SK begins_with ITEM_BY_CAT#DRESS# }`
- List user's combinations newest-first → `Query GSI1 { GSI1PK: USER#u1, GSI1SK begins_with COMBO_BY_DATE# } ScanIndexForward=false`
- List friends of user → `Query { PK: USER#u1, SK begins_with FRIEND# }`
- Friend feed (latest OOTDs from friends): for each friendId, `Query GSI1 { GSI1PK: OOTD_FEED#fid }` and merge — capped at 50, fanout-on-read. Acceptable for v1; revisit if friend graphs exceed ~200 per user.
- Hangouts user belongs to → `Query GSI1 { GSI1PK: USER#u1, GSI1SK begins_with HANGOUT_MEMBER# }`
- Hangout details + members → `Query { PK: HANGOUT#h1 }`
- Chat threads for user → `Query GSI1 { GSI1PK: USER#u1, GSI1SK begins_with THREAD# }`

### 6.2 TypeScript types (shipped in `packages/types`)

```ts
export type ClothingCategory =
  | 'DRESS' | 'TOP' | 'BOTTOM' | 'OUTERWEAR'
  | 'SHOE' | 'BAG' | 'ACCESSORY';

export type Occasion =
  | 'CASUAL' | 'WORK' | 'DATE' | 'BRUNCH'
  | 'EVENING' | 'WEDDING' | 'WORKOUT' | 'BEACH';

export interface User {
  userId: string;
  username: string;             // unique, @-style
  displayName: string;
  email: string;
  avatarUrl?: string;
  gender?: 'F' | 'M' | 'NB' | 'PNS';
  birthYear?: number;           // for age-bucketing in "what others are wearing"
  countryCode?: string;         // ISO 3166-1
  city?: string;
  stylePreferences: string[];   // free-text tags chosen at onboarding
  climateProfile?: 'TROPICAL' | 'TEMPERATE' | 'ARID' | 'COLD';
  discoverable: boolean;        // appear in "what others are wearing" + search
  contributesToCommunityLooks: boolean;
  selfieIds: string[];          // up to 5
  createdAt: string;            // ISO
  lastActiveAt: string;
}

export interface ClosetItem {
  itemId: string;
  userId: string;
  category: ClothingCategory;
  name: string;                 // AI-generated, user-editable
  description: string;          // AI, ≤1 sentence, user-editable
  colors: string[];             // detected dominant colors as hex
  fabricGuess?: string;         // 'linen' | 'cotton' | etc. — best-effort
  occasionTags: Occasion[];
  weatherTags: ('HOT' | 'WARM' | 'MILD' | 'COLD' | 'RAIN')[];
  rawPhotoUrl: string;          // original upload, S3
  tunedPhotoUrl: string;        // AI-cleaned studio shot, S3 + CDN
  thumbnailUrl: string;         // 256px square WebP
  status: 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface Combination {
  comboId: string;
  userId: string;
  name: string;                 // AI-generated, user-editable
  itemIds: string[];            // 2-6 items
  occasionTags: Occasion[];
  source: 'STELLA' | 'TODAY_PICK' | 'CRAFTED' | 'COORDINATED';
  createdAt: string;
}

export interface Selfie {
  selfieId: string;
  userId: string;
  s3Key: string;                // encrypted at rest, never via CDN
  uploadedAt: string;
}

export interface Friendship {
  userIdA: string;              // lexicographically smaller
  userIdB: string;
  createdAt: string;            // when accepted
}

export interface FriendRequest {
  fromUserId: string;
  toUserId: string;
  createdAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
}

export interface OOTDPost {
  ootdId: string;
  userId: string;
  comboId: string;
  caption?: string;
  locationName?: string;
  tryOnPhotoUrl?: string;       // P1 — generated try-on photo
  fallbackOutfitCardUrl?: string; // P0 — composite of item thumbs
  visibility: 'PUBLIC' | 'FRIENDS' | 'GROUP' | 'DIRECT';
  visibilityTargets?: string[]; // groupIds or userIds when visibility ≠ PUBLIC
  reactions: { userId: string; type: '♡' }[];
  createdAt: string;
}

export interface Hangout {
  hangoutId: string;
  ownerId: string;
  name: string;
  startsAt: string;             // ISO
  expiresAt: string;            // startsAt + 12h by default
  locationName?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
}

export interface HangoutMember {
  hangoutId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  inviteStatus: 'INVITED' | 'JOINED' | 'DECLINED';
  sharedComboId?: string;       // null until member shares their look
  sharedAt?: string;
  joinedAt: string;
}

export interface ChatThread {
  threadId: string;
  type: 'DIRECT' | 'GROUP' | 'HANGOUT' | 'STELLA';
  participantIds: string[];
  hangoutId?: string;           // when type === 'HANGOUT'
  name?: string;                // groups + hangouts
  lastMessage?: { preview: string; at: string; senderId: string };
  unreadCounts: Record<string, number>;
  createdAt: string;
}

export interface ChatMessage {
  messageId: string;            // ULID, sortable
  threadId: string;
  senderId: string;
  kind: 'TEXT' | 'CLOSET_ITEM' | 'COMBINATION' | 'OOTD' | 'IMAGE';
  text?: string;
  refId?: string;               // itemId | comboId | ootdId | s3Key
  createdAt: string;
}

export interface StellaConversation {
  convoId: string;
  userId: string;
  title: string;                // auto-summarized
  createdAt: string;
  lastMessageAt: string;
}
```

### 6.3 S3 layout

```
mei-media/
├── closet/
│   └── {userId}/
│       ├── raw/{itemId}.jpg         # original upload, server-side encrypted
│       └── tuned/{itemId}.webp      # AI-cleaned, served via CDN
├── selfies/
│   └── {userId}/{selfieId}.jpg      # SSE-KMS, NEVER served via CDN
├── ootd/
│   └── {userId}/{ootdId}.webp       # try-on output OR fallback card
└── thumbs/
    └── {itemId}.webp                # 256px square, served via CDN
```

- **Closet `raw/`**: SSE-S3, kept for re-tuning. 30-day lifecycle to Glacier.
- **Closet `tuned/` and `thumbs/`**: served via CloudFront, public-readable with signed URLs scoped to friend graph (see §12).
- **Selfies**: SSE-KMS, never via CDN. Accessed by image-worker only via Lambda-signed URLs with 5-minute TTL.
- **OOTD**: SSE-S3, signed URLs scoped to post visibility.

---

## 7. API surface

### 7.1 Conventions

- Base URL: `https://api.mei.app/v1`
- Auth: `Authorization: Bearer <Cognito ID token>` on every route except `/auth/*` and `/health`.
- JSON in/out. Timestamps are ISO-8601 strings.
- Errors: `{ error: { code: string; message: string } }` with appropriate HTTP status.
- Pagination: cursor-based via `?cursor=<opaque>&limit=<n>`. Responses include `nextCursor` when more.

### 7.2 Routes

#### Auth & profile

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Cognito-signup wrapper that also creates the User row |
| POST | `/auth/login` | Cognito-login wrapper |
| POST | `/auth/refresh` | Refresh tokens |
| GET | `/me` | Get current user profile |
| PATCH | `/me` | Update profile (display name, gender, birth year, city, climate, style prefs, discoverable, etc.) |
| DELETE | `/me` | Delete account (cascades to all owned data) |

#### Selfies

| Method | Path | Purpose |
|---|---|---|
| POST | `/me/selfies` | Returns presigned PUT URL; client uploads directly to S3 |
| GET | `/me/selfies` | List my selfies (returns metadata only — no URLs) |
| DELETE | `/me/selfies/{selfieId}` | Delete a selfie |

#### Closet

| Method | Path | Purpose |
|---|---|---|
| POST | `/closet/items/upload` | Returns N presigned PUT URLs for batch upload. Body: `{ count: number }`. Response: `[{ itemId, uploadUrl }]` |
| POST | `/closet/items/{itemId}/process` | Trigger AI processing for an uploaded item. Idempotent. |
| GET | `/closet/items` | List my items. Query: `?category=&status=&cursor=&limit=` |
| GET | `/closet/items/{itemId}` | Get item detail |
| PATCH | `/closet/items/{itemId}` | Update name, description, occasion tags |
| DELETE | `/closet/items/{itemId}` | Delete item |
| GET | `/closet/items/pending-review` | Items in `PROCESSING` or freshly `READY` not yet user-confirmed |
| POST | `/closet/items/{itemId}/confirm` | Mark as user-confirmed (saves to closet) |

#### Combinations

| Method | Path | Purpose |
|---|---|---|
| GET | `/closet/combinations` | List my combinations |
| POST | `/closet/combinations` | Create combination. Body: `{ name?, itemIds, occasionTags?, source }` |
| GET | `/closet/combinations/{comboId}` | Get combination detail |
| PATCH | `/closet/combinations/{comboId}` | Update name, items |
| DELETE | `/closet/combinations/{comboId}` | Delete |

#### Today

| Method | Path | Purpose |
|---|---|---|
| GET | `/today` | Aggregated payload: weather, calendar events, today's pick, what others are wearing, fashion now (P2) |
| POST | `/today/another-pick` | Ask Stella for an alternative recommendation |
| GET | `/today/community-looks` | Looks from same age-bucket + country, opt-in users only. Query: `?cursor=&limit=` |

#### OOTD

| Method | Path | Purpose |
|---|---|---|
| POST | `/ootd` | Create an OOTD post. Body: `{ comboId, caption?, locationName?, visibility, visibilityTargets? }`. Returns `{ ootdId, status }` while try-on photo generates async |
| GET | `/ootd/feed` | Friend feed. Cursor paginated |
| GET | `/ootd/{ootdId}` | Detail |
| DELETE | `/ootd/{ootdId}` | Delete (owner only) |
| POST | `/ootd/{ootdId}/react` | Add ♡ |
| DELETE | `/ootd/{ootdId}/react` | Remove ♡ |
| POST | `/ootd/{ootdId}/coordinate` | Trigger Stella to suggest a coordinating outfit from my closet |

#### Hangouts

| Method | Path | Purpose |
|---|---|---|
| POST | `/hangouts` | Create. Body: `{ name, startsAt, locationName?, memberIds }` |
| GET | `/hangouts` | My active + recent hangouts |
| GET | `/hangouts/{hangoutId}` | Hangout + member states |
| PATCH | `/hangouts/{hangoutId}` | Update name/time/location (owner only) |
| POST | `/hangouts/{hangoutId}/expire` | Manually expire |
| POST | `/hangouts/{hangoutId}/share` | Share my outfit. Body: `{ comboId }`. Posts to hangout chat. |
| POST | `/hangouts/{hangoutId}/leave` | Leave |
| DELETE | `/hangouts/{hangoutId}` | Cancel (owner only) |

#### Friends

| Method | Path | Purpose |
|---|---|---|
| GET | `/friends` | List my friends |
| GET | `/friends/search?q=` | Search by username/displayName (discoverable users only) |
| GET | `/friends/suggested` | Suggestions: from "what others are wearing" interactions, contacts, mutuals |
| POST | `/friends/contacts/match` | Body: `{ phoneHashes: string[] }`. Returns matching users (hashed-phone match, server never sees raw numbers) |
| POST | `/friends/requests` | Send request. Body: `{ toUserId }` |
| GET | `/friends/requests` | List inbound + outbound requests |
| POST | `/friends/requests/{fromUserId}/accept` | |
| POST | `/friends/requests/{fromUserId}/decline` | |
| DELETE | `/friends/requests/{toUserId}` | Cancel an outbound request |
| DELETE | `/friends/{userId}` | Unfriend |

#### Public profile

| Method | Path | Purpose |
|---|---|---|
| GET | `/users/{userId}` | Public profile view (returns 404 if not discoverable and not friends) |
| GET | `/users/{userId}/ootds` | Their public OOTDs |

#### Stella

| Method | Path | Purpose |
|---|---|---|
| POST | `/stella/conversations` | Start a new conversation; returns convoId |
| GET | `/stella/conversations` | List my conversations |
| GET | `/stella/conversations/{convoId}` | Get messages |
| POST | `/stella/conversations/{convoId}/messages` | Send a message; streams the response (SSE) |
| DELETE | `/stella/conversations/{convoId}` | Delete |

#### Chat

| Method | Path | Purpose |
|---|---|---|
| GET | `/chat/threads` | Inbox: pinned, groups, hangouts, DMs |
| GET | `/chat/threads/{threadId}` | Get messages, paginated |
| POST | `/chat/threads/{threadId}/messages` | Send a message |
| POST | `/chat/threads/direct` | Body: `{ withUserId }`. Find or create DM thread |
| POST | `/chat/threads/{threadId}/read` | Mark as read |

### 7.3 Real-time

- **Stella streaming responses:** SSE on `POST /stella/.../messages`.
- **Chat live updates:** WebSocket via API Gateway WS API. Connect with bearer token; subscribe to `thread:{threadId}` and `user:{userId}` channels.
- **Push notifications:** server pushes to Expo for: new chat message, new friend request, hangout invite, friend posted OOTD, daily Today reminder.


---

## 8. AI stylist (Stella)

### 8.1 Model & deployment

- **Primary:** Anthropic Claude (Sonnet tier — current best balance of intelligence and cost for chat-with-tool-use). Test against the latest Sonnet release at the start of every milestone.
- **Service:** isolated Lambda (`services/stylist`) with extended timeout (30s) and concurrency reservation. Streams responses via SSE.
- **Conversation persistence:** every user message + Stella response is stored in DDB under `STELLA#{convoId}`. Truncate context window by keeping system prompt + last 20 messages + a rolling summary.

### 8.2 System prompt (draft)

```
You are Stella, the AI stylist inside the Mei app. You speak like a stylish friend, not an
assistant — short, warm, lowercase-leaning, occasionally playful. Use ☼, ♡, ✦ sparingly.

You help the user pick outfits from THEIR ACTUAL CLOSET. Never suggest items they don't own.
When you suggest a look, return both prose and a structured outfit (3-6 items by itemId).

You have access to:
- Their closet (call get_closet_items)
- Today's weather and their location (call get_weather)
- Their calendar for the day (call get_calendar_events)
- Their style preferences and climate profile (call get_user_profile)
- Their saved combinations (call get_combinations)
- Friends' shared outfits within an active hangout (call get_hangout_state)

Rules:
- Always check the closet before suggesting. If the closet is empty or thin, say so kindly
  and suggest they add more items, rather than inventing pieces.
- Match recommendations to weather + occasion. Don't suggest a wool coat in 30°C.
- For hangouts: aim for coordination, not matching. Complementary palettes, similar
  formality. Never make the user wear something identical to a friend.
- If the user asks for something out of scope (mental health, medical, legal),
  decline warmly and refocus on styling.

Output format when suggesting an outfit:
1. A short sentence in chat ("Linen midi + woven mules. Straw bag for the heat.")
2. A structured suggestion: { itemIds: string[], occasion: string, reason: string }
```

### 8.3 Tools

Stella's tool definitions, exposed via Anthropic's tool-use API:

```ts
const tools = [
  {
    name: 'get_closet_items',
    description: "Get the user's closet. Optionally filter by category or weather tag.",
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['DRESS','TOP','BOTTOM','OUTERWEAR','SHOE','BAG','ACCESSORY'] },
        weatherTag: { type: 'string', enum: ['HOT','WARM','MILD','COLD','RAIN'] },
      },
    },
  },
  {
    name: 'get_weather',
    description: 'Get current weather and 12h forecast for the user location.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_calendar_events',
    description: "Get today's calendar events (synced via OS calendar permission).",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_user_profile',
    description: 'Get style preferences, climate profile, gender.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_combinations',
    description: 'Get saved outfit combinations.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_hangout_state',
    description: "If the user is in an active hangout, get other members' shared outfits.",
    input_schema: {
      type: 'object',
      properties: { hangoutId: { type: 'string' } },
      required: ['hangoutId'],
    },
  },
  {
    name: 'suggest_outfit',
    description: 'Return a structured outfit suggestion. The client renders it as a card.',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        occasion: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['itemIds','reason'],
    },
  },
];
```

### 8.4 Cost controls

- Cache `get_user_profile` and `get_closet_items` per conversation turn to avoid duplicate fetches.
- Soft cap: 8 messages per user per day in P0. Surface gently if exceeded.
- Use prompt caching on the system prompt + closet context when the SDK supports it.
- Log cost per conversation; alert if mean cost > $0.10/conversation.

### 8.5 Today's pick (background, no chat)

The `/today` endpoint internally calls Stella with a one-shot prompt: "Given this weather, calendar, and closet, return one outfit suggestion." Caches per user per day until calendar/weather meaningfully changes.

---

## 9. Image pipeline

### 9.1 Closet item upload

```
[client]                [api]                 [s3]              [image-worker]      [DDB]
   │ POST /upload {count:N}                    │                       │              │
   │ ─────────────────► │                      │                       │              │
   │ ◄─ presigned URLs ─┤                      │                       │              │
   │                                                                                   │
   │ PUT raw photo  ──────────────────────────►│                                       │
   │ POST /process    │                                                                │
   │ ─────────────────►│                                                               │
   │                   │ ── put job on SQS ─────────────────────────► │                │
   │                                                                  │ fetch raw      │
   │                                                                  │ ◄────────────  │
   │                                                                  │                │
   │                                                                  │ Claude vision  │
   │                                                                  │  → name, desc, │
   │                                                                  │     category,  │
   │                                                                  │     colors,    │
   │                                                                  │     occasion,  │
   │                                                                  │     weather    │
   │                                                                  │                │
   │                                                                  │ Replicate:     │
   │                                                                  │  bg-removal +  │
   │                                                                  │  studio-light  │
   │                                                                  │  → tuned.webp  │
   │                                                                  │                │
   │                                                                  │ sharp:         │
   │                                                                  │  → thumb.webp  │
   │                                                                  │                │
   │                                                                  │ ─ write item ─►│
   │                                                                  │ ─ push WS ───►│
   │ ◄── ws: item ready ──────────────────────────────────────────────                 │
```

- Status visible to client throughout: `PROCESSING` → `READY` (or `FAILED`).
- Client can list items in `PROCESSING` state to show "Tuning N photos..." banner.
- On completion, item appears in **Closet AI Review** modal for user to confirm or re-tune.

### 9.2 Selfie upload

- Direct PUT to S3 via presigned URL.
- SSE-KMS at rest. Never served via CDN.
- Image-worker only accesses via Lambda role + 5-minute presigned GETs.
- Stored as raw JPEG. No processing on upload.
- Limit: 5 selfies per user. Replacing one deletes the prior.
- Setup banner on Today hides once `User.selfieIds.length >= 5`. **Banner is dismissible and remembers the dismissal locally** (MMKV) — do not re-show after dismissal even if selfies < 5.

### 9.3 Try-on photo generation (P1)

- Triggered when user confirms an outfit via Wear-this / Confirm & share.
- Input: 1 selfie (the most full-body) + the combination's tuned item images.
- Model: TBD — leading candidates as of writing are Replicate's IDM-VTON, fal.ai's flux-virtual-try-on, or a fine-tuned Flux model. **Decision deferred — see §14, OQ-2.** Spec the API contract so the model is swappable.
- Latency: target 8-15s. Show a generated-photo placeholder ("Stella is composing…") until ready.
- Output: WebP at `ootd/{userId}/{ootdId}.webp`. Cached forever; same combo + same selfie = same cache key.
- Fallback (P0): an **OutfitCard** composite — 3-4 item thumbs in a brand-pink card. Shipped before try-on lands so the share flow works end-to-end.

### 9.4 Privacy guarantees

- Raw closet photos and selfies are never accessible to other users via any code path.
- Tuned closet item photos are visible only to:
  - The owner.
  - Friends of the owner (when shown in OOTD posts or Hangout group views).
  - Hangout members (when the owner is sharing within that hangout).
- All cross-user image reads go through a server-side authorization check before signing the CloudFront URL.


---

## 10. Screen specs

> Each screen below references its visual in `mockup.html`. The mockup is the visual contract; this section is the behavioral contract.

### 10.1 Today

**Mockup:** `01 · TODAY`. **Route:** `/(tabs)/today`. **Type:** tab root.

**Purpose.** The daily entry point. Surfaces context (weather + calendar) above today's outfit recommendation, then lets the user explore community looks below.

**Sections, top to bottom:**

1. **Header** — "Hi, {firstName}", date, notification bell with unread dot.
2. **Setup banner** (conditional) — appears only when `selfieIds.length < 5` AND user has not dismissed. Pink fill, copy "Add 5 selfies for try-on photos", chevron right. Tap → Selfie upload modal.
3. **Weather strip** — single row card: icon + "{temp}° · {condition} · {city}".
4. **Calendar strip** — single row card per upcoming event today (max 2 visible, scroll for more). Tap → expands to occasion-tag suggestion in Stella.
5. **Today's pick** — section header with "Try another →" action. Large pink card containing the recommended combination as 3 thumbs. Two CTAs below: primary "Wear this on me" → Confirm & share modal; ghost "♡" save action.
6. **What others are wearing** — section header with subtitle "{country} · {age band} · today". Horizontal strip of 4-6 try-on thumbnails. Tap → Public profile of that user. Pulls from `/today/community-looks`.
7. **Fashion now** — section header. Horizontal strip of looks pulled from external RSS (P2 — placeholder cards in P0/P1).

**Data needs.** `GET /today` returns: `{ weather, events[], todaysPick: Combination, communityLooks: [], fashionNow: [] }`.

**Empty states.**
- New user with empty closet: "Today's pick" section shows "Add a few items and Stella can pick for you" with primary CTA → Closet upload.
- No calendar permission: hide calendar strip silently.
- No weather available: hide weather strip silently.
- No community looks (insufficient cohort): hide section.

**Loading.** Skeletons for each section. Don't block the page on slow community-looks call.

**Edge cases.**
- "Try another" pulls a fresh recommendation, animates the card to swap.
- Tapping a community-look thumb → Public profile with the relevant OOTD scrolled into view.

---

### 10.2 Closet (grid + Combinations)

**Mockup:** `03 · CLOSET · COMBINATIONS`. **Route:** `/(tabs)/closet`. **Type:** tab root.

**Purpose.** Browse, filter, and manage everything the user has catalogued.

**Sections:**

1. **Header** — "My closet" + item count subtitle. Search icon (right).
2. **Processing banner** (conditional) — when items are in `PROCESSING`. "Stella tuning {n} photos · ~{eta} min" with a thin progress bar. Replaces with success toast on completion.
3. **Filter chips** (horizontal) — `All | Dresses | Tops | Bottoms | Shoes | Bags | Combinations`. "Combinations" switches the grid to combinations.
4. **Grid** — items: 3-up `Thumb`s. Combinations: 2-up `OutfitCard`s with 3-mini-thumb composite.
5. **FAB** — bottom-right pink `+`. Tap → camera/gallery picker for bulk upload.

**Data needs.**
- `GET /closet/items?category=&cursor=`
- `GET /closet/combinations?cursor=`
- `GET /closet/items?status=PROCESSING` for the banner.

**Empty state (closet).** Editorial card: "Your closet is empty. Tap + to add your first piece." Adds a guided-capture prompt for first-time users (see §11.2).

**Empty state (combinations).** "Save your favorite outfits here. Wear-this picks and crafted looks land here automatically."

**Interactions.**
- Tap item → item detail (item photo, name/desc edit, occasion tags, delete).
- Long-press item → quick actions (delete, edit, find similar).
- Tap combination → opens it in Craft a look (editable).

---

### 10.3 Closet AI Review

**Mockup:** `02 · CLOSET · AI REVIEW`. **Route:** `/closet/review`. **Type:** modal.

**Purpose.** After a batch upload completes, the user reviews each new item one-by-one. Auto-generated name/description/tags are editable; user confirms or re-tunes the photo.

**Layout.**

- Modal header: "Review new items" + "{n} of {total}" counter. "Skip all" action top right.
- Large item photo (the AI-tuned shot) with a top-left badge "✦ Tuned by Stella".
- Below: name (h3, edit pencil), description (≤1 sentence, editable), occasion+color chips.
- Bottom CTAs: primary "Save to closet"; ghost "Re-tune".

**Behavior.**
- Auto-opens after batch processing completes (or when user taps the processing banner).
- "Save to closet" → next item or close if last.
- "Re-tune" → re-run the cleanup pass (rate-limited to 2 retries per item).
- "Skip all" → mark batch as deferred; items still saved with AI metadata, surfaced in a "Needs review" filter chip later.

---

### 10.4 Craft a look

**Mockup:** `03 · CRAFT A LOOK`. **Route:** `/closet/craft`. **Type:** push.

**Purpose.** Manually build an outfit by picking items from the closet. Used to save combinations and as the input to Wear-this.

**Layout.**

- Header: ← back, "Craft a look" title, "Save" action.
- Pink canvas card: 4 slots, dashed = empty. "Untitled look" name (editable).
- Category chips: `Dresses | Tops | Bottoms | Shoes | Bags`.
- Picker grid: 3-up thumbnails. Selected items have pink border + check badge.
- Bottom CTAs: ghost "Save combo", primary "Try on me ✨".

**Behavior.**
- Tapping an item adds it to the canvas (or removes if already there).
- "Save combo" — prompts for an optional name, defaults to AI-generated based on selected items + occasion.
- "Try on me" → Wear-this / Confirm & share modal.

---

### 10.5 Stella chat

**Mockup:** `STELLA · AI STYLIST`. **Route:** `/stella` (centre tab opens this). **Type:** modal.

**Purpose.** Open-ended styling conversation. Receives outfit suggestions as inline cards.

**Layout.**

- Header: ← back, "Stella" + sparkle, "Your AI stylist · online" subtitle.
- Bubbles: AI bubbles use `bg.secondary`; user bubbles use brand pink with white text.
- AI outfit suggestions render as a 3-thumb mini-grid inside the bubble with a one-line caption.
- Quick-reply chip strip above the input: "Show alternatives", "Different vibe", "Wear this".
- Composer: pill input "Ask Stella anything…" + camera icon (left) + mic icon (right inside pink circle).

**Behavior.**
- Streaming response via SSE.
- Quick replies are dynamic — Stella can return them in the response payload.
- "Wear this" on a suggestion → Wear-this / Confirm & share modal.

---

### 10.6 Chats inbox

**Mockup:** `CHAT · INBOX`. **Route:** `/(tabs)/chats`. **Type:** tab root.

**Purpose.** All conversations. Pinned (Stella), groups, hangouts, DMs.

**Layout.**

- Header: "Chats" + search + new-message edit icon.
- (Optional) **Friends feed module** at top — see §10.8. **Decision: include here as the primary entry to OOTD feed.**
- **PINNED** section — Stella always.
- **GROUPS** section — including hangout chats. Hangout rows show pink dot when unread + member outfit avatars.
- **DIRECT** section — DMs.

Each row: avatar (or stacked avatars for groups) · name · preview · timestamp · unread dot.

**Data needs.** `GET /chat/threads`.

---

### 10.7 Chat with closet drawer

**Mockup:** `CHAT · SEND FROM CLOSET`. **Route:** `/chat/[id]`. **Type:** push.

**Purpose.** A conversation. Below the message list is a tabbed input area where the user can switch between keyboard, **closet drawer**, camera, and Stella suggestions.

**Layout.**

- Header: ← back · avatar · name + presence.
- Message list (reverse-chronological scroll).
- Input rail at bottom:
  - Pill input area with placeholder.
  - Icon row below: keyboard, **closet (active)**, camera, stella, send (right).
  - **Closet drawer** opens above the keyboard (replacing it). Filter chips: `All | Combinations | Dresses | Recent`. Grid of 4-up item thumbs, multi-select.

**Sending closet items.**
- Selected items send as a `kind: 'CLOSET_ITEM'` or `'COMBINATION'` message.
- Renders in chat as a pink-fill card with item thumbs + caption "{name} · from my closet".
- Tapping the card on the receiver's side opens that item/combination in their viewer (read-only — they can't see the rest of the sender's closet unless they are friends and viewing the public profile).

---

### 10.8 Friends feed

**Mockup:** `FRIENDS`. **Route:** `/friends` (entered from Chats header or as a top module on Chats). **Type:** push.

**Purpose.** OOTD feed from friends + active hangouts strip + create-hangout CTA.

**Layout.**

1. Header: "Friends" + bell.
2. **Plan a hangout** hero card — pink, full-width. Tap → Create hangout modal.
3. **Active hangouts** horizontal strip — small cards with name, time, member avatars.
4. **OOTD feed** — vertical list of post cards. Avatar + name + time + location. Photo. Caption. Reaction row: ♡ count, comment count, **Coordinate ↗** CTA on the right.

**Coordinate behavior.** Tapping `Coordinate` opens Stella in a hangout-coordination prompt: "Suggest a look from my closet that pairs with @{friend}'s {look name}." Returns a suggestion as an outfit card.

---

### 10.9 Hangout group view

**Mockup:** `HANGOUT GROUP`. **Route:** `/hangout/[id]`. **Type:** push.

**Purpose.** Coordinate looks for a planned event. Each member's outfit is visible only when they choose to share into the group.

**Layout.**

1. Header: ← back · "{hangout.name}" + "Today · 11:00 · Tiong Bahru" subtitle · ⋯ menu.
2. **Looks for today · {n} going** — 4-up grid:
   - Owner ("You"): always shown. State: `picking` (no shared combo yet) or full mini try-on if shared.
   - Each member: their shared outfit thumbnail, OR a clock icon + "pending" if not shared yet.
3. **Stella suggests for you** — pink card. After at least one member shares, Stella proposes a coordinating outfit from the user's closet. Mini-grid of 3 thumbs + "Wear this" CTA.
4. **Group chat** preview — last message + "Open →".

**Lifecycle.**
- `expiresAt = startsAt + 12h` by default. After expiry, `status = EXPIRED`.
- Owner can manually expire via ⋯ → "End hangout".
- Expired hangouts archive into a "Past hangouts" section in Chats (not visible by default; surfaced via a "See past" link).

**Cold start (no member has shared).** Stella's suggestion uses the owner's weather + occasion + closet — same logic as Today's pick.

---

### 10.10 Wear this · Confirm & share

**Mockup:** `CONFIRM & SHARE`. **Route:** `/share`. **Type:** modal.

**Purpose.** Render the outfit as a studio try-on photo (P1) or fallback OutfitCard (P0), confirm, and pick share targets.

**Layout.**

1. Header: ✕ · "Studio · by Stella" · share-out icon (export/save).
2. **Try-on photo** — 3:4 aspect, full-bleed, brand-pink "Sunday brunch"-style occasion chip top-left, "{n} of {n} from your closet" chip bottom-right.
3. **Item chips** below — names of items used.
4. **Share with** section:
   - Hangout groups (auto-selected if entry came via a hangout coordinate).
   - Friends (DM targets — multi-select).
   - "My feed" toggle (posts publicly to friends feed).
5. CTAs:
   - Primary: "Confirm OOTD & share" — creates OOTD + sends to selected targets.
   - Ghost: "Save look only" — saves the combination, no share.

**Behavior.**
- Try-on photo generates async; show "Stella is composing…" placeholder if not ready.
- In P0 the try-on photo is replaced by the OutfitCard composite.
- Once shared, the OOTD post is editable (can change targets or unshare) for 1 hour, then locked.

---

### 10.11 You / profile

**Mockup:** `YOU`. **Route:** `/(tabs)/you`. **Type:** tab root.

**Purpose.** The user's own profile + settings.

**Layout.**

1. Header: "You" + cog (settings detail).
2. Avatar (large) + display name + @username + city.
3. Stats row: Items · OOTDs · Friends.
4. Settings list:
   - **Personal info** — name, gender, birth year.
   - **Style preferences** — multi-select tags chosen at onboarding, editable.
   - **Climate & location** — city, climate profile.
   - **Notifications** — daily Today reminder, friend requests, hangout invites, OOTD reactions.
   - **Privacy** — discoverable (appear in search and "what others are wearing"), contribute to community looks, profile visibility (friends-only vs discoverable).
   - **Selfies** — view, replace, delete (links into Selfie upload modal).
   - **Add friends** (push to Add friends).
   - **Account** — email, password, delete account.

---

### 10.12 Add friends

**Mockup:** `ADD FRIENDS`. **Route:** `/friends/add`. **Type:** push.

**Purpose.** Three lanes for adding friends: search, suggested, contacts. Plus a pending tab.

**Layout.**

1. Header: ← back, "Add friends".
2. Search input — "Search by @username or ID".
3. Tabs: `Suggested | Contacts | Pending · {n}`.
4. **Suggested** sections:
   - "Same vibe · {country}" — users from "what others are wearing" interactions and style affinity.
   - "From your contacts" — phone-hash matched.
5. Each row: avatar · @username · subtitle (e.g., "12 mutual" or "Saw their look on Today") · `+ Add` pill button (or `Pending` disabled state).

**Behavior.**
- Sending a request transitions the row's button to `Pending`.
- "Pending" tab shows inbound + outbound with accept/decline actions.
- Search query hits `/friends/search`. Only `discoverable: true` users surface.

---

### 10.13 Create hangout

**Mockup:** `CREATE HANGOUT`. **Route:** `/hangout/create`. **Type:** modal.

**Purpose.** Single-screen hangout creation: name, time, place, friends.

**Layout.**

1. Header: ✕ · "New hangout".
2. Name input (required).
3. When + Where cards (side-by-side). When opens a date+time picker; Where opens a location picker (typeahead from Google Places, optional).
4. **Invite friends** section — search input + grid of friend avatars (multi-select with check badges).
5. Bottom locked CTA: "Send invites · {n} friends" (disabled when name empty or 0 friends).

**Behavior.**
- On submit, creates hangout, adds members in `INVITED` state, sends push to each.
- Returns user to Hangout group view.

---

### 10.14 Selfie upload

**Mockup:** `SELFIE UPLOAD`. **Route:** `/selfies`. **Type:** modal.

**Purpose.** Add up to 5 selfies for try-on generation. Any selfies that show face + body shape are acceptable — no specific pose required.

**Layout.**

1. Header: ← back · "Add your selfies" · "{n} / 5" counter.
2. Caption: "Stella uses these to create your studio try-on photos. Any 5 selfies that show your face and body work — different lighting and outfits help."
3. 6-tile grid:
   - Filled tiles (uploaded): show photo, position number, ✕ remove button.
   - Empty tiles: dashed border, `+`.
   - "Add" tile: pink-fill, camera icon. Tapping opens a sheet with `Take photo` and `Choose from library`.
4. Privacy card: lock icon · "Private to you. Used only to generate your try-on photos. Never shared. Delete anytime."
5. Bottom CTAs: ghost "Skip"; primary "Add {n} more to finish" (disabled until 5 uploaded; copy adapts to current count).

**Behavior.**
- Each upload triggers a presigned PUT and creates a Selfie record.
- Setup banner on Today only hides when `selfieIds.length === 5`. Users can still skip; banner remains dismissible per §9.2.

---

### 10.15 Public profile view

**Mockup:** `PUBLIC PROFILE VIEW`. **Route:** `/friends/[userId]`. **Type:** push.

**Purpose.** Read-only view of another user. Used for "what others are wearing" taps, search results, friend suggestions.

**Layout.**

1. Header: ← back · ⋯ menu (block, report).
2. Avatar (large) + @username + city.
3. CTAs row: primary `+ Add friend` (or `Friends` if already, or `Pending` if request sent); ghost `Message` (opens a DM if discoverability + friendship allow; otherwise greyed).
4. Stats row: OOTDs · Friends · **Mutual**.
5. Tabs: `Recent looks | Style`.
6. **Recent looks** — 3-up grid of try-on thumbnails (their public OOTDs).
7. **Locked footer card**: "Closet visible after they accept" (only shown when not friends).

**Behavior.**
- 404 if target user is not `discoverable` and current user is not their friend.
- Tapping a recent-look thumbnail → that OOTD detail.

---

## 11. Cross-screen flows

### 11.1 Onboarding (new user)

```
[signup] → [profile basics: display name, birth year, gender, country, city]
       → [style preferences: pick 3-6 tags]
       → [permissions: camera, photos, calendar, location, notifications]
       → [selfie upload — can skip]
       → [closet seed: "Add 5 items to get started" — opens camera/gallery picker]
       → [closet AI review for the seed batch]
       → [Today screen]
```

Skip is allowed at every step except profile basics.

### 11.2 First closet items (guided capture)

For users with `< 10` items, the FAB opens a guided sheet:
- "Pick 5 items from your wardrobe — we'll do the rest."
- Camera or gallery; multi-select gallery preferred.
- Submitted batch enters processing. Upload banner shows on Closet.
- On completion, AI Review modal auto-presents.

For users with `≥ 10` items, the FAB opens directly to multi-select gallery (no preamble).

### 11.3 Wear-this / share

Entry points:
- Today → Today's pick → "Wear this on me"
- Stella → suggestion bubble → "Wear this"
- Craft a look → "Try on me"
- Hangout group → Stella suggestion → "Wear this"

All paths land in `/share` (Wear this · Confirm & share modal). After confirm:
- OOTD post is created with the selected visibility.
- If a hangout target was selected, the post posts into the hangout chat as a `kind: 'OOTD'` message.
- If "My feed" was toggled, the post appears in friends' feeds.
- Combination is auto-saved if not already.

### 11.4 Hangout coordination

```
[Friend posts OOTD] → [tap "Coordinate"] → [Stella opens]
   → [Stella reads friend's combo + my closet + weather]
   → [returns suggestion as outfit card]
   → ["Wear this" → /share with that hangout pre-selected]
```

Or:

```
[Create hangout] → [members invited] → [each opens hangout]
   → [picks via "Wear this on me" or Craft a look, shares to hangout]
   → [Stella re-suggests for late pickers based on what's already shared]
```

### 11.5 Add a friend from "what others are wearing"

```
[Today] → [tap thumbnail in "What others are wearing"]
   → [Public profile view of @lily.linen]
   → ["+ Add friend"]
   → [request sent; row goes to Pending]
```

If `lily.linen.discoverable === false`, the thumbnail in Today is anonymized (no profile reachable). See §12.

---

## 12. Privacy & visibility rules

### 12.1 Selfies

- Encrypted at rest (SSE-KMS).
- Never served via CDN.
- Never used for any purpose except generating that user's own try-on photos.
- Deletable individually. Delete cascades to any cached try-on outputs that used the selfie.

### 12.2 Closet items

- Owner: full read/write.
- Friends: can see tuned thumbnails when surfaced via OOTD posts or Hangout groups the owner shared into. Cannot enumerate the closet.
- Public profile (non-friends): no closet visibility. Locked footer card explains.
- "What others are wearing" surfaces try-on photos only — never raw closet items.

### 12.3 OOTD posts

Visibility is set at post-time and cannot be expanded later (only narrowed). Options:
- `PUBLIC` — appears on the friends feed of all friends.
- `FRIENDS` — same as public for v1; reserved for future "close friends" subset.
- `GROUP` — visible only to specified hangout(s) or DM thread(s).
- `DIRECT` — visible only to specified user(s).

Hangout-shared OOTDs (`GROUP` to a hangoutId) do NOT auto-post to the public friends feed. The user must explicitly toggle "My feed" in Confirm & share.

### 12.4 Hangouts

- Members can see each other's shared outfits within the hangout.
- A member's *closet* is not visible — only the specific combination they shared.
- Owner can remove members. Members can leave.
- Auto-expires 12h after `startsAt`. Owner can manually expire any time.

### 12.5 Discoverability

User toggle `discoverable: boolean`. Default: **off** for new users.

When `false`:
- Profile is not returned by `/friends/search`.
- Profile 404s on direct GET unless requester is a friend.
- User does not appear in "What others are wearing".

When `true`:
- Profile is searchable.
- `username + recent OOTDs` are visible to anyone via the Public profile view.
- Closet remains private.

A separate toggle `contributesToCommunityLooks: boolean` controls whether the user's try-on photos surface anonymously in others' Today screens. Independent from `discoverable` — a user can contribute anonymously without being discoverable.

### 12.6 "What others are wearing" anonymization

If `discoverable === true && contributesToCommunityLooks === true` → look surfaces with the user's avatar, tappable to their public profile.

If `discoverable === false && contributesToCommunityLooks === true` → look surfaces but the thumbnail is non-tappable. No profile reachable. **Implement this in P1**; in P0, only surface fully-discoverable users.

If `contributesToCommunityLooks === false` → look does not surface to others.

### 12.7 Friend graph visibility

Closet thumbnails and tuned item photos require a friendship check on every cross-user read. CloudFront URLs are signed server-side per-request based on the requester's friend graph. URLs expire after 1 hour.

---

## 13. Build plan

### 13.1 P0 — core daily loop (target: 4-6 weeks)

Goal: a user can sign up, photograph their closet, get a daily recommendation, chat with Stella, and post an OOTD to a friend.

**Backend**
- Cognito + `/auth/*`, `/me`
- DDB single-table + types package
- S3 buckets + IAM
- Closet upload + processing pipeline (Claude vision + thumbnail; skip studio cleanup if Replicate setup is slow — ship raw + thumb only)
- `/closet/*`, `/closet/combinations/*`
- `/today` (weather + calendar via OS perms; one-shot Stella for daily pick)
- `/stella/*` (Sonnet, with full toolset)
- `/ootd` create + feed (with **fallback OutfitCard** as the share image)
- `/friends/*` (request, accept, list, search by username)
- `/chat/threads/*` direct DMs only
- Push for: friend request, OOTD reaction, daily Today reminder

**Frontend**
- Theme provider + tokens
- Component primitives (`Screen`, `Card`, `Button`, `Chip`, `Avatar`, `Thumb`, `OutfitCard`, `Bubble`, `BottomNav`, `SettingRow`, `MetricCell`, `SectionHeader`)
- BottomNav with 5 tabs (raised Stella centre)
- Onboarding flow (§11.1 — selfie upload optional, closet seed optional)
- Today, Closet (grid + Combinations), Stella, Chats inbox (DMs only), You
- Closet AI Review modal
- Craft a look
- Wear-this / Confirm & share (with OutfitCard fallback)
- Public profile view (read-only, friend-add)
- Add friends (search + contacts only — no Suggested)

**Excluded from P0**
- Hangouts
- "What others are wearing"
- Try-on photo generation
- Closet drawer in chat
- Coordinate from feed
- Fashion now

### 13.2 P1 — social coordination (target: +4 weeks)

**Backend**
- `/hangouts/*` + member invite/share
- Hangout chat threads (`type: 'HANGOUT'`)
- `/today/community-looks`
- Try-on photo generation pipeline (§9.3)
- `/ootd/{ootdId}/coordinate`
- `/friends/suggested` (style affinity from community-looks interactions)
- WebSocket API for live chat updates
- Push for: hangout invites, member shared in hangout, friend posted OOTD

**Frontend**
- Friends feed (with Coordinate CTA)
- Hangout group view
- Create hangout modal
- "What others are wearing" strip on Today
- Closet drawer in chat
- Public profile shows mutual count and "Saw their look on Today" hint
- Try-on photo replaces OutfitCard fallback in Wear-this

### 13.3 P2 — discovery (target: +4 weeks)

- Fashion now (RSS pull, no parsing — link out)
- Multi-agent Stella (minimalist / maximalist / vintage curators) — dependent on user research showing demand
- Past hangouts archive surface
- Closet auto-link from OOTD (with privacy review)
- Anonymous community contribution mode (§12.6)

### 13.4 P3+ (deferred)

- Marketplace / brand integrations
- Men's branding
- Influencer profiles
- Web companion (read-only)

---

## 14. Open questions

| ID | Question | Status |
|---|---|---|
| OQ-1 | Should Friends remain inside Chats as a top module, or be promoted to a 6th surface? | Spec assumes "inside Chats" for P0; revisit after first usability test. |
| OQ-2 | Which try-on model to use for §9.3? | Defer to P1 spike. Build the API contract so the model is swappable. |
| OQ-3 | "Fashion now" sourcing — RSS-only is the chosen path, but legal review needed before launch. | Punted to P2. |
| OQ-4 | Multi-agent Stella vs single. | Defer; user research first. |
| OQ-5 | Men's / unisex branding. | Defer; architecture supports it. |
| OQ-6 | Closet auto-link from OOTD. | Defer; privacy review required before P2. |
| OQ-7 | Default visibility setting for new users — `discoverable: false` is currently default. Should onboarding nudge users to opt in? | Spec says no nudge in P0. Revisit if friend-graph density is too low at scale. |
| OQ-8 | Anonymous-only contribution path (§12.6). | P1 ship. |

---

*End of spec. See `mockup.html` for visual reference and `tokens.ts` for the design tokens.*
