// Zod mirrors of the entity types defined as TS interfaces in ./index.ts.
// Source of truth: SPEC.md §6.2. Keep these aligned with the TS interfaces.
//
// Naming: every Zod schema is prefixed with `z` to avoid name collisions
// with the TypeScript interfaces of the same name in ./index.ts.

import { z } from 'zod';

// ---------- Enums ----------

export const zClothingCategory = z.enum([
  'DRESS',
  'TOP',
  'BOTTOM',
  'OUTERWEAR',
  'SHOE',
  'BAG',
  'ACCESSORY',
]);
export type ZClothingCategory = z.infer<typeof zClothingCategory>;

export const zOccasion = z.enum([
  'CASUAL',
  'WORK',
  'DATE',
  'BRUNCH',
  'EVENING',
  'WEDDING',
  'WORKOUT',
  'BEACH',
]);
export type ZOccasion = z.infer<typeof zOccasion>;

export const zWeatherTag = z.enum(['HOT', 'WARM', 'MILD', 'COLD', 'RAIN']);
export type ZWeatherTag = z.infer<typeof zWeatherTag>;

export const zGender = z.enum(['F', 'M', 'NB', 'PNS']);
export type ZGender = z.infer<typeof zGender>;

export const zClimateProfile = z.enum(['TROPICAL', 'TEMPERATE', 'ARID', 'COLD']);
export type ZClimateProfile = z.infer<typeof zClimateProfile>;

export const zItemStatus = z.enum(['PROCESSING', 'READY', 'FAILED']);
export type ZItemStatus = z.infer<typeof zItemStatus>;

export const zComboSource = z.enum([
  'STELLA',
  'TODAY_PICK',
  'CRAFTED',
  'COORDINATED',
]);
export type ZComboSource = z.infer<typeof zComboSource>;

export const zFriendRequestStatus = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
]);
export type ZFriendRequestStatus = z.infer<typeof zFriendRequestStatus>;

export const zOOTDVisibility = z.enum(['PUBLIC', 'FRIENDS', 'GROUP', 'DIRECT']);
export type ZOOTDVisibility = z.infer<typeof zOOTDVisibility>;

export const zHangoutStatus = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']);
export type ZHangoutStatus = z.infer<typeof zHangoutStatus>;

export const zHangoutRole = z.enum(['OWNER', 'MEMBER']);
export type ZHangoutRole = z.infer<typeof zHangoutRole>;

export const zHangoutInviteStatus = z.enum(['INVITED', 'JOINED', 'DECLINED']);
export type ZHangoutInviteStatus = z.infer<typeof zHangoutInviteStatus>;

export const zChatThreadType = z.enum(['DIRECT', 'GROUP', 'HANGOUT', 'STELLA']);
export type ZChatThreadType = z.infer<typeof zChatThreadType>;

export const zChatMessageKind = z.enum([
  'TEXT',
  'CLOSET_ITEM',
  'COMBINATION',
  'OOTD',
  'IMAGE',
]);
export type ZChatMessageKind = z.infer<typeof zChatMessageKind>;

// ---------- Common building blocks ----------

const isoString = z.string().datetime({ offset: true });

// ---------- Entities (mirror SPEC.md §6.2) ----------

export const zUser = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
  gender: zGender.optional(),
  birthYear: z.number().int().optional(),
  countryCode: z.string().length(2).optional(),
  city: z.string().optional(),
  stylePreferences: z.array(z.string()),
  climateProfile: zClimateProfile.optional(),
  discoverable: z.boolean(),
  contributesToCommunityLooks: z.boolean(),
  selfieIds: z.array(z.string()),
  createdAt: isoString,
  lastActiveAt: isoString,
});
export type ZUser = z.infer<typeof zUser>;

export const zClosetItem = z.object({
  itemId: z.string(),
  userId: z.string(),
  category: zClothingCategory,
  name: z.string(),
  description: z.string(),
  colors: z.array(z.string()),
  fabricGuess: z.string().optional(),
  occasionTags: z.array(zOccasion),
  weatherTags: z.array(zWeatherTag),
  rawPhotoUrl: z.string(),
  tunedPhotoUrl: z.string(),
  thumbnailUrl: z.string(),
  status: zItemStatus,
  createdAt: isoString,
  updatedAt: isoString,
});
export type ZClosetItem = z.infer<typeof zClosetItem>;

