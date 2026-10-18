import { isIPv6 } from 'node:net';
import type { Request } from 'express';

const IPV4_MAPPED = '::ffff:';

/** The groups of one side of a `::`, as numbers ("" has none). */
const groupsOf = (part: string): number[] =>
  part === '' ? [] : part.split(':').map((group) => parseInt(group, 16));

/**
 * The first 64 bits of an IPv6 address, written the same way for every spelling of it
 * (`2001:DB8::1` and `2001:0db8:0:0::2` are the same /64). A household or a mobile carrier hands a
 * customer a whole /64, so counting single addresses would let one caller use billions of buckets.
 */
function prefix64(address: string): string {
  const [head = '', tail] = (address.split('%')[0] ?? address).split('::');
  const first = groupsOf(head);
  const last = tail === undefined ? [] : groupsOf(tail);
  const zeros = Array<number>(Math.max(0, 8 - first.length - last.length)).fill(
    0,
  );
  const groups = tail === undefined ? first : [...first, ...zeros, ...last];
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

/**
 * The caller's address for the per-IP limit of the endpoints that have no identity yet. Express
 * derives `request.ip` from the socket, and from X-Forwarded-For only when `trust proxy` was
 * configured (TRUST_PROXY_HOPS), so a header sent by a client counts only behind trusted proxies.
 * An IPv4 address counts as it is, also in its IPv6-mapped form; an IPv6 address counts by its /64.
 */
export function clientAddressOf(request: Request): string {
  const address = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  if (address.startsWith(IPV4_MAPPED)) return address.slice(IPV4_MAPPED.length);
  return isIPv6(address) ? prefix64(address) : address;
}
