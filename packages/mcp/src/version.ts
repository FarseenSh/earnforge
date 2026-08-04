// SPDX-License-Identifier: Apache-2.0

import pkg from '../package.json' with { type: 'json' }

/**
 * The version this server reports to clients.
 *
 * Read from package.json rather than written out, because it was hardcoded as
 * `'1.0.0'` in two separate places and stayed there through three releases —
 * the hosted Worker advertised `serverInfo.version: 1.0.0` while npm served
 * 1.0.2. A client using that value to identify a build was being told the
 * wrong thing, and nothing could have caught it: the string was self-consistent
 * everywhere it appeared.
 */
export const SERVER_VERSION: string = pkg.version
