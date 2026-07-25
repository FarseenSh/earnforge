// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server'

/**
 * Server-side proxy for the LI.FI Earn Data API.
 *
 * The Earn Data API began requiring an `x-lifi-api-key` header in Apr 2026.
 * Before that the Studio could call earn.li.fi straight from the browser; now
 * it cannot, because doing so would mean shipping the key to the client where
 * anyone can read it out of the network tab.
 *
 * So every Earn read goes through here: the browser calls `/api/earn/v1/...`
 * with no credentials, and this route attaches the key server-side. The key is
 * read from `LIFI_API_KEY` and must never carry a `NEXT_PUBLIC_` prefix.
 *
 * Read-only by design — only GET is exported.
 */
const EARN_BASE_URL = 'https://earn.li.fi'

/** Paths the proxy is willing to forward. */
const ALLOWED_PATHS = [
  /^v1\/vaults$/,
  /^v1\/vaults\/\d+\/0x[0-9a-fA-F]{40}$/,
  /^v1\/chains$/,
  /^v1\/protocols$/,
  /^v1\/portfolio\/0x[0-9a-fA-F]{40}\/positions$/,
]

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  const joined = path.join('/')

  // Allowlist rather than blind pass-through: this route holds a credential,
  // so it must not be usable as a general-purpose forwarder.
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(joined))) {
    return NextResponse.json(
      { error: `Path not permitted: ${joined}` },
      { status: 400 }
    )
  }

  const apiKey = process.env.LIFI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'LIFI_API_KEY is not configured. The Earn Data API requires a key — ' +
          'create one at https://portal.li.fi and set it in the environment.',
      },
      { status: 500 }
    )
  }

  const query = new URL(request.url).search
  const upstream = `${EARN_BASE_URL}/${joined}${query}`

  try {
    const res = await fetch(upstream, {
      headers: { 'x-lifi-api-key': apiKey },
      // Vault analytics refresh roughly every 90 minutes in practice despite
      // the documented 15, so a short cache costs nothing and spares the
      // 100 req/min budget.
      next: { revalidate: 60 },
    })

    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to reach the Earn Data API',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
