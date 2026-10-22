import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/routers/better-auth/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/server/libs/config", () => ({ config: { authDisabled: false } }));

import { auth } from "@/server/routers/better-auth/auth.js";
import { config } from "@/server/libs/config";
import { createTRPContext } from "./shared";

const getSessionMock = vi.mocked(auth.api.getSession);

function makeReq(): Parameters<typeof createTRPContext>[0] {
  return { req: { headers: {} } } as unknown as Parameters<typeof createTRPContext>[0];
}

beforeEach(() => {
  config.authDisabled = false;
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue(null);
});

describe("createTRPContext auth disabled", () => {
  it("maps an anonymous request to the shared anonymous user when auth is disabled", async () => {
    config.authDisabled = true;

    const ctx = await createTRPContext(makeReq());

    expect(ctx.user?.id).toBe("anonymous-user");
    expect(ctx.user?.email).toBe("anonymous@hermeum.local");
    expect(ctx.session?.userId).toBe("anonymous-user");
  });

  it("prefers a real session over the anonymous identity when auth is disabled", async () => {
    config.authDisabled = true;
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

  it("returns a null context when there is no session and auth is enabled", async () => {
    const ctx = await createTRPContext(makeReq());

    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeNull();
  });
});
