#!/usr/bin/env npx tsx
/**
 * MCP HTTP Bridge
 *
 * Exposes a local stdio-based MCP server (like Claude in Chrome) over HTTP
 * using the Streamable HTTP transport, allowing Docker containers to connect.
 *
 * Usage:
 *   npx tsx scripts/mcp-http-bridge.ts [options]
 *
 * Options:
 *   --port PORT       HTTP port to listen on (default: 9876)
 *   --command CMD     MCP server command to run (default: claude --chrome-native-host)
 *   --host HOST       Host to bind to (default: 127.0.0.1)
 *
 * From Docker container, configure Claude Code to connect to:
 *   http://host.docker.internal:9876/mcp
 */

import { spawn, ChildProcess } from "child_process";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

// Configuration
const PORT = parseInt(process.env.MCP_BRIDGE_PORT || "9876");
const HOST = process.env.MCP_BRIDGE_HOST || "127.0.0.1";
const MCP_COMMAND =
  process.env.MCP_COMMAND || `${process.env.HOME}/.local/share/claude/versions/2.1.17`;
const MCP_ARGS = ["--chrome-native-host"];

interface Session {
  id: string;
  process: ChildProcess;
  pendingRequests: Map<string | number, (response: unknown) => void>;
  sseClients: Set<ServerResponse>;
  buffer: Buffer; // Changed to Buffer for binary protocol
}

const sessions = new Map<string, Session>();

function log(message: string, ...args: unknown[]) {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

// Chrome native messaging uses 4-byte length prefix (uint32 LE) + JSON
function readNativeMessage(buffer: Buffer): { message: unknown; remaining: Buffer } | null {
  if (buffer.length < 4) return null;

  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;

  const jsonData = buffer.slice(4, 4 + length).toString('utf8');
  const message = JSON.parse(jsonData);
  const remaining = buffer.slice(4 + length);

  return { message, remaining };
}

function writeNativeMessage(message: unknown): Buffer {
  const json = JSON.stringify(message);
  const jsonBuffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

function createSession(): Session {
  const id = randomUUID();
  log(`Creating new session: ${id}`);

  const proc = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const session: Session = {
    id,
    process: proc,
    pendingRequests: new Map(),
    sseClients: new Set(),
    buffer: Buffer.alloc(0),
  };

  proc.stdout?.on("data", (data: Buffer) => {
    // Append new data to buffer
    session.buffer = Buffer.concat([session.buffer, data]);

    // Process complete native messages (4-byte length prefix + JSON)
    let result;
    while ((result = readNativeMessage(session.buffer)) !== null) {
      session.buffer = result.remaining;
      try {
        handleMcpMessage(session, result.message);
      } catch (err) {
        log(`Failed to handle MCP message:`, err);
      }
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    log(`MCP stderr: ${data.toString()}`);
  });

  proc.on("close", (code) => {
    log(`MCP process exited with code ${code}`);
    sessions.delete(id);

    // Close all SSE connections
    for (const client of session.sseClients) {
      client.end();
    }
  });

  proc.on("error", (err) => {
    log(`MCP process error:`, err);
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

function handleMcpMessage(session: Session, message: unknown) {
  const msg = message as { id?: string | number; method?: string };

  // If this is a response to a pending request
  if (msg.id !== undefined && session.pendingRequests.has(msg.id)) {
    const resolve = session.pendingRequests.get(msg.id)!;
    session.pendingRequests.delete(msg.id);
    resolve(message);
    return;
  }

  // If this is a server-initiated request/notification, send to SSE clients
  if (msg.method) {
    const sseData = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of session.sseClients) {
      client.write(sseData);
    }
  }
}

function sendToMcp(session: Session, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const msg = message as { id?: string | number };

    if (msg.id !== undefined) {
      session.pendingRequests.set(msg.id, resolve);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (session.pendingRequests.has(msg.id!)) {
          session.pendingRequests.delete(msg.id!);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    }

    // Use native messaging format (4-byte length prefix + JSON)
    const data = writeNativeMessage(message);
    session.process.stdin?.write(data, (err) => {
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

    // Check if this is a notification or response (no response expected)
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
      // Respond with SSE stream
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Mcp-Session-Id": session.id,
      });

      res.write(`data: ${JSON.stringify(response)}\n\n`);
      res.end();
    } else {
      // Respond with JSON
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
  req: IncomingMessage,
  res: ServerResponse,
  session: Session
) {
  log(`Terminating session ${session.id}`);

  session.process.kill();
  sessions.delete(session.id);

  for (const client of session.sseClients) {
    client.end();
  }

  res.writeHead(200);
  res.end();
}

const server = createServer(async (req, res) => {
  // CORS headers for cross-origin requests
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

  // Only handle /mcp endpoint
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
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

  // For initialization requests (no session), create new session
  if (!session && req.method === "POST") {
    session = createSession();
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

server.listen(PORT, HOST, () => {
  log(`MCP HTTP Bridge listening on http://${HOST}:${PORT}/mcp`);
  log(`MCP command: ${MCP_COMMAND} ${MCP_ARGS.join(" ")}`);
  log("");
  log("To connect from Docker container, add to Claude Code MCP config:");
  log(`  "chrome-bridge": {`);
  log(`    "url": "http://host.docker.internal:${PORT}/mcp"`);
  log(`  }`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  log("Shutting down...");
  for (const session of sessions.values()) {
    session.process.kill();
  }
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("Shutting down...");
  for (const session of sessions.values()) {
    session.process.kill();
  }
  server.close();
  process.exit(0);
});
