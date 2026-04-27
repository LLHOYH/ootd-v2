// Mock data for the Today screen shell. No backend in P0 — all data lives here.
// Shapes match SPEC.md §6.2.

import type { ClosetItem, Combination, Occasion } from '@mei/types';

export interface MockUser {
  firstName: string;
  city: string;
  selfieCount: number;
}

export interface MockWeather {
  tempC: number;
  condition: string;
  city: string;
}

export interface MockEvent {
  id: string;
  startLabel: string; // "11:00"
  title: string; // "Brunch with Mei"
  locationName: string;
  occasion: Occasion;
}

export interface MockCommunityLook {
  id: string;
  initials: string;
  username: string;
}

export interface MockFashionItem {
  id: string;
  source: string; // "Paris FW"
  caption: string;
}

export const mockUser: MockUser = {
  firstName: 'Sophia',
  city: 'Singapore',
  selfieCount: 2,
};

export const mockWeather: MockWeather = {
  tempC: 28,
  condition: 'Sunny',
  city: 'Singapore',
};

export const mockToday = new Date(2026, 3, 26); // Sun, 26 April

export const mockEvents: MockEvent[] = [
  {
    id: 'evt-1',
    startLabel: '11:00',
    title: 'Brunch with Mei',
    locationName: 'Tiong Bahru',
    occasion: 'BRUNCH',
  },
  {
    id: 'evt-2',
    startLabel: '19:00',
    title: 'Dinner · Anna',
    locationName: 'Keong Saik',
    occasion: 'DATE',
  },
  {
    id: 'evt-3',
    startLabel: '21:30',
    title: 'Drinks at Atlas',
    locationName: 'Bugis',
    occasion: 'EVENING',
  },
];

export const mockTodaysPickItems: ClosetItem[] = [
  {
    itemId: 'item-dress',
    userId: 'u-sophia',
    category: 'DRESS',
    name: 'Linen slip dress',
    description: 'Cream linen, midi length, thin straps.',
    colors: ['#F2EAD9'],
    fabricGuess: 'linen',
    occasionTags: ['BRUNCH', 'CASUAL'],
    weatherTags: ['HOT', 'WARM'],
    rawPhotoUrl: '',
    tunedPhotoUrl: '',
    thumbnailUrl: '',
    status: 'READY',
    createdAt: '2026-04-10T09:00:00Z',
    updatedAt: '2026-04-10T09:00:00Z',
  },
  {
    itemId: 'item-shoe',
    userId: 'u-sophia',
    category: 'SHOE',
    name: 'Tan leather sandals',
    description: 'Square-toe slingbacks, low block heel.',
    colors: ['#DCC9B6'],
    fabricGuess: 'leather',
    occasionTags: ['BRUNCH', 'CASUAL', 'DATE'],
    weatherTags: ['HOT', 'WARM', 'MILD'],
    rawPhotoUrl: '',
    tunedPhotoUrl: '',
    thumbnailUrl: '',
    status: 'READY',
    createdAt: '2026-04-10T09:05:00Z',
    updatedAt: '2026-04-10T09:05:00Z',
  },
  {
    itemId: 'item-bag',
    userId: 'u-sophia',
    category: 'BAG',
    name: 'Mauve mini bag',
    description: 'Soft leather, top handle, gold clasp.',
    colors: ['#E5D5E0'],
    fabricGuess: 'leather',
    occasionTags: ['BRUNCH', 'DATE', 'EVENING'],
    weatherTags: ['HOT', 'WARM', 'MILD'],
    rawPhotoUrl: '',
    tunedPhotoUrl: '',
    thumbnailUrl: '',
    status: 'READY',
    createdAt: '2026-04-10T09:10:00Z',
    updatedAt: '2026-04-10T09:10:00Z',
  },
];

export const mockTodaysPick: Combination = {
  comboId: 'combo-today-1',
  userId: 'u-sophia',
  name: 'Brunch in the cream slip',
  itemIds: mockTodaysPickItems.map((i) => i.itemId),
  occasionTags: ['BRUNCH', 'CASUAL'],
  source: 'TODAY_PICK',
  createdAt: '2026-04-26T07:00:00Z',
};

export const mockCommunityLooks: MockCommunityLook[] = [
  { id: 'u-1', initials: 'AY', username: 'aiyana' },
  { id: 'u-2', initials: 'JP', username: 'juno' },
  { id: 'u-3', initials: 'KM', username: 'kimi' },
  { id: 'u-4', initials: 'LR', username: 'lou' },
  { id: 'u-5', initials: 'NV', username: 'navi' },
];

export const mockFashionNow: MockFashionItem[] = [
  { id: 'f-1', source: 'Paris FW', caption: 'Slip dresses, layered.' },
  { id: 'f-2', source: 'Editorial', caption: 'Tan leather, head to toe.' },
  { id: 'f-3', source: 'Instagram', caption: 'Sheer knits over cotton.' },
  { id: 'f-4', source: 'Milan FW', caption: 'Ballet flats are back.' },
];
