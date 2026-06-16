import * as Linking from 'expo-linking';
import { supabase } from '../supabase';

const FALLBACK_AUTH_REDIRECT_PATH = '/auth/callback';

/**
 * Supabase email confirmation needs an explicit redirect URL; otherwise the
 * hosted project falls back to its Site URL, which is often localhost in dev.
 */
export function getAuthRedirectUrl(): string {
  const configured = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (configured) return configured;
  return Linking.createURL(FALLBACK_AUTH_REDIRECT_PATH);
}

function paramsFromUrl(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    return new URLSearchParams(url.slice(hashIndex + 1));
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    return new URLSearchParams(url.slice(queryIndex + 1));
  }
  return new URLSearchParams();
}

/**
 * Consumes Supabase Auth redirect URLs.
 *
 * Email signup confirmation commonly returns access/refresh tokens in the
 * hash fragment (implicit flow). PKCE-style links return a `code`. Supporting
 * both keeps the app tolerant of project config changes.
 */
export async function handleAuthRedirectUrl(url: string): Promise<boolean> {
  const params = paramsFromUrl(url);
  const errorCode = params.get('error_code') ?? params.get('error');
  if (errorCode) {
    const description = params.get('error_description') ?? errorCode;
    throw new Error(description);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return true;
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  return false;
}
