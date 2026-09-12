import { toNextJsHandler } from "better-auth/next-js";
import { type NextRequest } from "next/server";

import { auth } from "~/server/better-auth";
import { corsHeaders } from "~/server/cors";

const { GET: baseGet, POST: basePost } = toNextJsHandler(auth.handler);

/**
 * The browser extension signs in against these routes from its own origin, so
 * every response needs CORS headers - including the sign-in reply, whose
 * `set-auth-token` header is the whole point and is invisible cross-origin
 * unless it is explicitly exposed.
 */
function withCors(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const response = await handler(req);
    for (const [k, v] of Object.entries(corsHeaders(req.headers.get("origin")))) {
      response.headers.set(k, v);
    }
    return response;
  };
}

/** Preflight. Without it the browser never sends the Authorization header. */
export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export const GET = withCors(baseGet);
export const POST = withCors(basePost);
