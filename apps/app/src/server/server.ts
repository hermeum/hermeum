import path from "node:path";
import url from "node:url";
import * as fs from "node:fs";
import http from "node:http";
import https from "node:https";
import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import express from "express";
import { toNodeHandler } from "better-auth/node";

import { config } from "./libs/config";
import { trpcMiddleware } from "@/server/routers/trpc/index.js";
import { agentSessionRouter } from "@/server/routers/trpc/telemetry.js";
import { webhookRouter } from "./routers/webhook";
import { aiSdkRouter } from "./routers/ai-sdk/agent-config";
import { auth } from "./routers/better-auth/auth";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

const { port, hmrPort } = config;

const isTest = process.env.NODE_ENV === "test" || !!process.env.VITE_TEST_BUILD;

// Validate required env vars before starting
void config;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CreateServerResult {
  webServer: HttpServer | HttpsServer;
  webhookServer?: HttpServer | HttpsServer;
}

const loadTlsCredentials = (certFile: string, keyFile: string): { cert: Buffer; key: Buffer } => {
  try {
    return {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to read TLS cert/key files (cert=${certFile}, key=${keyFile}): ${msg}`);
  }
};

export const createServer = async (
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production"
): Promise<CreateServerResult> => {
  const app = express();

  app.all("/auth/*", toNodeHandler(auth));
  app.use(express.json());
  app.use("/trpc", trpcMiddleware);
  app.use("/telemetry/trpc", createExpressMiddleware({ router: agentSessionRouter }));
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
  } else {
    app.use(express.static(path.resolve(__dirname, "../client")));

    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "../client", "index.html"));
    });
  }

  // Separate Express app for the mutating webhook — only mounts webhookRouter.
  const webhookApp = express();
  webhookApp.use(express.json());
  webhookApp.use("/webhook", webhookRouter);

  // Web server: HTTPS on port when cert/key are set, otherwise HTTP.
  const webHasTls = config.tlsCertFile !== undefined && config.tlsKeyFile !== undefined;
  let webServer: HttpServer | HttpsServer;
  if (webHasTls) {
    const { cert, key } = loadTlsCredentials(config.tlsCertFile!, config.tlsKeyFile!);
    webServer = https.createServer({ cert, key }, app);
  } else {
    webServer = http.createServer(app);
  }

  // Webhook server: HTTPS on webhookPort when cert/key are set, otherwise HTTP.
  const webhookHasTls =
    config.webhookTlsCertFile !== undefined && config.webhookTlsKeyFile !== undefined;
  let webhookServer: HttpServer | HttpsServer | undefined;
  if (webhookHasTls) {
    const { cert, key } = loadTlsCredentials(config.webhookTlsCertFile!, config.webhookTlsKeyFile!);
    webhookServer = https.createServer({ cert, key }, webhookApp);
  } else {
    webhookServer = http.createServer(webhookApp);
  }

  return {
    webServer,
    webhookServer,
  };
};

if (!isTest) {
  createServer()
    .then(({ webServer, webhookServer }) => {
      webServer.listen(port, () => {
        const scheme = config.tlsCertFile ? "https" : "http";
        console.info(`Server available at: ${scheme}://localhost:${port}`);
      });

      if (webhookServer) {
        webhookServer.listen(config.webhookPort, () => {
          const scheme = config.webhookTlsCertFile ? "https" : "http";
          console.info(`Webhook server available at: ${scheme}://localhost:${config.webhookPort}`);
        });
      }
    })
    .catch((e) => {
      console.error("Failed to start server:", e);
      process.exit(1);
    });
}
