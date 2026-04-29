// POST /friends/contacts/match — phone-hash contact match.
//
// SPEC §7.2 (Friends) + §10.12 (Add friends). The server never sees raw
// phone numbers — the client hashes them with a server-pinned salt and
// posts the hashes here.
//
// P0 stub. The body is validated against `ContactsMatchBody` so callers
// get a real 400 on malformed input, but matches always returns `[]`.
//
// TODO(P1): hash-match against `users.phone_hash`. The column does not
// yet exist in the schema; landing this requires:
//   - Migration to add `users.phone_hash text unique` (nullable; only
//     populated for users who opt in to contact discovery).
//   - Auth-flow change so signup with a phone number stores the hash.
//   - Index on `phone_hash` for the IN-list lookup.
// Until then, a real query would 500 on every call.

import type { Handler } from '../../context';
import type { ContactsMatchResponse } from '@mei/types';
import { ContactsMatchBody } from '@mei/types';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

export const contactsMatchHandler: Handler = async (ctx) => {
  requireAuthCtx(ctx);
  // Validate so payload errors are caught even though we don't act on it.
  validate({ body: ContactsMatchBody }, ctx);
  const body: ContactsMatchResponse = { matches: [] };
  return { status: 200, body };
};
