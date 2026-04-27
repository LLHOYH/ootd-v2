// Seed the in-memory Store with a coherent demo state.
// Theme borrowed from `apps/mobile/components/*/mocks.ts`: Sophia in Singapore
// with a closet of soft cream / mauve / sage / tan pieces. Designed so
// `/today`, `/closet`, `/chats`, `/friends` all return realistic-feeling data.

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
import { Store, store as defaultStore } from './index.js';

const NOW_ISO = new Date().toISOString();
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const SOPHIA_ID = 'u_sophia';

function isoMinusHours(h: number): string {
  return new Date(Date.now() - h * ONE_HOUR_MS).toISOString();
}

function isoMinusDays(d: number): string {
  return new Date(Date.now() - d * ONE_DAY_MS).toISOString();
}

function isoPlusHours(h: number): string {
  return new Date(Date.now() + h * ONE_HOUR_MS).toISOString();
}

const PHOTO = 'https://placehold.co/600x900/F2EAD9/3D4856?text=Mei';
const THUMB = 'https://placehold.co/300x450/F2EAD9/3D4856?text=Mei';

function mkItem(partial: Pick<ClosetItem, 'itemId' | 'category' | 'name' | 'description'> & Partial<ClosetItem>): ClosetItem {
  return {
    userId: SOPHIA_ID,
    colors: [],
    occasionTags: [],
    weatherTags: [],
    rawPhotoUrl: PHOTO,
    tunedPhotoUrl: PHOTO,
    thumbnailUrl: THUMB,
    status: 'READY',
    createdAt: isoMinusDays(20),
    updatedAt: isoMinusDays(20),
    ...partial,
  };
}

