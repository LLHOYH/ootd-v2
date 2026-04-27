// Shared TypeScript types — see SPEC.md §6.2.
// Source of truth: SPEC.md. If code disagrees, the spec wins until updated.
//
// Zod-validated entity schemas live in `./entities`, and runtime-validated
// API request/response contracts (one per route in §7) live in `./contracts`.
// The TS interfaces below are kept verbatim; the Zod versions are additive.

export * from './entities.js';
export * from './contracts/index.js';

export type ClothingCategory =
  | 'DRESS' | 'TOP' | 'BOTTOM' | 'OUTERWEAR'
  | 'SHOE' | 'BAG' | 'ACCESSORY';

export type Occasion =
  | 'CASUAL' | 'WORK' | 'DATE' | 'BRUNCH'
  | 'EVENING' | 'WEDDING' | 'WORKOUT' | 'BEACH';

export type WeatherTag = 'HOT' | 'WARM' | 'MILD' | 'COLD' | 'RAIN';

export interface User {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  gender?: 'F' | 'M' | 'NB' | 'PNS';
  birthYear?: number;
  countryCode?: string;
  city?: string;
  stylePreferences: string[];
  climateProfile?: 'TROPICAL' | 'TEMPERATE' | 'ARID' | 'COLD';
  discoverable: boolean;
  contributesToCommunityLooks: boolean;
  selfieIds: string[];
  createdAt: string;
  lastActiveAt: string;
}

export interface ClosetItem {
  itemId: string;
  userId: string;
  category: ClothingCategory;
  name: string;
  description: string;
  colors: string[];
  fabricGuess?: string;
  occasionTags: Occasion[];
  weatherTags: WeatherTag[];
  rawPhotoUrl: string;
  tunedPhotoUrl: string;
  thumbnailUrl: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface Combination {
  comboId: string;
  userId: string;
  name: string;
  itemIds: string[];
  occasionTags: Occasion[];
  source: 'STELLA' | 'TODAY_PICK' | 'CRAFTED' | 'COORDINATED';
  createdAt: string;
}

export interface Selfie {
  selfieId: string;
  userId: string;
  s3Key: string;
  uploadedAt: string;
}

export interface Friendship {
  userIdA: string;
  userIdB: string;
  createdAt: string;
}

export interface FriendRequest {
  fromUserId: string;
  toUserId: string;
  createdAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
}

export type OOTDVisibility = 'PUBLIC' | 'FRIENDS' | 'GROUP' | 'DIRECT';

export interface OOTDPost {
  ootdId: string;
  userId: string;
  comboId: string;
  caption?: string;
  locationName?: string;
  tryOnPhotoUrl?: string;
  fallbackOutfitCardUrl?: string;
  visibility: OOTDVisibility;
  visibilityTargets?: string[];
  reactions: { userId: string; type: '♡' }[];
  createdAt: string;
}

export interface Hangout {
  hangoutId: string;
  ownerId: string;
  name: string;
  startsAt: string;
  expiresAt: string;
  locationName?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
}

export interface HangoutMember {
  hangoutId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  inviteStatus: 'INVITED' | 'JOINED' | 'DECLINED';
  sharedComboId?: string;
  sharedAt?: string;
  joinedAt: string;
}

export type ChatThreadType = 'DIRECT' | 'GROUP' | 'HANGOUT' | 'STELLA';

export interface ChatThread {
  threadId: string;
  type: ChatThreadType;
  participantIds: string[];
  hangoutId?: string;
  name?: string;
  lastMessage?: { preview: string; at: string; senderId: string };
  unreadCounts: Record<string, number>;
  createdAt: string;
}

export type ChatMessageKind = 'TEXT' | 'CLOSET_ITEM' | 'COMBINATION' | 'OOTD' | 'IMAGE';

export interface ChatMessage {
  messageId: string;
  threadId: string;
  senderId: string;
  kind: ChatMessageKind;
  text?: string;
  refId?: string;
  createdAt: string;
}

export interface StellaConversation {
  convoId: string;
  userId: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}
