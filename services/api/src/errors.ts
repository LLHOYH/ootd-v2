// ApiError — domain error type translated to the SPEC §7.1 error envelope:
//   { error: { code, message } }
//
// Handlers should throw ApiError; the top-level wrapper in index.ts converts
// it to the APIGW response. Unknown errors map to a 500 INTERNAL.

import type { ErrorBody } from '@mei/types';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }

  toErrorBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/** Build a generic 500 envelope for unknown errors. */
export function internalErrorBody(message = 'Internal server error'): ErrorBody {
  return { error: { code: 'INTERNAL', message } };
}