// Mirrors `apps/mobile/components/closet/mocks.ts` but carries a real userId
// and real (placeholder) photo URLs so the mobile app can render thumbnails.
const SOPHIA_ITEMS: ClosetItem[] = [
  mkItem({
    itemId: 'i_dress_linen',
    category: 'DRESS',
    name: 'Cream linen midi',
    description: 'Sleeveless A-line in soft cream linen.',
    colors: ['#F2EAD9'],
    fabricGuess: 'linen',
    occasionTags: ['BRUNCH', 'CASUAL'],
    weatherTags: ['HOT', 'WARM'],
  }),
  mkItem({
    itemId: 'i_dress_floral',
    category: 'DRESS',
    name: 'Floral wrap',
    description: 'Tea-length wrap in dusty mauve floral.',
    colors: ['#E5D5E0'],
    fabricGuess: 'rayon',
    occasionTags: ['DATE', 'WEDDING'],
    weatherTags: ['WARM'],
  }),
  mkItem({
    itemId: 'i_top_silk',
    category: 'TOP',
    name: 'Ivory silk camisole',
    description: 'Bias-cut camisole with thin straps.',
    colors: ['#F2EAD9'],
    fabricGuess: 'silk',
    occasionTags: ['EVENING', 'DATE'],
    weatherTags: ['MILD', 'WARM'],
  }),
  mkItem({
    itemId: 'i_top_tee',
    category: 'TOP',
    name: 'White boxy tee',
    description: 'Heavy cotton tee, slightly cropped.',
    colors: ['#FFFFFF'],
    fabricGuess: 'cotton',
    occasionTags: ['CASUAL'],
    weatherTags: ['HOT', 'WARM'],
    status: 'PROCESSING',
  }),
  mkItem({
    itemId: 'i_top_blouse',
    category: 'TOP',
    name: 'Sage button-down',
    description: 'Oversized sage poplin shirt.',
    colors: ['#D5DDD0'],
    fabricGuess: 'cotton',
    occasionTags: ['WORK', 'BRUNCH'],
    weatherTags: ['MILD'],
  }),
  mkItem({
    itemId: 'i_bottom_jeans',
    category: 'BOTTOM',
    name: 'Indigo straight jeans',
    description: 'Mid-rise straight leg in raw indigo.',
    colors: ['#3D4856'],
    fabricGuess: 'denim',
    occasionTags: ['CASUAL', 'WORK'],
    weatherTags: ['MILD', 'COLD'],
  }),
  mkItem({
    itemId: 'i_bottom_skirt',
    category: 'BOTTOM',
    name: 'Tan pleated skirt',
    description: 'Knee-length pleated skirt in warm tan.',
    colors: ['#DCC9B6'],
    fabricGuess: 'wool',
    occasionTags: ['WORK', 'DATE'],
    weatherTags: ['MILD'],
  }),
  mkItem({
    itemId: 'i_bottom_shorts',
    category: 'BOTTOM',
    name: 'Linen shorts',
    description: 'High-rise tailored shorts in oat linen.',
    colors: ['#F2EAD9'],
    fabricGuess: 'linen',
    occasionTags: ['BRUNCH', 'BEACH'],
    weatherTags: ['HOT'],
    status: 'PROCESSING',
  }),
  mkItem({
    itemId: 'i_outer_blazer',
    category: 'OUTERWEAR',
    name: 'Tan blazer',
    description: 'Single-breasted relaxed blazer.',
    colors: ['#DCC9B6'],
    fabricGuess: 'wool',
    occasionTags: ['WORK'],
    weatherTags: ['MILD', 'COLD'],
  }),
  mkItem({
    itemId: 'i_shoe_loafers',
    category: 'SHOE',
    name: 'Black penny loafers',
    description: 'Classic leather loafers, broken in.',
    colors: ['#1A1A1A'],
    fabricGuess: 'leather',
    occasionTags: ['WORK', 'CASUAL'],
    weatherTags: ['MILD', 'COLD'],
  }),
  mkItem({
    itemId: 'i_shoe_sandals',
    category: 'SHOE',
    name: 'Strappy sandals',
    description: 'Tan leather flat sandals.',
    colors: ['#DCC9B6'],
    fabricGuess: 'leather',
    occasionTags: ['BRUNCH', 'BEACH'],
    weatherTags: ['HOT', 'WARM'],
  }),
  mkItem({
    itemId: 'i_shoe_heels',
    category: 'SHOE',
    name: 'Mauve kitten heels',
    description: 'Pointed-toe slingbacks in dusty mauve.',
    colors: ['#E5D5E0'],
    fabricGuess: 'leather',
    occasionTags: ['DATE', 'WEDDING', 'EVENING'],
    weatherTags: ['MILD'],
  }),
  mkItem({
    itemId: 'i_bag_tote',
    category: 'BAG',
    name: 'Cream canvas tote',
    description: 'Roomy everyday tote with leather handles.',
    colors: ['#F2EAD9'],
    fabricGuess: 'canvas',
    occasionTags: ['CASUAL', 'WORK'],
    weatherTags: ['HOT', 'WARM', 'MILD'],
  }),
  mkItem({
    itemId: 'i_bag_clutch',
    category: 'BAG',
    name: 'Mauve clutch',
    description: 'Small evening clutch in suede mauve.',
    colors: ['#E5D5E0'],
    fabricGuess: 'suede',
    occasionTags: ['EVENING', 'WEDDING'],
    weatherTags: ['MILD'],
  }),
  mkItem({
    itemId: 'i_acc_scarf',
    category: 'ACCESSORY',
    name: 'Silk neck scarf',
    description: 'Cream-and-tan printed silk square.',
    colors: ['#F2EAD9', '#DCC9B6'],
    fabricGuess: 'silk',
    occasionTags: ['BRUNCH', 'WORK'],
    weatherTags: ['MILD'],
  }),
];

const SOPHIA_COMBINATIONS: Combination[] = [
  {
    comboId: 'c_sunday_brunch',
    userId: SOPHIA_ID,
    name: 'Sunday brunch',
    itemIds: ['i_dress_linen', 'i_shoe_sandals', 'i_bag_tote'],
    occasionTags: ['BRUNCH'],
    source: 'TODAY_PICK',
    createdAt: isoMinusHours(2),
  },
  {
    comboId: 'c_date_night',
    userId: SOPHIA_ID,
    name: 'Date night',
    itemIds: ['i_dress_floral', 'i_shoe_heels', 'i_bag_clutch'],
    occasionTags: ['DATE'],
    source: 'CRAFTED',
    createdAt: isoMinusDays(3),
  },
  {
    comboId: 'c_office_tue',
    userId: SOPHIA_ID,
    name: 'Office tue',
    itemIds: [
      'i_top_blouse',
      'i_bottom_jeans',
      'i_shoe_loafers',
      'i_outer_blazer',
    ],
    occasionTags: ['WORK'],
    source: 'CRAFTED',
    createdAt: isoMinusDays(5),
  },
  {
    comboId: 'c_wedding_guest',
    userId: SOPHIA_ID,
    name: 'Wedding guest',
    itemIds: [
      'i_dress_floral',
      'i_shoe_heels',
      'i_bag_clutch',
      'i_acc_scarf',
    ],
    occasionTags: ['WEDDING'],
    source: 'STELLA',
    createdAt: isoMinusDays(8),
  },
  {
    comboId: 'c_easy_weekend',
    userId: SOPHIA_ID,
    name: 'Easy weekend',
    itemIds: ['i_top_tee', 'i_bottom_shorts', 'i_shoe_sandals'],
    occasionTags: ['CASUAL'],
    source: 'CRAFTED',
    createdAt: isoMinusDays(10),
  },
];

