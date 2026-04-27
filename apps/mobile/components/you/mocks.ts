import type { User } from '@mei/types';

/**
 * Mock data for the You / profile screen (SPEC §10.11).
 * Visual-only — no real updates wired in v1 of this screen.
 */
export type MockProfile = Pick<
  User,
  | 'displayName'
  | 'username'
  | 'city'
  | 'avatarUrl'
  | 'stylePreferences'
  | 'climateProfile'
  | 'discoverable'
  | 'contributesToCommunityLooks'
> & {
  initials: string;
  itemCount: number;
  ootdCount: number;
  friendCount: number;
  email: string;
  gender: string;
  birthYear: number;
  selfieCount: number;
};

export const mockProfile: MockProfile = {
  displayName: 'Sophia Chen',
  username: 'sophiastyles',
  city: 'Singapore',
  avatarUrl: undefined,
  stylePreferences: ['Minimal', 'Earth tones', 'Linen', 'Tailored', 'Soft pastels'],
  climateProfile: 'TROPICAL',
  discoverable: true,
  contributesToCommunityLooks: true,
  initials: 'SC',
  itemCount: 84,
  ootdCount: 27,
  friendCount: 156,
  email: 'sophia@example.com',
  gender: 'Female',
  birthYear: 1998,
  selfieCount: 4,
};
