import { createServer, type Socket } from 'node:net';

export async function fakeSmtp() {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setEncoding('utf8');
    socket.write('220 localhost SMTP fixture\r\n');

    let buffer = '';
    let body: string | null = null;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (body !== null) {
          if (line === '.') {
            messages.push(body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));
            body = null;
            socket.write('250 queued locally\r\n');
          } else {
            body += line + '\r\n';
          }
        } else if (line === 'DATA') {
          body = '';
          socket.write('354 End with a dot\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 Closed\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SMTP fixture has no TCP port');
  return {
    url: `smtp://127.0.0.1:${address.port}`,
    messages,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
