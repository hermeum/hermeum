import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@kubeclaw/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kubeclaw/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@kubeclaw/components/ui/field";
import { Input } from "@kubeclaw/components/ui/input";
import { Textarea } from "@kubeclaw/components/ui/textarea";
import { useTRPC } from "@/router";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
});

interface EditSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string;
  initial: { name: string; description?: string };
}

export function EditSecretDialog({
  open,
  onOpenChange,
  secretId,
  initial,
}: EditSecretDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { name: initial.name, description: initial.description ?? "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      updateSecret({
        id: secretId,
        name: value.name.trim(),
        description: value.description.trim() || undefined,
      });
    },
  });

  const {
    mutate: updateSecret,
    isPending,
    error: mutationError,
  } = useMutation(
    trpc.secret.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.secret.get.queryKey({ id: secretId }),
        });
        onOpenChange(false);
      },
    })
  );

  useEffect(() => {
    if (open) {
      form.reset({ name: initial.name, description: initial.description ?? "" });
    }
  }, [open, initial.name, initial.description]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit secret</DialogTitle>
          <DialogDescription>
            Update the name or description of this secret.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder="My Secret"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    placeholder="What is this secret for?"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    rows={3}
                  />
                  <FieldDescription>Optional. Describe what this secret is used for.</FieldDescription>
                </Field>
              )}
            </form.Field>

            {mutationError && <FieldError>{mutationError.message}</FieldError>}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
