import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { getUserFromToken } from "./lib/auth.js";
import { db, conversationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

interface SocketData {
  role: "agent" | "visitor";
  userId?: string;
  storeId: string;
  visitorId?: string;
  conversationId?: string;
}

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function setupSocketIO(httpServer: HttpServer): Server {
  io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/api/socket.io",
  });

  io.use(async (socket, next) => {
    const { token, visitorId, storeId, conversationId } = socket.handshake.auth as Record<string, string | undefined>;

    if (token) {
      const user = await getUserFromToken(token);
      if (!user) return next(new Error("auth_failed"));
      socket.data.role = "agent";
      socket.data.userId = user.id;
      socket.data.storeId = user.storeId || "";
      return next();
    }

    if (visitorId && storeId) {
      socket.data.role = "visitor";
      socket.data.visitorId = visitorId;
      socket.data.storeId = storeId;
      socket.data.conversationId = conversationId;
      return next();
    }

    return next(new Error("auth_failed"));
  });

  io.on("connection", async (socket) => {
    const { role, storeId } = socket.data;

    if (role === "agent" && storeId) {
      socket.join(`store:${storeId}`);

      socket.on("join_conversation", async (convId: string) => {
        const [conv] = await db
          .select({ id: conversationsTable.id, storeId: conversationsTable.storeId })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.id, convId),
              eq(conversationsTable.storeId, storeId),
            ),
          )
          .limit(1);

        if (conv) {
          socket.join(`conv:${convId}`);
        }
      });

      socket.on("leave_conversation", (convId: string) => {
        socket.leave(`conv:${convId}`);
      });
    }

    if (role === "visitor") {
      const convId = socket.data.conversationId;
      const visitorId = socket.data.visitorId;

      if (convId && visitorId) {
        const [conv] = await db
          .select({ id: conversationsTable.id, visitorId: conversationsTable.visitorId, storeId: conversationsTable.storeId })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.id, convId),
              eq(conversationsTable.storeId, storeId),
            ),
          )
          .limit(1);

        if (conv && conv.visitorId === visitorId) {
          socket.join(`conv:${convId}`);
        }
      }

      socket.on("join_conversation", async (newConvId: string) => {
        if (!visitorId) return;
        const [conv] = await db
          .select({ id: conversationsTable.id, visitorId: conversationsTable.visitorId, storeId: conversationsTable.storeId })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.id, newConvId),
              eq(conversationsTable.storeId, storeId),
            ),
          )
          .limit(1);

        if (conv && conv.visitorId === visitorId) {
          socket.join(`conv:${newConvId}`);
        }
      });
    }
  });

  return io;
}
