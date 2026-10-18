import type { Request } from 'express';
import { clientAddressOf } from '../../../src/platform/http/client-address.js';

const request = (ip: string | undefined, remote?: string): Request =>
  ({ ip, socket: { remoteAddress: remote } }) as unknown as Request;

describe('clientAddressOf', () => {
  it('uses the address Express worked out', () => {
    expect(clientAddressOf(request('203.0.113.9'))).toBe('203.0.113.9');
  });

  it('treats an IPv4 address in IPv6-mapped form as the same caller', () => {
    expect(clientAddressOf(request('::ffff:203.0.113.9'))).toBe('203.0.113.9');
  });

  it('keeps an IPv4 address as it is', () => {
    expect(clientAddressOf(request('198.51.100.4'))).toBe('198.51.100.4');
  });

  it('counts two IPv6 addresses in one /64 as one caller', () => {
    const a = clientAddressOf(request('2001:db8:1:2::1'));
    const b = clientAddressOf(request('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));

    expect(a).toBe(b);
    expect(a).toBe('2001:db8:1:2::/64');
  });

  it('counts two IPv6 addresses in different /64s as different callers', () => {
    const a = clientAddressOf(request('2001:db8:1:2::1'));

    expect(clientAddressOf(request('2001:db8:1:3::1'))).not.toBe(a);
    expect(clientAddressOf(request('2001:db8:2:2::1'))).not.toBe(a);
    expect(clientAddressOf(request('2001:db9:1:2::1'))).not.toBe(a);
    expect(clientAddressOf(request('2001:db8:1:2:8000::1'))).toBe(a);
  });

  it('reads every spelling of an IPv6 address the same way', () => {
    const expected = '2001:db8:0:0::/64';

    expect(clientAddressOf(request('2001:db8::1'))).toBe(expected);
    expect(
      clientAddressOf(request('2001:0DB8:0000:0000:0000:0000:0000:0002')),
    ).toBe(expected);
    expect(clientAddressOf(request('2001:db8:0:0::ffff'))).toBe(expected);
    expect(clientAddressOf(request('fe80::1%eth0'))).toBe('fe80:0:0:0::/64');
    expect(clientAddressOf(request('::1'))).toBe('0:0:0:0::/64');
    expect(clientAddressOf(request('2001:db8:1:2:3:4:5:6'))).toBe(
      '2001:db8:1:2::/64',
    );
  });

  it('falls back to the socket, and then to one shared bucket', () => {
    expect(clientAddressOf(request(undefined, '198.51.100.4'))).toBe(
      '198.51.100.4',
    );
    expect(clientAddressOf(request(undefined))).toBe('unknown');
  });
});
