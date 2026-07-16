// /api/config - Runtime configuration endpoint
// Returns server-side environment variables to the client.
// This avoids NEXT_PUBLIC_* build-time inlining for deployment-sensitive values.

import { NextResponse } from 'next/server'

export async function GET() {
  const defaultRelays = 'wss://relay.damus.io'
  const relays = (process.env.DEFAULT_RELAYS || process.env.NEXT_PUBLIC_DEFAULT_RELAYS || defaultRelays)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return NextResponse.json({ relays })
}
