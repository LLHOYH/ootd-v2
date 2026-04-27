// GET /_health — unauthenticated liveness probe.
//
// Returns `{ ok, version, time }`. The CDK api-stack will inject
// `SERVICE_VERSION` (commit sha or release tag); locally it falls back to
// 'dev' via `config.serviceVersion`.

import type { Handler } from '../context';
import { config } from '../lib/config';

export const healthHandler: Handler = async () => {
  return {
    status: 200,
    body: {
      ok: true,
      version: config.serviceVersion,
      time: new Date().toISOString(),
    },
  };
};
