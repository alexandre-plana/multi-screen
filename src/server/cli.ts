#!/usr/bin/env node
/**
 * `npx multi-screen-relay [--port 8787] [--host 0.0.0.0]`
 * Starts a WebSocket relay (needs the optional `ws` dependency).
 */
import { attachWebSocketServer, createRelay } from './relay.js';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : (process.env[`MULTI_SCREEN_${name.toUpperCase()}`] ?? fallback);
};
const port = Number(option('port', '8787'));
const host = option('host', '0.0.0.0');

let ws: { WebSocketServer: new (options: { port: number; host: string }) => unknown };
try {
  ws = (await import('ws')) as unknown as typeof ws;
} catch {
  console.error('multi-screen-relay needs the "ws" package: npm install ws');
  process.exit(1);
}
const server = new ws.WebSocketServer({ port, host });
const relay = attachWebSocketServer(server as Parameters<typeof attachWebSocketServer>[0], createRelay());
console.log(`multi-screen relay listening on ws://${host}:${port} (rooms: ?room=<name>)`);
process.on('SIGINT', () => {
  relay.close();
  process.exit(0);
});
