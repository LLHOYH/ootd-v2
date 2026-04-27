// SPEC.md §7.2 "Auth & profile" — auth endpoints.
// These bypass the auth preHandler (see util/auth.ts).

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  LoginBody,
  LoginResponse,
  RefreshBody,
  RefreshResponse,
  SignupBody,
  SignupResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

function fakeTokens(userId: string) {
  return {
    idToken: `mock_${userId}`,
    accessToken: `mock_access_${userId}`,
    refreshToken: `mock_refresh_${userId}`,
    expiresIn: 3600,
  };
}

const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/auth/signup',
    withSchema({ body: SignupBody }, async (request, reply) => {
      const body = request.body as z.infer<typeof SignupBody>;
      const userId = `u_${body.username.toLowerCase()}`;
      if (store.users.has(userId)) {
        return sendError(reply, 409, 'CONFLICT', 'User already exists');
      }
      const now = new Date().toISOString();
      const user = {
        userId,
        username: body.username,
        displayName: body.displayName,
        email: body.email,
        stylePreferences: [],
        discoverable: true,
        contributesToCommunityLooks: true,
        selfieIds: [],
        createdAt: now,
        lastActiveAt: now,
      };
      store.users.set(userId, user);
      return validateResponse(request, SignupResponse, {
        user,
        tokens: fakeTokens(userId),
      });
    }),
  );

  app.post(
    '/auth/login',
    withSchema({ body: LoginBody }, async (request, reply) => {
      const body = request.body as z.infer<typeof LoginBody>;
      // Simple lookup by email — first matching user wins.
      const user = [...store.users.values()].find((u) => u.email === body.email);
      if (!user) {
        return sendError(reply, 404, 'NOT_FOUND', 'No user with that email');
      }
      return validateResponse(request, LoginResponse, {
        user,
        tokens: fakeTokens(user.userId),
      });
    }),
  );

  app.post(
    '/auth/refresh',
    withSchema({ body: RefreshBody }, async (request, reply) => {
      const body = request.body as z.infer<typeof RefreshBody>;
      // Tokens look like `mock_refresh_<userId>` — recover user id.
      const prefix = 'mock_refresh_';
      if (!body.refreshToken.startsWith(prefix)) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Invalid refresh token');
      }
      const userId = body.refreshToken.slice(prefix.length);
      if (!store.users.has(userId)) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'User does not exist');
      }
      return validateResponse(request, RefreshResponse, {
        tokens: fakeTokens(userId),
      });
    }),
  );
};

export default authRoutes;
