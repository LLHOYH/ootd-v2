// Permissive CORS for localhost dev. The real API will be far stricter.

import type { FastifyCorsOptions } from '@fastify/cors';

export const corsOptions: FastifyCorsOptions = {
  origin: true, // reflect Origin header — fine for dev
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-Request-Id',
    'X-Client-Message-Id',
  ],
  exposedHeaders: ['X-Request-Id'],
};