export const zCombination = z.object({
  comboId: z.string(),
  userId: z.string(),
  name: z.string(),
  itemIds: z.array(z.string()).min(2).max(6),
  occasionTags: z.array(zOccasion),
  source: zComboSource,
  createdAt: isoString,
});
export type ZCombination = z.infer<typeof zCombination>;

export const zSelfie = z.object({
  selfieId: z.string(),
  userId: z.string(),
  s3Key: z.string(),
  uploadedAt: isoString,
});
export type ZSelfie = z.infer<typeof zSelfie>;

export const zFriendship = z.object({
  userIdA: z.string(),
  userIdB: z.string(),
  createdAt: isoString,
});
export type ZFriendship = z.infer<typeof zFriendship>;

export const zFriendRequest = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  createdAt: isoString,
  status: zFriendRequestStatus,
});
export type ZFriendRequest = z.infer<typeof zFriendRequest>;

export const zOOTDReaction = z.object({
  userId: z.string(),
  type: z.literal('♡'),
});
export type ZOOTDReaction = z.infer<typeof zOOTDReaction>;

export const zOOTDPost = z.object({
  ootdId: z.string(),
  userId: z.string(),
  comboId: z.string(),
  caption: z.string().optional(),
  locationName: z.string().optional(),
  tryOnPhotoUrl: z.string().optional(),
  fallbackOutfitCardUrl: z.string().optional(),
  visibility: zOOTDVisibility,
  visibilityTargets: z.array(z.string()).optional(),
  reactions: z.array(zOOTDReaction),
  createdAt: isoString,
});
export type ZOOTDPost = z.infer<typeof zOOTDPost>;

export const zHangout = z.object({
  hangoutId: z.string(),
  ownerId: z.string(),
  name: z.string(),
  startsAt: isoString,
  expiresAt: isoString,
  locationName: z.string().optional(),
  status: zHangoutStatus,
  createdAt: isoString,
});
export type ZHangout = z.infer<typeof zHangout>;

export const zHangoutMember = z.object({
  hangoutId: z.string(),
  userId: z.string(),
  role: zHangoutRole,
  inviteStatus: zHangoutInviteStatus,
  sharedComboId: z.string().optional(),
  sharedAt: isoString.optional(),
  joinedAt: isoString,
});
export type ZHangoutMember = z.infer<typeof zHangoutMember>;

export const zChatLastMessage = z.object({
  preview: z.string(),
  at: isoString,
  senderId: z.string(),
});
export type ZChatLastMessage = z.infer<typeof zChatLastMessage>;

export const zChatThread = z.object({
  threadId: z.string(),
  type: zChatThreadType,
  participantIds: z.array(z.string()),
  hangoutId: z.string().optional(),
  name: z.string().optional(),
  lastMessage: zChatLastMessage.optional(),
  unreadCounts: z.record(z.string(), z.number().int().nonnegative()),
  createdAt: isoString,
});
export type ZChatThread = z.infer<typeof zChatThread>;

export const zChatMessage = z.object({
  messageId: z.string(),
  threadId: z.string(),
  senderId: z.string(),
  kind: zChatMessageKind,
  text: z.string().optional(),
  refId: z.string().optional(),
  createdAt: isoString,
});
export type ZChatMessage = z.infer<typeof zChatMessage>;

export const zStellaConversation = z.object({
  convoId: z.string(),
  userId: z.string(),
  title: z.string(),
  createdAt: isoString,
  lastMessageAt: isoString,
});
export type ZStellaConversation = z.infer<typeof zStellaConversation>;

// Stella message — referenced in §6.1's key patterns table but not formally
// defined as an interface in §6.2. Modelled after ChatMessage for the
// streaming chat surface.
export const zStellaMessageRole = z.enum(['USER', 'ASSISTANT']);
export type ZStellaMessageRole = z.infer<typeof zStellaMessageRole>;

export const zStellaMessage = z.object({
  messageId: z.string(),
  convoId: z.string(),
  role: zStellaMessageRole,
  text: z.string(),
  createdAt: isoString,
});
export type ZStellaMessage = z.infer<typeof zStellaMessage>;
