import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@clawagent/components/ui/button";
import { Input } from "@clawagent/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clawagent/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@clawagent/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@clawagent/components/ui/input-otp";
import { authClient } from "@/client/auth-client";

export const Route = createFileRoute("/signin")({
  component: LoginPage,
});

const emailSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Enter the 6-digit code"),
});

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");

  const sendOtp = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: (_, email) => {
      setEmail(email);
      setStep("otp");
    },
  });

  const signIn = useMutation({
    mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw error;
    },
    onSuccess: () => navigate({ to: "/agents" }),
  });

  const emailForm = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailSchema },
    onSubmit: ({ value }) => sendOtp.mutate(value.email),
  });

  const otpForm = useForm({
    defaultValues: { otp: "" },
    validators: { onSubmit: otpSchema },
    onSubmit: ({ value }) => signIn.mutate({ email, otp: value.otp }),
  });

  if (step === "otp") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                otpForm.reset();
                signIn.reset();
              }}
              className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
              <ArrowLeftIcon className="size-3.5" />
              Back
            </button>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                otpForm.handleSubmit();
              }}
            >
              <FieldGroup>
                <otpForm.Field name="otp">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <InputOTP
                          containerClassName="justify-center"
                          maxLength={6}
                          value={field.state.value}
                          onChange={(val) => field.handleChange(val)}
                          onBlur={field.handleBlur}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    );
                  }}
                </otpForm.Field>

                {signIn.error && <FieldError>{signIn.error.message}</FieldError>}

                <Button type="submit" className="w-full" disabled={signIn.isPending}>
                  Continue
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your email to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              emailForm.handleSubmit();
            }}
          >
            <FieldGroup>
              <emailForm.Field name="email">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        placeholder="you@example.com"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              </emailForm.Field>

              {sendOtp.error && <FieldError>{sendOtp.error.message}</FieldError>}

              <Button type="submit" className="w-full" disabled={sendOtp.isPending}>
                Continue
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
