/**
 * WebSocket Handler
 *
 * Manages real-time bidirectional communication with clients.
 * Supports rooms, broadcasting, and message handling.
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '../utils/demoLogger';
import { validateSession } from '../auth/login';

const logger = new Logger('websocket');

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface ConnectedClient {
  id: string;
  userId?: string;
  socket: WebSocket;
  rooms: Set<string>;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * WebSocketManager handles all WebSocket connections and messaging.
 *
 * Features:
 * - Client connection management
 * - Room-based messaging
 * - Broadcast and unicast messaging
 * - Heartbeat monitoring for connection health
 * - Authentication integration
 *
 * Real-time communication patterns:
 * - Subscribe/unsubscribe to channels
 * - Broadcast updates to all connected clients
 * - Send targeted messages to specific users
 */
export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private messageHandlers: Map<string, (client: ConnectedClient, payload: unknown) => void> = new Map();

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server });
    this.setupServer();
    this.startHeartbeat();
    this.registerDefaultHandlers();
  }

  /**
   * Sets up the WebSocket server event handlers.
   */
  private setupServer(): void {
    this.wss.on('connection', async (socket: WebSocket, req) => {
      const clientId = this.generateClientId();

      // Authenticate the connection
      const token = this.extractToken(req);
      let userId: string | undefined;

      if (token) {
        const isValid = await validateSession(token);
        if (isValid) {
          const payload = JSON.parse(Buffer.from(token, 'base64').toString());
          userId = payload.sub;
        }
      }

      const client: ConnectedClient = {
        id: clientId,
        userId,
        socket,
        rooms: new Set(),
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      this.clients.set(clientId, client);
      logger.info('Client connected', { clientId, userId, totalClients: this.clients.size });

      // Send welcome message
      this.send(client, {
        type: 'connected',
        payload: { clientId, authenticated: !!userId },
        timestamp: Date.now(),
      });

      // Handle incoming messages
      socket.on('message', (data) => this.handleMessage(client, data.toString()));

      // Handle disconnection
      socket.on('close', () => this.handleDisconnect(client));

      // Handle errors
      socket.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
      });
    });
  }

  /**
   * Handles incoming messages from clients.
   */
  private handleMessage(client: ConnectedClient, rawData: string): void {
    client.lastActivity = new Date();

    try {
      const message: WebSocketMessage = JSON.parse(rawData);

      logger.debug('Message received', { clientId: client.id, type: message.type });

      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(client, message.payload);
      } else {
        this.send(client, {
          type: 'error',
          payload: { message: `Unknown message type: ${message.type}` },
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      logger.warn('Invalid message format', { clientId: client.id, error });
      this.send(client, {
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handles client disconnection.
   */
  private handleDisconnect(client: ConnectedClient): void {
    // Remove from all rooms
    for (const room of client.rooms) {
      this.leaveRoom(client, room);
    }

    this.clients.delete(client.id);
    logger.info('Client disconnected', { clientId: client.id, totalClients: this.clients.size });
  }

  /**
   * Registers default message handlers.
   */
  private registerDefaultHandlers(): void {
    // Ping/pong for connection health
    this.on('ping', (client) => {
      this.send(client, { type: 'pong', payload: null, timestamp: Date.now() });
    });

    // Room subscription
    this.on('subscribe', (client, payload: { room: string }) => {
      this.joinRoom(client, payload.room);
    });

    // Room unsubscription
    this.on('unsubscribe', (client, payload: { room: string }) => {
      this.leaveRoom(client, payload.room);
    });

    // Authentication
    this.on('authenticate', async (client, payload: { token: string }) => {
      const isValid = await validateSession(payload.token);
      if (isValid) {
        const tokenPayload = JSON.parse(Buffer.from(payload.token, 'base64').toString());
        client.userId = tokenPayload.sub;
        this.send(client, {
          type: 'authenticated',
          payload: { userId: client.userId },
          timestamp: Date.now(),
        });
      } else {
        this.send(client, {
          type: 'authError',
          payload: { message: 'Invalid token' },
          timestamp: Date.now(),
        });
      }
    });
  }

  /**
   * Registers a message handler for a specific message type.
   */
  on(type: string, handler: (client: ConnectedClient, payload: unknown) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Sends a message to a specific client.
   */
  send(client: ConnectedClient, message: WebSocketMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcasts a message to all connected clients.
   */
  broadcast(message: WebSocketMessage, excludeClient?: string): void {
    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClient) {
        this.send(client, message);
      }
    }
  }

  /**
   * Sends a message to all clients in a specific room.
   */
  broadcastToRoom(room: string, message: WebSocketMessage, excludeClient?: string): void {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return;

    for (const clientId of roomClients) {
      if (clientId !== excludeClient) {
        const client = this.clients.get(clientId);
        if (client) {
          this.send(client, message);
        }
      }
    }
  }

  /**
   * Sends a message to a specific user (all their connections).
   */
  sendToUser(userId: string, message: WebSocketMessage): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        this.send(client, message);
      }
    }
  }

  /**
   * Adds a client to a room.
   */
  joinRoom(client: ConnectedClient, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }

    this.rooms.get(room)!.add(client.id);
    client.rooms.add(room);

    logger.debug('Client joined room', { clientId: client.id, room });

    this.send(client, {
      type: 'roomJoined',
      payload: { room },
      timestamp: Date.now(),
    });
  }

  /**
   * Removes a client from a room.
   */
  leaveRoom(client: ConnectedClient, room: string): void {
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(client.id);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    client.rooms.delete(room);
    logger.debug('Client left room', { clientId: client.id, room });
  }

  /**
   * Starts the heartbeat interval to detect dead connections.
   */
  private startHeartbeat(): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [clientId, client] of this.clients) {
        if (now - client.lastActivity.getTime() > timeout) {
          logger.warn('Client timed out', { clientId });
          client.socket.terminate();
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Generates a unique client ID.
   */
  private generateClientId(): string {
    return `ws_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extracts authentication token from the request.
   */
  private extractToken(req: any): string | null {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('token');
  }

  /**
   * Gets statistics about current connections.
   */
  getStats(): { totalClients: number; authenticatedClients: number; totalRooms: number } {
    return {
      totalClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter((c) => c.userId).length,
      totalRooms: this.rooms.size,
    };
  }

  /**
   * Closes all connections and shuts down the server.
   */
  close(): void {
    for (const client of this.clients.values()) {
      client.socket.close(1001, 'Server shutting down');
    }
    this.wss.close();
  }
}
