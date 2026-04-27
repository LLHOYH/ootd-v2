// SPEC.md §7.2 "Hangouts".

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Hangout, HangoutMember } from '@mei/types';
import {
  CreateHangoutBody,
  CreateHangoutResponse,
  ExpireHangoutResponse,
  GetHangoutResponse,
  ListHangoutsResponse,
  ShareHangoutOutfitBody,
  ShareHangoutOutfitResponse,
  UpdateHangoutBody,
  UpdateHangoutResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { sendError } from '../util/errors.js';
import { requireUserId } from '../util/auth.js';
import { validateResponse, withSchema } from '../middleware/validate.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const hangoutRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/hangouts',
    withSchema({ body: CreateHangoutBody }, async (request) => {
      const userId = requireUserId(request);
      const body = request.body as z.infer<typeof CreateHangoutBody>;
      const hangoutId = store.nextId('h');
      const hangout: Hangout = {
        hangoutId,
        ownerId: userId,
        name: body.name,
        startsAt: body.startsAt,
        expiresAt: new Date(
          new Date(body.startsAt).getTime() + ONE_DAY_MS,
        ).toISOString(),
        ...(body.locationName && { locationName: body.locationName }),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };
      store.hangouts.set(hangoutId, hangout);

      const now = new Date().toISOString();
      const members: HangoutMember[] = [
        {
          hangoutId,
          userId,
          role: 'OWNER',
          inviteStatus: 'JOINED',
          joinedAt: now,
        },
        ...body.memberIds
          .filter((id) => id !== userId)
          .map<HangoutMember>((memberId) => ({
            hangoutId,
            userId: memberId,
            role: 'MEMBER',
            inviteStatus: 'INVITED',
            joinedAt: now,
          })),
      ];
      for (const m of members) store.hangoutMembers.push(m);
      return validateResponse(request, CreateHangoutResponse, {
        hangout,
        members,
      });
    }),
  );

  app.get('/hangouts', async (request) => {
    const userId = requireUserId(request);
    const all = store.hangoutsFor(userId);
    const active = all.filter((h) => h.status === 'ACTIVE');
    const recent = all.filter((h) => h.status !== 'ACTIVE');
    return validateResponse(request, ListHangoutsResponse, { active, recent });
  });

  app.get(
    '/hangouts/:hangoutId',
    withSchema(
      { params: z.object({ hangoutId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const hangout = store.hangouts.get(hangoutId);
        if (!hangout) return sendError(reply, 404, 'NOT_FOUND', 'Hangout not found');
        const members = store.membersOf(hangoutId);
        if (!members.some((m) => m.userId === userId)) {
          return sendError(reply, 403, 'FORBIDDEN', 'Not a member');
        }
        return validateResponse(request, GetHangoutResponse, { hangout, members });
      },
    ),
  );

  app.patch(
    '/hangouts/:hangoutId',
    withSchema(
      {
        params: z.object({ hangoutId: z.string() }),
        body: UpdateHangoutBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const hangout = store.hangouts.get(hangoutId);
        if (!hangout) return sendError(reply, 404, 'NOT_FOUND', 'Hangout not found');
        if (hangout.ownerId !== userId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Owner only');
        }
        const patch = request.body as z.infer<typeof UpdateHangoutBody>;
        const updated: Hangout = { ...hangout, ...patch };
        store.hangouts.set(hangoutId, updated);
        return validateResponse(request, UpdateHangoutResponse, updated);
      },
    ),
  );

  app.post(
    '/hangouts/:hangoutId/expire',
    withSchema(
      { params: z.object({ hangoutId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const hangout = store.hangouts.get(hangoutId);
        if (!hangout) return sendError(reply, 404, 'NOT_FOUND', 'Hangout not found');
        if (hangout.ownerId !== userId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Owner only');
        }
        const updated: Hangout = { ...hangout, status: 'EXPIRED' };
        store.hangouts.set(hangoutId, updated);
        return validateResponse(request, ExpireHangoutResponse, updated);
      },
    ),
  );

  app.post(
    '/hangouts/:hangoutId/share',
    withSchema(
      {
        params: z.object({ hangoutId: z.string() }),
        body: ShareHangoutOutfitBody,
      },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const body = request.body as z.infer<typeof ShareHangoutOutfitBody>;
        const idx = store.hangoutMembers.findIndex(
          (m) => m.hangoutId === hangoutId && m.userId === userId,
        );
        if (idx < 0) return sendError(reply, 403, 'FORBIDDEN', 'Not a member');
        const existing = store.hangoutMembers[idx]!;
        const updated: HangoutMember = {
          ...existing,
          sharedComboId: body.comboId,
          sharedAt: new Date().toISOString(),
        };
        store.hangoutMembers[idx] = updated;
        return validateResponse(request, ShareHangoutOutfitResponse, {
          member: updated,
        });
      },
    ),
  );

  app.post(
    '/hangouts/:hangoutId/leave',
    withSchema(
      { params: z.object({ hangoutId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const before = store.hangoutMembers.length;
        store.hangoutMembers = store.hangoutMembers.filter(
          (m) => !(m.hangoutId === hangoutId && m.userId === userId),
        );
        if (store.hangoutMembers.length === before) {
          return sendError(reply, 404, 'NOT_FOUND', 'Not a member of that hangout');
        }
        return {};
      },
    ),
  );

  app.delete(
    '/hangouts/:hangoutId',
    withSchema(
      { params: z.object({ hangoutId: z.string() }) },
      async (request, reply) => {
        const userId = requireUserId(request);
        const { hangoutId } = request.params as { hangoutId: string };
        const hangout = store.hangouts.get(hangoutId);
        if (!hangout) return sendError(reply, 404, 'NOT_FOUND', 'Hangout not found');
        if (hangout.ownerId !== userId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Owner only');
        }
        const updated: Hangout = { ...hangout, status: 'CANCELLED' };
        store.hangouts.set(hangoutId, updated);
        return {};
      },
    ),
  );
};

export default hangoutRoutes;
