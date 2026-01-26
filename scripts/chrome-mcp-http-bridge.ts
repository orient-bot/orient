#!/usr/bin/env npx tsx
/**
 * Chrome MCP HTTP Bridge
 *
 * Exposes the Chrome extension's MCP socket over HTTP, allowing
 * Docker containers to access Chrome MCP tools.
 *
 * Architecture:
 *   Chrome Extension → Native Host → Unix Socket ← This Bridge → HTTP → Docker Claude
 *
 * The Chrome native host creates a Unix socket at:
 *   /tmp/claude-mcp-browser-bridge-<username>/<pid>.sock
 *
 * This bridge:
 *   1. Finds the active Chrome MCP socket
 *   2. Exposes it over HTTP using Streamable HTTP transport
 *   3. Docker Claude connects via http://host.docker.internal:<port>/mcp
 *
 * Usage:
 *   npx tsx scripts/chrome-mcp-http-bridge.ts
 *
 * Options (via environment):
 *   CHROME_MCP_BRIDGE_PORT - HTTP port (default: 9877)
 *   CHROME_MCP_BRIDGE_HOST - Bind address (default: 127.0.0.1)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { createConnection, Socket } from "net";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// Configuration
const PORT = parseInt(process.env.CHROME_MCP_BRIDGE_PORT || "9877");
const HOST = process.env.CHROME_MCP_BRIDGE_HOST || "127.0.0.1";
const USERNAME = process.env.USER || process.env.USERNAME || "user";
const SOCKET_DIR = `/tmp/claude-mcp-browser-bridge-${USERNAME}`;

interface Session {
  id: string;
  socket: Socket;
  pendingRequests: Map<string | number, (response: unknown) => void>;
  sseClients: Set<ServerResponse>;
  buffer: Buffer;  // Binary buffer for length-prefixed protocol
  connected: boolean;
}

const sessions = new Map<string, Session>();

function log(message: string, ...args: unknown[]) {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

function findActiveSocket(): string | null {
  try {
    const files = readdirSync(SOCKET_DIR);
    for (const file of files) {
      if (file.endsWith(".sock")) {
        const socketPath = join(SOCKET_DIR, file);
        const stat = statSync(socketPath);
        if (stat.isSocket()) {
          return socketPath;
        }
      }
    }
  } catch (err) {
    log("Error finding socket:", err);
  }
  return null;
}

function createSession(): Session | null {
  const socketPath = findActiveSocket();
  if (!socketPath) {
    log("No active Chrome MCP socket found");
    log(`Looking in: ${SOCKET_DIR}`);
    return null;
  }

  const id = randomUUID();
  log(`Creating session ${id}, connecting to ${socketPath}`);

  const socket = createConnection(socketPath);

  const session: Session = {
    id,
    socket,
    pendingRequests: new Map(),
    sseClients: new Set(),
    buffer: Buffer.alloc(0),  // Binary buffer for length-prefixed protocol
    connected: false,
  };

  socket.on("connect", () => {
    session.connected = true;
    log(`Session ${id}: Connected to Chrome MCP socket`);
  });

  socket.on("data", (data: Buffer) => {
    // Append to binary buffer
    session.buffer = Buffer.concat([session.buffer, data]);

    // Process complete length-prefixed messages
    // Protocol: 4-byte little-endian length + JSON payload
    while (session.buffer.length >= 4) {
      const msgLength = session.buffer.readUInt32LE(0);

      // Sanity check on message length (max 100MB)
      if (msgLength > 100 * 1024 * 1024) {
        log(`Session ${id}: Invalid message length: ${msgLength}`);
        session.buffer = Buffer.alloc(0);
        break;
      }

      // Check if we have the complete message
      if (session.buffer.length < 4 + msgLength) {
        break; // Wait for more data
      }

      // Extract the message
      const jsonData = session.buffer.slice(4, 4 + msgLength).toString("utf8");
      session.buffer = session.buffer.slice(4 + msgLength);

      try {
        const message = JSON.parse(jsonData);
        handleMcpMessage(session, message);
      } catch (err) {
        log(`Session ${id}: Failed to parse message:`, jsonData.substring(0, 100));
      }
    }
  });

  socket.on("close", () => {
    log(`Session ${id}: Socket closed`);
    session.connected = false;
    sessions.delete(id);

    // Close all SSE connections
    for (const client of session.sseClients) {
      client.end();
    }
  });

  socket.on("error", (err) => {
    log(`Session ${id}: Socket error:`, err);
    session.connected = false;
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

function handleMcpMessage(session: Session, message: unknown) {
  const msg = message as { id?: string | number; method?: string; result?: unknown; error?: unknown };

  // Debug: log the full message
  log(`Session ${session.id}: Received message:`, JSON.stringify(message).substring(0, 500));

  // If this is a response (has result or error), look up by ID
  if (msg.result !== undefined || msg.error !== undefined) {
    log(`Session ${session.id}: This is a response with id=${msg.id}, pending IDs:`, Array.from(session.pendingRequests.keys()));

    if (msg.id !== undefined && session.pendingRequests.has(msg.id)) {
      const resolve = session.pendingRequests.get(msg.id)!;
      session.pendingRequests.delete(msg.id);
      log(`Session ${session.id}: Resolving request ${msg.id}`);
      resolve(message);
      return;
    } else {
      log(`Session ${session.id}: No pending request for id=${msg.id}`);
    }
  }

  // If this is a server-initiated request/notification (has method), send to SSE clients
  if (msg.method) {
    log(`Session ${session.id}: Server notification:`, msg.method);
    const sseData = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of session.sseClients) {
      client.write(sseData);
    }
  }
}

function sendToMcp(session: Session, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!session.connected) {
      reject(new Error("Socket not connected"));
      return;
    }

    const msg = message as { id?: string | number };

    if (msg.id !== undefined) {
      log(`Session ${session.id}: Sending request with id=${msg.id}, type=${typeof msg.id}`);
      session.pendingRequests.set(msg.id, resolve);

      // Timeout after 60 seconds (browser operations can be slow)
      setTimeout(() => {
        if (session.pendingRequests.has(msg.id!)) {
          session.pendingRequests.delete(msg.id!);
          reject(new Error("Request timeout"));
        }
      }, 60000);
    }

    // Chrome MCP uses length-prefixed binary protocol (4-byte LE length + JSON)
    const jsonData = JSON.stringify(message);
    const jsonBuffer = Buffer.from(jsonData, "utf8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
    const data = Buffer.concat([lengthBuffer, jsonBuffer]);

    session.socket.write(data, (err) => {
      if (err) {
        session.pendingRequests.delete(msg.id!);
        reject(err);
      } else if (msg.id === undefined) {
        // Notifications don't expect a response
        resolve(undefined);
      }
    });
  });
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  session: Session
) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const message = JSON.parse(body);
    const msg = message as { id?: string | number; method?: string };

    log(`Received: ${msg.method || "response"} ${msg.id ? `(id: ${msg.id})` : ""}`);

    // Check if this is a notification (no response expected)
    if (msg.id === undefined || !msg.method) {
      await sendToMcp(session, message);
      res.writeHead(202);
      res.end();
      return;
    }

    // This is a request - wait for response
    const response = await sendToMcp(session, message);

    // Check Accept header for SSE preference
    const accept = req.headers.accept || "";
    if (accept.includes("text/event-stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Mcp-Session-Id": session.id,
      });

      res.write(`data: ${JSON.stringify(response)}\n\n`);
      res.end();
    } else {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Mcp-Session-Id": session.id,
      });
      res.end(JSON.stringify(response));
    }
  } catch (err) {
    log(`Error handling POST:`, err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: String(err) },
      })
    );
  }
}

function handleGet(req: IncomingMessage, res: ServerResponse, session: Session) {
  const accept = req.headers.accept || "";

  if (!accept.includes("text/event-stream")) {
    res.writeHead(406);
    res.end("SSE not accepted");
    return;
  }

  log(`SSE client connected to session ${session.id}`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Mcp-Session-Id": session.id,
  });

  session.sseClients.add(res);

  req.on("close", () => {
    log(`SSE client disconnected from session ${session.id}`);
    session.sseClients.delete(res);
  });
}

function handleDelete(
  _req: IncomingMessage,
  res: ServerResponse,
  session: Session
) {
  log(`Terminating session ${session.id}`);

  session.socket.destroy();
  sessions.delete(session.id);

  for (const client of session.sseClients) {
    client.end();
  }

  res.writeHead(200);
  res.end();
}

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname === "/health") {
    const socketPath = findActiveSocket();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: socketPath ? "ok" : "no_socket",
      socketPath,
      activeSessions: sessions.size,
    }));
    return;
  }

  // Only handle /mcp endpoint
  if (url.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Get or create session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let session: Session | undefined;

  if (sessionId) {
    session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }
  }

  // For initialization requests, create new session
  if (!session && req.method === "POST") {
    session = createSession();
    if (!session) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Chrome MCP socket not available. Make sure Chrome is open with the Claude extension.",
        },
      }));
      return;
    }

    // Wait for socket to connect
    await new Promise<void>((resolve) => {
      if (session!.connected) {
        resolve();
      } else {
        session!.socket.once("connect", resolve);
        setTimeout(resolve, 5000); // Timeout after 5s
      }
    });

    if (!session.connected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Failed to connect to Chrome MCP socket" },
      }));
      sessions.delete(session.id);
      return;
    }
  }

  if (!session) {
    res.writeHead(400);
    res.end("Session required");
    return;
  }

  switch (req.method) {
    case "POST":
      await handlePost(req, res, session);
      break;
    case "GET":
      handleGet(req, res, session);
      break;
    case "DELETE":
      handleDelete(req, res, session);
      break;
    default:
      res.writeHead(405);
      res.end("Method not allowed");
  }
});

// Check socket availability before starting
const initialSocket = findActiveSocket();
if (!initialSocket) {
  console.log("\n⚠️  Warning: No Chrome MCP socket found.");
  console.log("Make sure Chrome is open with the Claude extension active.\n");
}

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Chrome MCP HTTP Bridge                                       ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Exposes Chrome MCP tools over HTTP for Docker containers    ║");
  console.log("║                                                               ║");
  console.log(`║  Local URL:  http://${HOST}:${PORT}/mcp                       ║`);
  console.log(`║  Docker URL: http://host.docker.internal:${PORT}/mcp          ║`);
  console.log("║                                                               ║");
  console.log(`║  Socket dir: ${SOCKET_DIR.padEnd(37)}║`);
  console.log(`║  Socket:     ${(initialSocket || "Not found").padEnd(37)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("To use from Docker, add to Claude Code MCP config:");
  console.log('  "chrome-bridge": {');
  console.log(`    "url": "http://host.docker.internal:${PORT}/mcp"`);
  console.log("  }");
  console.log("");
});

// Graceful shutdown
process.on("SIGINT", () => {
  log("Shutting down...");
  for (const session of sessions.values()) {
    session.socket.destroy();
  }
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Shutting down...");
  for (const session of sessions.values()) {
    session.socket.destroy();
  }
  server.close();
  process.exit(0);
});
