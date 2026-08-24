import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { AddressInfo } from "node:net";
import { Router } from "express";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock heavy routers/auth so createServer stays light and fast in tests.
vi.mock("@/server/routers/trpc/index.js", () => ({
  trpcMiddleware: Router(),
}));
vi.mock("./routers/webhook", () => ({
  webhookRouter: Router().post("/mutating", (_req, res) =>
    res.json({
      apiVersion: "admission.k8s.io/v1",
      kind: "AdmissionReview",
      response: { uid: "test-uid", allowed: true },
    })
  ),
}));
vi.mock("./routers/ai-sdk/agent-config", () => ({ aiSdkRouter: Router() }));
vi.mock("./routers/better-auth/auth", () => ({
  auth: { handler: () => (req: unknown, res: { end: () => void }) => res.end() },
}));

describe("createServer TLS", () => {
  describe("TLS disabled (default)", () => {
    it("returns HTTP servers for web and webhook", async () => {
      vi.resetModules();
      const { createServer } = await import("./server");
      const result = await createServer(process.cwd(), true);

      expect(result.webServer).toBeDefined();
      expect(result.webhookServer).toBeDefined();
      result.webServer.close();
      result.webhookServer!.close();
    });
  });

  describe("TLS enabled", () => {
    let dir: string;
    let webCertFile: string;
    let webKeyFile: string;
    let webhookCertFile: string;
    let webhookKeyFile: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "tls-server-"));
      webCertFile = path.join(dir, "web.crt");
      webKeyFile = path.join(dir, "web.key");
      webhookCertFile = path.join(dir, "webhook.crt");
      webhookKeyFile = path.join(dir, "webhook.key");

      const genCert = (cert: string, key: string) =>
        execSync(
          `openssl req -x509 -newkey rsa:2048 -nodes ` +
            `-keyout "${key}" -out "${cert}" -days 1 ` +
            `-subj "/CN=localhost" ` +
            `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`
        );

      genCert(webCertFile, webKeyFile);
      genCert(webhookCertFile, webhookKeyFile);
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("serves the web and webhook over HTTPS with separate cert/key pairs", async () => {
      vi.resetModules();
      vi.stubEnv("HERMEUM_TLS_CERT_FILE", webCertFile);
      vi.stubEnv("HERMEUM_TLS_KEY_FILE", webKeyFile);
      vi.stubEnv("HERMEUM_WEBHOOK_TLS_CERT_FILE", webhookCertFile);
      vi.stubEnv("HERMEUM_WEBHOOK_TLS_KEY_FILE", webhookKeyFile);
      // Self-signed cert: skip verification for the test client.
      vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");

      const { createServer } = await import("./server");
      const result = await createServer(process.cwd(), true);

      expect(result.webhookServer).toBeDefined();

      await new Promise<void>((resolve) => {
        result.webServer.listen(0, "127.0.0.1", () => resolve());
      });
      await new Promise<void>((resolve) => {
        result.webhookServer!.listen(0, "127.0.0.1", () => resolve());
      });

      const webAddr = result.webServer.address() as AddressInfo;
      const webhookAddr = result.webhookServer!.address() as AddressInfo;

      // Web listener is up over HTTPS (static files aren't built in
      // tests, so we only assert the TLS handshake succeeds).
      const webRes = await fetch(`https://127.0.0.1:${webAddr.port}/`);
      expect(webRes.status).toBe(404);

      // Webhook listener serves /webhook/mutating over HTTPS.
      const webhookRes = await fetch(`https://127.0.0.1:${webhookAddr.port}/webhook/mutating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiVersion: "admission.k8s.io/v1",
          kind: "AdmissionReview",
          request: {
            uid: "test-uid",
            operation: "CREATE",
            kind: { group: "", version: "v1", kind: "Pod" },
          },
        }),
      });
      expect(webhookRes.status).toBe(200);
      const body = (await webhookRes.json()) as { response?: { allowed: boolean } };
      expect(body.response?.allowed).toBe(true);

      result.webServer.close();
      result.webhookServer!.close();

      vi.unstubAllEnvs();
    });
  });
});