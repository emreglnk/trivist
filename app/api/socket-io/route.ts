import { NextRequest } from "next/server";
import { Server } from "socket.io";
import { bindSocketServer } from "@/lib/ws-hub";

export const dynamic = "force-dynamic";

let io: Server | null = null;

export async function GET() {
  try {
    // Initialize Socket.IO server once per dev process
    if (!io) {
      const httpServer = (globalThis as Record<string, unknown>).server || (globalThis as Record<string, unknown>).__server || (global as Record<string, unknown>).__server;
      if (!httpServer) {
        return new Response("Socket server not ready", { status: 503 });
      }
      io = new Server(httpServer, {
        path: "/api/socket-io",
        cors: { origin: "*" },
      });
      bindSocketServer(io);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("WS init error:", e);
    return new Response("error", { status: 500 });
  }
}


