import { Context } from "@/entities";

export function verifyOwnership(ctx: Context, resource: { userId: string }): void {
  if (ctx.user!.id !== resource.userId) {
    throw new Error("You don't have permission to perform this action");
  }
}