function mkFriend(
  userId: string,
  username: string,
  displayName: string,
  city: string,
  countryCode: string,
): User {
  return {
    userId,
    username,
    displayName,
    email: `${username}@example.com`,
    avatarUrl: `https://placehold.co/200x200/E5D5E0/3D4856?text=${username
      .slice(0, 2)
      .toUpperCase()}`,
    gender: 'F',
    birthYear: 1998,
    countryCode,
    city,
    stylePreferences: ['Minimal', 'Earth tones'],
    climateProfile: 'TROPICAL',
    discoverable: true,
    contributesToCommunityLooks: true,
    selfieIds: [],
    createdAt: isoMinusDays(120),
    lastActiveAt: isoMinusHours(3),
  };
}

export function seed(target: Store = defaultStore): void {
  const s = target;

  // ---- Sophia ----
  const sophia: User = {
    userId: SOPHIA_ID,
    username: 'sophia',
    displayName: 'Sophia Chen',
    email: 'sophia@example.com',
    avatarUrl: 'https://placehold.co/200x200/F2EAD9/3D4856?text=SC',
    gender: 'F',
    birthYear: 1998,
    countryCode: 'SG',
    city: 'Singapore',
    stylePreferences: ['Minimal', 'Earth tones', 'Linen', 'Tailored'],
    climateProfile: 'TROPICAL',
    discoverable: true,
    contributesToCommunityLooks: true,
    selfieIds: ['sf_sophia_1', 'sf_sophia_2'],
    createdAt: isoMinusDays(180),
    lastActiveAt: NOW_ISO,
  };
  s.users.set(sophia.userId, sophia);

  for (const it of SOPHIA_ITEMS) s.items.set(it.itemId, it);
  // White boxy tee + linen shorts are still PROCESSING — show them in pending review.
  s.pendingItemIds.add('i_top_tee');
  s.pendingItemIds.add('i_bottom_shorts');

  for (const c of SOPHIA_COMBINATIONS) s.combinations.set(c.comboId, c);
  s.todaysPickComboId = 'c_sunday_brunch';

  // ---- Selfies ----
  const sophiaSelfies: Selfie[] = [
    {
      selfieId: 'sf_sophia_1',
      userId: SOPHIA_ID,
      s3Key: 'selfies/u_sophia/sf_sophia_1.jpg',
      uploadedAt: isoMinusDays(7),
    },
    {
      selfieId: 'sf_sophia_2',
      userId: SOPHIA_ID,
      s3Key: 'selfies/u_sophia/sf_sophia_2.jpg',
      uploadedAt: isoMinusDays(2),
    },
  ];
  for (const sel of sophiaSelfies) s.selfies.set(sel.selfieId, sel);

  // ---- Friends ----
  const friends: User[] = [
    mkFriend('u_meili', 'meili', 'Mei Li', 'Singapore', 'SG'),
    mkFriend('u_serena', 'serena_x', 'Serena Tan', 'Singapore', 'SG'),
    mkFriend('u_jia', 'jia.wen', 'Jia Wen', 'Singapore', 'SG'),
    mkFriend('u_amelia', 'amelia', 'Amelia Wong', 'Tokyo', 'JP'),
    mkFriend('u_anna', 'anna', 'Anna Park', 'Seoul', 'KR'),
  ];
  for (const f of friends) {
    s.users.set(f.userId, f);
    s.friendships.push({
      userIdA: SOPHIA_ID,
      userIdB: f.userId,
      createdAt: isoMinusDays(30),
    });
  }

  // A discoverable user who is NOT a friend (used by /friends/search +
  // suggested + /users/{id}). Has at least one public OOTD.
  const lou = mkFriend('u_lou', 'lou', 'Lou Chen', 'Singapore', 'SG');
  s.users.set(lou.userId, lou);

  // Inbound friend request from kimi (also non-friend, discoverable).
  const kimi = mkFriend('u_kimi', 'kimi', 'Kimi Yamada', 'Tokyo', 'JP');
  s.users.set(kimi.userId, kimi);
  const inboundReq: FriendRequest = {
    fromUserId: 'u_kimi',
    toUserId: SOPHIA_ID,
    createdAt: isoMinusHours(20),
    status: 'PENDING',
  };
  s.friendRequests.push(inboundReq);

  // Outbound friend request from sophia to navi (pending).
  const navi = mkFriend('u_navi', 'navi', 'Navi Singh', 'Mumbai', 'IN');
  s.users.set(navi.userId, navi);
  s.friendRequests.push({
    fromUserId: SOPHIA_ID,
    toUserId: 'u_navi',
    createdAt: isoMinusHours(30),
    status: 'PENDING',
  });

  // Phone hash index for /friends/contacts/match.
  s.phoneHashIndex.set('hash_meili', 'u_meili');
  s.phoneHashIndex.set('hash_serena', 'u_serena');

  // ---- OOTD posts (one from Sophia + one each from a few friends so the feed populates) ----
  const sophiaOotd: OOTDPost = {
    ootdId: 'o_sophia_brunch',
    userId: SOPHIA_ID,
    comboId: 'c_sunday_brunch',
    caption: 'brunch in the cream slip ☼',
    locationName: 'Tiong Bahru, Singapore',
    tryOnPhotoUrl: PHOTO,
    fallbackOutfitCardUrl: PHOTO,
    visibility: 'FRIENDS',
    reactions: [{ userId: 'u_meili', type: '♡' }],
    createdAt: isoMinusHours(2),
  };
  s.ootds.set(sophiaOotd.ootdId, sophiaOotd);

  // Each friend gets a placeholder combo + a public OOTD.
  function friendOotd(
    userId: string,
    name: string,
    occasion: 'BRUNCH' | 'WORK' | 'CASUAL' | 'EVENING',
    caption: string,
    location: string,
  ): { combo: Combination; ootd: OOTDPost } {
    const comboId = `c_${userId}_look`;
    const ootdId = `o_${userId}`;
    const combo: Combination = {
      comboId,
      userId,
      name,
      itemIds: ['i_external_a', 'i_external_b'], // not in store; UI renders by post tryOnPhoto
      occasionTags: [occasion],
      source: 'CRAFTED',
      createdAt: isoMinusHours(5),
    };
    const ootd: OOTDPost = {
      ootdId,
      userId,
      comboId,
      caption,
      locationName: location,
      tryOnPhotoUrl: PHOTO,
      fallbackOutfitCardUrl: PHOTO,
      visibility: 'PUBLIC',
      reactions: [],
      createdAt: isoMinusHours(5),
    };
    return { combo, ootd };
  }

  const friendOotds = [
    friendOotd('u_meili', 'sage shirt + jeans', 'CASUAL', 'sunday slow ✦', 'Singapore'),
    friendOotd('u_serena', 'office tuesday', 'WORK', 'back to navy', 'Singapore'),
    friendOotd('u_amelia', 'tokyo evening', 'EVENING', 'shibuya nights', 'Tokyo'),
    friendOotd('u_lou', 'beach pull', 'CASUAL', 'salt + linen', 'Bali'),
    friendOotd('u_jia', 'date night', 'EVENING', '', 'Singapore'),
  ];
  for (const { combo, ootd } of friendOotds) {
    s.combinations.set(combo.comboId, combo);
    s.ootds.set(ootd.ootdId, ootd);
  }

  // ---- Hangout (today's brunch crew) ----
  const hangout: Hangout = {
    hangoutId: 'h_brunch_today',
    ownerId: SOPHIA_ID,
    name: 'Brunch crew',
    startsAt: isoPlusHours(2),
    expiresAt: isoPlusHours(8),
    locationName: 'Tiong Bahru',
    status: 'ACTIVE',
    createdAt: isoMinusHours(20),
  };
  s.hangouts.set(hangout.hangoutId, hangout);

  const hangoutMembers: HangoutMember[] = [
    {
      hangoutId: hangout.hangoutId,
      userId: SOPHIA_ID,
      role: 'OWNER',
      inviteStatus: 'JOINED',
      sharedComboId: 'c_sunday_brunch',
      sharedAt: isoMinusHours(1),
      joinedAt: isoMinusHours(20),
    },
    {
      hangoutId: hangout.hangoutId,
      userId: 'u_meili',
      role: 'MEMBER',
      inviteStatus: 'JOINED',
      joinedAt: isoMinusHours(18),
    },
    {
      hangoutId: hangout.hangoutId,
      userId: 'u_serena',
      role: 'MEMBER',
      inviteStatus: 'INVITED',
      joinedAt: isoMinusHours(20),
    },
  ];
  for (const m of hangoutMembers) s.hangoutMembers.push(m);

  // ---- Chat threads ----
  // Stella thread
  const stellaThread: ChatThread = {
    threadId: 't_stella',
    type: 'STELLA',
    participantIds: [SOPHIA_ID],
    name: 'Stella',
    lastMessage: {
      preview: 'easy — swap the mules for your white sneakers and grab the olive trench.',
      at: isoMinusHours(1),
      senderId: 'u_stella',
    },
    unreadCounts: { [SOPHIA_ID]: 0 },
    createdAt: isoMinusDays(30),
  };
  s.threads.set(stellaThread.threadId, stellaThread);

  // Hangout thread (linked to hangout)
  const hangoutThread: ChatThread = {
    threadId: 't_hangout_brunch',
    type: 'HANGOUT',
    participantIds: [SOPHIA_ID, 'u_meili', 'u_serena'],
    hangoutId: hangout.hangoutId,
    name: 'Brunch crew · 4',
    lastMessage: {
      preview: "yes I'm wearing the cream linen!",
      at: isoMinusHours(0.2),
      senderId: 'u_meili',
    },
    unreadCounts: { [SOPHIA_ID]: 1, u_meili: 0, u_serena: 0 },
    createdAt: isoMinusDays(1),
  };
  s.threads.set(hangoutThread.threadId, hangoutThread);

  // Group thread
  const weddingGroup: ChatThread = {
    threadId: 't_wedding_squad',
    type: 'GROUP',
    participantIds: [SOPHIA_ID, 'u_meili', 'u_jia', 'u_amelia', 'u_anna'],
    name: 'Wedding squad · 6',
    lastMessage: {
      preview: 'sharing my closet picks for sat…',
      at: isoMinusHours(1),
      senderId: 'u_jia',
    },
    unreadCounts: { [SOPHIA_ID]: 0 },
    createdAt: isoMinusDays(14),
  };
  s.threads.set(weddingGroup.threadId, weddingGroup);

  // Direct messages
  const dms: ChatThread[] = [
    {
      threadId: 't_dm_meili',
      type: 'DIRECT',
      participantIds: [SOPHIA_ID, 'u_meili'],
      lastMessage: {
        preview: 'loved your OOTD ♡',
        at: isoMinusHours(3),
        senderId: 'u_meili',
      },
      unreadCounts: { [SOPHIA_ID]: 0, u_meili: 0 },
      createdAt: isoMinusDays(60),
    },
    {
      threadId: 't_dm_serena',
      type: 'DIRECT',
      participantIds: [SOPHIA_ID, 'u_serena'],
      lastMessage: {
        preview: 'coffee tmrw?',
        at: isoMinusDays(1),
        senderId: 'u_serena',
      },
      unreadCounts: { [SOPHIA_ID]: 0, u_serena: 0 },
      createdAt: isoMinusDays(50),
    },
    {
      threadId: 't_dm_jia',
      type: 'DIRECT',
      participantIds: [SOPHIA_ID, 'u_jia'],
      lastMessage: {
        preview: 'send me that linen co-ord ref?',
        at: isoMinusDays(2),
        senderId: 'u_jia',
      },
      unreadCounts: { [SOPHIA_ID]: 2, u_jia: 0 },
      createdAt: isoMinusDays(45),
    },
    {
      threadId: 't_dm_amelia',
      type: 'DIRECT',
      participantIds: [SOPHIA_ID, 'u_amelia'],
      lastMessage: {
        preview: 'tagging you in the lookbook tonight',
        at: isoMinusDays(3),
        senderId: 'u_amelia',
      },
      unreadCounts: { [SOPHIA_ID]: 0, u_amelia: 0 },
      createdAt: isoMinusDays(40),
    },
  ];
  for (const t of dms) s.threads.set(t.threadId, t);

  // Seed a tiny set of messages on a couple of threads.
  const hangoutMsgs: ChatMessage[] = [
    {
      messageId: 'm_h_1',
      threadId: 't_hangout_brunch',
      senderId: SOPHIA_ID,
      kind: 'TEXT',
      text: '11 at the usual?',
      createdAt: isoMinusHours(20),
    },
    {
      messageId: 'm_h_2',
      threadId: 't_hangout_brunch',
      senderId: 'u_serena',
      kind: 'TEXT',
      text: 'yep ✦',
      createdAt: isoMinusHours(19),
    },
    {
      messageId: 'm_h_3',
      threadId: 't_hangout_brunch',
      senderId: SOPHIA_ID,
      kind: 'COMBINATION',
      refId: 'c_sunday_brunch',
      createdAt: isoMinusHours(1),
    },
    {
      messageId: 'm_h_4',
      threadId: 't_hangout_brunch',
      senderId: 'u_meili',
      kind: 'TEXT',
      text: "yes I'm wearing the cream linen!",
      createdAt: isoMinusHours(0.2),
    },
  ];
  s.chatMessages.set('t_hangout_brunch', hangoutMsgs);

  const dmMeiliMsgs: ChatMessage[] = [
    {
      messageId: 'm_dm_1',
      threadId: 't_dm_meili',
      senderId: 'u_meili',
      kind: 'OOTD',
      refId: 'o_sophia_brunch',
      createdAt: isoMinusHours(4),
    },
    {
      messageId: 'm_dm_2',
      threadId: 't_dm_meili',
      senderId: 'u_meili',
      kind: 'TEXT',
      text: 'loved your OOTD ♡',
      createdAt: isoMinusHours(3),
    },
  ];
  s.chatMessages.set('t_dm_meili', dmMeiliMsgs);

  // ---- Stella conversation ----
  // Mirrors `apps/mobile/components/stella/mocks.ts` — same beats so the
  // mobile screen can render this conversation when it switches from local
  // mocks to the API.
  const convo: StellaConversation = {
    convoId: 'sc_brunch',
    userId: SOPHIA_ID,
    title: 'Sunday brunch · what to wear',
    createdAt: isoMinusHours(2),
    lastMessageAt: isoMinusHours(1),
  };
  s.stellaConversations.set(convo.convoId, convo);

  const stellaMsgs: ZStellaMessage[] = [
    {
      messageId: 'sm_1',
      convoId: convo.convoId,
      role: 'ASSISTANT',
      text: 'morning, sophia ☼ brunch at 11 in tiong bahru — want me to put together a look?',
      createdAt: isoMinusHours(2),
    },
    {
      messageId: 'sm_2',
      convoId: convo.convoId,
      role: 'USER',
      text: "Yes! Casual but cute. It's hot today.",
      createdAt: isoMinusHours(2),
    },
    {
      messageId: 'sm_3',
      convoId: convo.convoId,
      role: 'ASSISTANT',
      text: 'pulling from your closet: linen midi + woven mules. straw bag for the heat.',
      createdAt: isoMinusHours(2),
    },
    {
      messageId: 'sm_4',
      convoId: convo.convoId,
      role: 'USER',
      text: 'Love it. What if it rains?',
      createdAt: isoMinusHours(1.5),
    },
    {
      messageId: 'sm_5',
      convoId: convo.convoId,
      role: 'ASSISTANT',
      text: 'easy — swap the mules for your white sneakers and grab the olive trench. still cute, still you ♡',
      createdAt: isoMinusHours(1),
    },
  ];
  s.stellaMessages.set(convo.convoId, stellaMsgs);
}

// Re-export the singleton so callers can import store + seed from the
// same module without duplicating the import.
export { store } from './index.js';
