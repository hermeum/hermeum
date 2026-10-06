import { initTRPC } from "@trpc/server";

// Standalone initTRPC instance: no SuperJSON transformer (plain JSON wire
// format so non-TS clients can serialize/deserialize) and no Better Auth
// context (the production plugin API authenticates per-agent tokens).

export const t = initTRPC.create();
