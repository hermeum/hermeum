import { router } from "./trpc.js";
import { sandboxRouter } from "./routers/sandbox.js";

export const appRouter = router({
  sandbox: sandboxRouter,
});

export type AppRouter = typeof appRouter;
