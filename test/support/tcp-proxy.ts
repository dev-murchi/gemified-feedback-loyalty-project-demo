import { createServer, connect, type Socket } from 'node:net';

export interface TcpProxy {
  readonly host: string;
  readonly port: number;
  /** Drops every connection and stops listening: for the client, the server went away. */
  cut(): Promise<void>;
}

/**
 * A plain TCP forwarder in front of a real server. A test that must see a server disappear points
 * its client here and cuts the proxy; the run's shared server, which other test files use, is
 * never stopped.
 */
export async function startProxy(target: {
  readonly host: string;
  readonly port: number;
}): Promise<TcpProxy> {
  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  };
  const server = createServer((client) => {
    const upstream = connect(target);
    track(client);
    track(upstream);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The proxy has no TCP address');
  return {
    host: '127.0.0.1',
    port: address.port,
    cut: () => {
      sockets.forEach((socket) => socket.destroy());
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
