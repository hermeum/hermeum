import { generateOpenAPIDocument } from "@trpc/openapi";
import * as fs from "node:fs";
import * as path from "node:path";

// SPIKE (issue #147 step 1): generates the OpenAPI spec for the agent-session
// telemetry router so the Python client can be generated from it. Run:
//   pnpm openapi:generate
const main = async (): Promise<void> => {
  const doc = await generateOpenAPIDocument("./apps/app/src/server/routers/trpc/telemetry.ts", {
    exportName: "AgentSessionRouter",
    title: "Hermeum Agent Session Telemetry",
    version: "0.1.0",
    servers: [{ url: "http://localhost:3000/telemetry/trpc" }],
  });

  const outDir = path.resolve(import.meta.dirname, "../openapi");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "telemetry-spike.json");
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
  console.info(`OpenAPI spec written to ${outPath}`);
};

void main();