// Stella endpoints — see SPEC §7 (Stella).
//
// Most of Stella's surface is served by the Render container at
// services/stylist (POST /stella/conversations/:id/messages streams SSE).
// The api Lambda owns the non-streaming routes:
//   - POST /stella/conversations            (create)
//   - GET  /stella/conversations            (list)
//   - GET  /stella/conversations/:convoId   (detail)
//   - DELETE /stella/conversations/:convoId
//
// Filled in by feat/stella-api. The streaming route stays on the Render
// service.

import type { RouteDef } from '../../router';

export const stellaRoutes: RouteDef[] = [];
