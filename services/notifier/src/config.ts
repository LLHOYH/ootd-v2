// Environment configuration for the notifier service.

export type NotifierMode = 'real' | 'mock';

export interface NotifierConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** When set, requests must include x-webhook-secret matching this value. */
  webhookSecret?: string;
  /**
   * Optional Expo Push access token. Anonymous Expo Push works fine for
   * development; production should set EXPO_ACCESS_TOKEN to authenticate
   * the project's push API and lift the rate-limit ceiling.
   */
  expoAccessToken?: string;
  mode: NotifierMode;
  logLevel?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadConfig(): NotifierConfig {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = process.env.NOTIFIER_WEBHOOK_SECRET;
  const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;
  const rawMode = process.env.NOTIFIER_MODE;
  const logLevel = process.env.LOG_LEVEL;

  let mode: NotifierMode;
  if (rawMode === 'mock') mode = 'mock';
  else if (rawMode === 'real') mode = 'real';
  else mode = 'mock'; // safe default — only flip to real when explicitly opted in

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    webhookSecret,
    expoAccessToken,
    mode,
    logLevel,
  };
}
