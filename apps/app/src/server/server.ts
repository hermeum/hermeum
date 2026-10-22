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
import { telemetry } from "./infras/posthog";
import { AgentSessionUseCase } from "./usecases/agent-session";
import { trpcMiddleware } from "@/server/routers/trpc/resources/index.js";
import { pluginTrpcMiddleware } from "@/server/routers/trpc/plugin/index.js";
import { webhookRouter } from "./routers/webhook";
import { aiSdkRouter } from "./routers/ai-sdk/agent-config";
import { auth } from "./routers/better-auth/auth";

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

// Auth-disabled mode is a runtime switch, so the client cannot learn it at
// build time. Inject it into the served HTML instead of exposing an API
// endpoint; the client reads window.__HERMEUM_AUTH_DISABLED__ synchronously on
// first render (the sign-in redirect runs in a router beforeLoad).
const injectAuthDisabledFlag = (html: string): string =>
  html.replace(
    "</head>",
    `<script>window.__HERMEUM_AUTH_DISABLED__=${JSON.stringify(config.authDisabled)};</script></head>`
  );

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

  app.all("/auth/*splat", toNodeHandler(auth));
  // Plugin ingest batches can reach multi-MB (a 100-event batch with
  // 12K-char sanitized text fields), above body-parser's default 100KB
  // JSON limit — raise the limit for this path only (large structured
  // tool args/results are not plugin-truncated; oversize rejections drop
  // the whole batch); the later global parser skips already-parsed bodies.
  app.use("/plugin/trpc", express.json({ limit: "8mb" }));
  // Chat sends the full UIMessage conversation history each turn, including
  // accumulated tool results (e.g. readDocument outputs), which can exceed
  // body-parser's default 100KB JSON limit — raise the limit for this path
  // only; the later global parser skips already-parsed bodies.
  app.use("/chat", express.json({ limit: "8mb" }));
  app.use(express.json());
  app.use("/trpc", trpcMiddleware);
  app.use("/plugin/trpc", pluginTrpcMiddleware);
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

    app.get("/{*splat}", async (req, res, next) => {
      try {
        let html = fs.readFileSync(path.resolve(root, "index.html"), "utf-8");
        html = await viteServer.transformIndexHtml(req.url, html);
        res.send(injectAuthDisabledFlag(html));
      } catch (e) {
        return next(e);
      }
    });
  } else {
    // index: false so the SPA fallback below can inject the auth-disabled flag
    // for "/" as well as client-side routes.
    app.use(express.static(path.resolve(__dirname, "../client"), { index: false }));

    app.get("/{*splat}", (_req, res) => {
      const indexPath = path.resolve(__dirname, "../client", "index.html");
      // The client bundle isn't present in every environment (e.g. unit tests);
      // mirror express.static's 404 instead of failing the request.
      if (!fs.existsSync(indexPath)) {
        res.status(404).end();
        return;
      }
      const html = fs.readFileSync(indexPath, "utf-8");
      res.type("html").send(injectAuthDisabledFlag(html));
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

const shutdownTelemetry = async () => {
  try {
    await telemetry.shutdown();
  } catch (e) {
    console.warn("Failed to flush telemetry on shutdown:", e);
  }
};

if (!isTest) {
  telemetry.heartbeat();

  // Retention is disabled entirely when the configured window is 0 days.
  const sessionRetention = new AgentSessionUseCase();
  sessionRetention.startAgentSessionRetention(config.agentSessionRetentionDays);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      sessionRetention.stopAgentSessionRetention();
      void shutdownTelemetry().finally(() => process.exit(0));
    });
  }

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
