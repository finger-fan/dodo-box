import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This app has no Server Actions. Requests with the Next-Action header come
// from two sources:
//   1. Clients with stale cached JavaScript after a redeployment
//      (mitigated by NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in docker-compose)
//   2. Security scanners probing CVE-2025-55184 with single-char action IDs
//      like "x", "k", "c"
// Reject both here before they reach the Next.js handler, preventing noise
// in production logs. This is active security enforcement, not log suppression.
export function middleware(request: NextRequest) {
  if (request.method === 'POST' && request.headers.has('Next-Action')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
