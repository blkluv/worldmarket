import { Router, Request, Response } from "express";

const router = Router();

// Registered SSE clients
const clients: Response[] = [];

export function emitEvent(type: string, data: unknown): void {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

router.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write("event: ping\ndata: {}\n\n");
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const idx = clients.indexOf(res);
    if (idx !== -1) {
      clients.splice(idx, 1);
    }
  });
});

export default router;
