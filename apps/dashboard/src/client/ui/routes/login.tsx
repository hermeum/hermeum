import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@kubeclaw/components/ui/button";
import { Input } from "@kubeclaw/components/ui/input";
import { Label } from "@kubeclaw/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@kubeclaw/components/ui/card";
import { authClient } from "@/client/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [sent, setSent] = useState(false);
  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      try {
        await authClient.sendMagicLink({ email: value.email, callbackURL: "/agents" });
        setSent(true);
      } catch (err) {
        console.error(err);
      }
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-muted-foreground">
              Check your email for a sign-in link.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
              className="space-y-4"
            >
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                    />
                  </div>
                )}
              </form.Field>
              <Button type="submit" className="w-full">
                Send magic link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
