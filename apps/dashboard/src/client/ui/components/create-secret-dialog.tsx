import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@hermeum/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@hermeum/components/ui/field";
import { Input } from "@hermeum/components/ui/input";
import { Textarea } from "@hermeum/components/ui/textarea";
import { toast } from "sonner";
import { useTRPC } from "@/router";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
});

interface CreateSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSecretDialog({ open, onOpenChange }: CreateSecretDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { name: "", description: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      createSecret({
        name: value.name.trim(),
        description: value.description.trim() || undefined,
      });
    },
  });

  const {
    mutate: createSecret,
    isPending,
    error: mutationError,
  } = useMutation(
    trpc.secret.create.mutationOptions({
      onSuccess: () => {
        toast.success("Secret created");
        queryClient.invalidateQueries({ queryKey: trpc.secret.list.queryKey() });
        handleOpenChange(false);
      },
    })
  );

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
    } 

    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create secret</DialogTitle>
          <DialogDescription>
            Give your secret a name and an optional description.
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
                </Field>
              )}
            </form.Field>

            {mutationError && <FieldError>{mutationError.message}</FieldError>}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create secret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
