import fs from 'node:fs';
import net from 'node:net';
import { expect } from 'rstack/test';

export const toPosixPath: (filePath: string) => string = (filePath) => filePath.replace(/\\/g, '/');

function isPortAvailable(port: number) {
  try {
    const server = net.createServer().listen(port);
    return new Promise((resolve) => {
      server.on('listening', () => {
        server.close();
        resolve(true);
      });
      server.on('error', () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

const portMap = new Map();

/**
 * Get a random port
 * Available port ranges: 1024 ～ 65535
 * `10080` is not available on macOS CI, `> 50000` get 'permission denied' on Windows.
 * so we use `15000` ~ `45000`.
 */
export async function getRandomPort(
  defaultPort: number = Math.ceil(Math.random() * 30000) + 15000,
): Promise<number> {
  let port = defaultPort;
  while (true) {
    if (!portMap.get(port) && (await isPortAvailable(port))) {
      portMap.set(port, 1);
      return port;
    }
    port++;
  }
}

/**
 * Expect a file to exist
 */
export const expectFile = (dir: string): Promise<void> =>
  expectPoll(() => fs.existsSync(dir)).toBeTruthy();

/**
 * A faster `expect.poll`
 */
export const expectPoll: typeof expect.poll = (fn) => {
  return expect.poll(fn, {
    interval: 50,
    timeout: 5_000,
  });
};
