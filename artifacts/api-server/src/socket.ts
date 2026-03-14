import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { getUserFromToken } from "./lib/auth.js";
import { db, conversationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function setupSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/api/socket.io",
  });

  io.use(async (socket: Socket, next) => {
    const { token, visitorId, storeId, conversationId } = socket.handshake.auth;

    if (token) {
      const user = await getUserFromToken(token);
      if (!user) return next(new Error("auth_failed"));
      (socket as any).userId = user.id;
      (socket as any).storeId = user.storeId;
      (socket as any).role = "agent";
      return next();
    }

    if (visitorId && storeId) {
      (socket as any).visitorId = visitorId;
      (socket as any).storeId = storeId;
      (socket as any).conversationId = conversationId;
      (socket as any).role = "visitor";
      return next();
    }

    return next(new Error("auth_failed"));
  });

  io.on("connection", async (socket: Socket) => {
    const role = (socket as any).role as string;
    const storeId = (socket as any).storeId as string;

    if (role === "agent" && storeId) {
      socket.join(`store:${storeId}`);

      socket.on("join_conversation", (convId: string) => {
        socket.join(`conv:${convId}`);
      });

      socket.on("leave_conversation", (convId: string) => {
        socket.leave(`conv:${convId}`);
      });
    }

    if (role === "visitor") {
      const convId = (socket as any).conversationId as string | undefined;
      const visitorId = (socket as any).visitorId as string;

      if (convId) {
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
