import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/routers/better-auth/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/server/libs/config", () => ({ config: { demoMode: false } }));

import { auth } from "@/server/routers/better-auth/auth.js";
import { config } from "@/server/libs/config";
import { createTRPContext } from "./shared";

const getSessionMock = vi.mocked(auth.api.getSession);

function makeReq(): Parameters<typeof createTRPContext>[0] {
  return { req: { headers: {} } } as unknown as Parameters<typeof createTRPContext>[0];
}

beforeEach(() => {
  config.demoMode = false;
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue(null);
});

describe("createTRPContext demo mode", () => {
  it("maps an anonymous request to the shared demo user when demo mode is on", async () => {
    config.demoMode = true;

    const ctx = await createTRPContext(makeReq());

    expect(ctx.user?.id).toBe("demo-user");
    expect(ctx.user?.email).toBe("demo@hermeum.local");
    expect(ctx.session?.userId).toBe("demo-user");
  });

  it("prefers a real session over the demo identity when demo mode is on", async () => {
    config.demoMode = true;
    const raw = {
      session: { id: "real-session", userId: "real-user", expiresAt: new Date() },
      user: {
        id: "real-user",
        email: "real@example.com",
        name: "Real",
        createdAt: new Date(),
      },
    };
    getSessionMock.mockResolvedValue(raw as Awaited<ReturnType<typeof auth.api.getSession>>);

    const ctx = await createTRPContext(makeReq());

    expect(ctx.session).toEqual(raw.session);
    expect(ctx.user).toEqual(raw.user);
  });

  it("returns a null context when there is no session and demo mode is off", async () => {
    const ctx = await createTRPContext(makeReq());

    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeNull();
  });
});
