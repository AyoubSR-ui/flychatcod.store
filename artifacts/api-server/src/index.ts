import { createServer } from "http";
import app from "./app";
import { setupSocketIO } from "./socket.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupSocketIO(httpServer);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
