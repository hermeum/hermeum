import path from "node:path";
import url from "node:url";
import * as fs from "node:fs";
import express from "express";
import { toNodeHandler } from "better-auth/node";

import { config } from "./libs/config";
import { trpcMiddleware } from "@/server/routers/trpc/index.js";
import { webhookRouter } from "./routers/webhook";
import { aiSdkRouter } from "./routers/ai-sdk/agent-config";
import { auth } from "./routers/better-auth/auth";

const { serverPort, hmrPort } = config;

const isTest = process.env.NODE_ENV === "test" || !!process.env.VITE_TEST_BUILD;

// Validate required env vars before starting
void config;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createServer = async (
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production"
) => {
  const app = express();

  app.all("/auth/*", toNodeHandler(auth));
  app.use(express.json());
  app.use("/trpc", trpcMiddleware);
  app.use("/webhook", webhookRouter);
  app.use("/chat", aiSdkRouter);

  if (!isProd) {
    const vite = await import("vite");
    const viteServer = await vite.createServer({
      root,
      logLevel: isTest ? "error" : "info",
      server: {
        middlewareMode: true,
        watch: {
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: "custom",
    });

    app.use(viteServer.middlewares);

    app.get("*", async (req, res, next) => {
      try {
        let html = fs.readFileSync(path.resolve(root, "index.html"), "utf-8");
        html = await viteServer.transformIndexHtml(req.url, html);
        res.send(html);
      } catch (e) {
        return next(e);
      }
    });

    return { app };
  } else {
    app.use(express.static(path.resolve(__dirname, "../client")));

    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "../client", "index.html"));
    });
  }

  return { app };
};

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(serverPort, () => {
      console.info(`Server available at: http://localhost:${serverPort}`);
    })
  );
}
