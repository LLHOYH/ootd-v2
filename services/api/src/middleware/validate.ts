// validate — runs Zod schemas against parts of the RequestContext and
// returns the parsed/typed values. On failure, throws `ApiError(400)` with
// a compact summary of the Zod issues.
//
// Route handlers call this at the top of their function:
//
//   const { body } = validate({ body: CreateClosetItemReq }, ctx);
//
// We hand back parsed values rather than mutating ctx so handlers stay
// strongly typed at call sites.

import { z, ZodError, type ZodTypeAny } from 'zod';
import type { RequestContext } from '../context';
import { ApiError } from '../errors';

export interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export type Parsed<S extends Schemas> = {
  body: S['body'] extends ZodTypeAny ? z.infer<S['body']> : undefined;
  query: S['query'] extends ZodTypeAny ? z.infer<S['query']> : undefined;
  params: S['params'] extends ZodTypeAny ? z.infer<S['params']> : undefined;
};

function summarise(err: ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length ? i.path.join('.') : '<root>';
      return `${path}: ${i.message}`;
    })
    .join('; ');
}

export function validate<S extends Schemas>(
  schemas: S,
  ctx: RequestContext,
): Parsed<S> {
  const out = { body: undefined, query: undefined, params: undefined } as Parsed<S>;
  try {
    if (schemas.body) {
      (out as { body: unknown }).body = schemas.body.parse(ctx.body);
    }
    if (schemas.query) {
      (out as { query: unknown }).query = schemas.query.parse(ctx.query);
    }
    if (schemas.params) {
      (out as { params: unknown }).params = schemas.params.parse(ctx.params);
    }
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(400, 'VALIDATION', summarise(err));
    }
    throw err;
  }
  return out;
}
