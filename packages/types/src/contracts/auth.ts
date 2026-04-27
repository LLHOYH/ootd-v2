// Auth & profile contracts — SPEC.md §7.2 "Auth & profile".

import { z } from 'zod';
import {
  zUser,
  zGender,
  zClimateProfile,
} from '../entities';

// ---------- Auth tokens (Cognito-shaped) ----------

const zAuthTokens = z.object({
  idToken: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof zAuthTokens>;

// ---------- POST /auth/signup ----------

export const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(30),
  displayName: z.string().min(1).max(60),
});
export type SignupBody = z.infer<typeof SignupBody>;

export const SignupResponse = z.object({
  user: zUser,
  tokens: zAuthTokens,
});
export type SignupResponse = z.infer<typeof SignupResponse>;

// ---------- POST /auth/login ----------

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const LoginResponse = z.object({
  user: zUser,
  tokens: zAuthTokens,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

// ---------- POST /auth/refresh ----------

export const RefreshBody = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const RefreshResponse = z.object({
  tokens: zAuthTokens,
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

// ---------- GET /me ----------

export const GetMeResponse = zUser;
export type GetMeResponse = z.infer<typeof GetMeResponse>;

// ---------- PATCH /me ----------

export const UpdateMeBody = z
  .object({
    displayName: z.string().min(1).max(60),
    avatarUrl: z.string().url(),
    gender: zGender,
    birthYear: z.number().int().min(1900).max(2100),
    countryCode: z.string().length(2),
    city: z.string().max(100),
    stylePreferences: z.array(z.string()).max(50),
    climateProfile: zClimateProfile,
    discoverable: z.boolean(),
    contributesToCommunityLooks: z.boolean(),
  })
  .partial();
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;

export const UpdateMeResponse = zUser;
export type UpdateMeResponse = z.infer<typeof UpdateMeResponse>;

// ---------- DELETE /me ----------
// No body. Empty response.
export { EmptyResponse as DeleteMeResponse } from './shared';
