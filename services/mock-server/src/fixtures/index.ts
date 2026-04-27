// In-memory store for the mock server. State is lost on restart.
// Maps and arrays here back every route in SPEC.md §7.

import type {
  ChatMessage,
  ChatThread,
  ClosetItem,
  Combination,
  FriendRequest,
  Friendship,
  Hangout,
  HangoutMember,
  OOTDPost,
  Selfie,
  StellaConversation,
  ZStellaMessage,
  User,
} from '@mei/types';

export interface StellaTurn {
  message: ZStellaMessage;
}

export class Store {
  // --- Users + social graph ---
  users = new Map<string, User>();
  friendships: Friendship[] = [];
  friendRequests: FriendRequest[] = [];
  /** Hashed phone -> userId, for /friends/contacts/match. */
  phoneHashIndex = new Map<string, string>();

  // --- Closet ---
  items = new Map<string, ClosetItem>();
  combinations = new Map<string, Combination>();
  selfies = new Map<string, Selfie>();
  /** itemIds the user has not yet confirmed (i.e. shown in pending-review). */
  pendingItemIds = new Set<string>();

  // --- OOTD ---
  ootds = new Map<string, OOTDPost>();

  // --- Hangouts ---
  hangouts = new Map<string, Hangout>();
  hangoutMembers: HangoutMember[] = [];

  // --- Chat ---
  threads = new Map<string, ChatThread>();
  chatMessages = new Map<string, ChatMessage[]>(); // threadId -> messages

  // --- Stella ---
  stellaConversations = new Map<string, StellaConversation>();
  stellaMessages = new Map<string, ZStellaMessage[]>(); // convoId -> messages

  // --- Today (singleton-ish payload pieces, computed on each request) ---
  /** Static suggested "Today's pick" comboId, mutable so /another-pick rotates it. */
  todaysPickComboId: string | null = null;

  // --- ID generators (predictable but unique) ---
  private counters = new Map<string, number>();
  nextId(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${n}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // --- Helpers ---

  ootdsForUser(userId: string): OOTDPost[] {
    return [...this.ootds.values()].filter((o) => o.userId === userId);
  }

  itemsForUser(userId: string): ClosetItem[] {
    return [...this.items.values()].filter((i) => i.userId === userId);
  }

  combinationsForUser(userId: string): Combination[] {
    return [...this.combinations.values()].filter((c) => c.userId === userId);
  }

  selfiesForUser(userId: string): Selfie[] {
    return [...this.selfies.values()].filter((s) => s.userId === userId);
  }

  friendsOf(userId: string): User[] {
    const friendIds = new Set<string>();
    for (const f of this.friendships) {
      if (f.userIdA === userId) friendIds.add(f.userIdB);
      if (f.userIdB === userId) friendIds.add(f.userIdA);
    }
    return [...friendIds]
      .map((id) => this.users.get(id))
      .filter((u): u is User => Boolean(u));
  }

  areFriends(a: string, b: string): boolean {
    return this.friendships.some(
      (f) =>
        (f.userIdA === a && f.userIdB === b) ||
        (f.userIdA === b && f.userIdB === a),
    );
  }

  threadsFor(userId: string): ChatThread[] {
    return [...this.threads.values()].filter((t) =>
      t.participantIds.includes(userId),
    );
  }

  hangoutsFor(userId: string): Hangout[] {
    const hangoutIds = new Set(
      this.hangoutMembers
        .filter((m) => m.userId === userId)
        .map((m) => m.hangoutId),
    );
    return [...this.hangouts.values()].filter((h) => hangoutIds.has(h.hangoutId));
  }

  membersOf(hangoutId: string): HangoutMember[] {
    return this.hangoutMembers.filter((m) => m.hangoutId === hangoutId);
  }

  conversationsFor(userId: string): StellaConversation[] {
    return [...this.stellaConversations.values()].filter(
      (c) => c.userId === userId,
    );
  }
}

// Singleton — populated by `seed()` in `./seed.ts` and shared across routes.
export const store = new Store();
