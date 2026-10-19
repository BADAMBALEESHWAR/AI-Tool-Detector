import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from './config';

/**
 * One Socket.IO connection shared by the whole admin console. Each component
 * acquires a handle; `disconnect()` on a handle removes only that handle's
 * listeners, and the real connection closes when the last handle is released.
 */
export interface AdminSocket {
  on(event: string, listener: (...args: any[]) => void): AdminSocket;
  disconnect(): void;
}

let shared: Socket | null = null;
let sharedToken: string | null = null;
let users = 0;

export function acquireAdminSocket(token: string): AdminSocket {
  if (!shared || sharedToken !== token) {
    shared?.disconnect();
    shared = io(SOCKET_URL, { auth: { token, role: 'admin' } });
    sharedToken = token;
    users = 0;
  }
  const socket = shared;
  users++;

  const mine: [string, (...args: any[]) => void][] = [];
  let released = false;

  const handle: AdminSocket = {
    on(event, listener) {
      socket.on(event, listener);
      mine.push([event, listener]);
      // A late subscriber would otherwise miss the connect event that already happened.
      if (event === 'connect' && socket.connected) queueMicrotask(() => listener());
      return handle;
    },
    disconnect() {
      if (released) return;
      released = true;
      for (const [event, listener] of mine) socket.off(event, listener);
      if (socket === shared && --users <= 0) {
        socket.disconnect();
        shared = null;
        sharedToken = null;
      }
    },
  };
  return handle;
}
