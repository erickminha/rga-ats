import { createConnection } from 'node:net';

/** ClamAV INSTREAM over a private socket. Only a positive clean response permits storage. */
export async function scanUpload(data: Buffer) {
  const host = process.env.FILE_SCAN_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) throw new Error('FILE_SCAN_NOT_CONFIGURED');
    return;
  }
  const port = Number(process.env.FILE_SCAN_PORT ?? '3310');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FILE_SCAN_NOT_CONFIGURED');

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let answer = '';
    const timeout = setTimeout(() => socket.destroy(new Error('FILE_SCAN_TIMEOUT')), 15_000);
    socket.on('error', () => reject(new Error('FILE_SCAN_UNAVAILABLE')));
    socket.on('close', () => {
      clearTimeout(timeout);
      if (answer.trim().replace(/\0$/, '') === 'stream: OK') resolve();
      else reject(new Error('FILE_SCAN_REJECTED'));
    });
    socket.on('data', (chunk: Buffer) => {
      answer += chunk.toString('utf8');
      if (answer.length > 256 || answer.includes('\0')) socket.destroy();
    });
    socket.once('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        const chunk = data.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
