import { useEffect } from "react";
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

interface EditSharedEnvSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  initial: { name: string; description?: string };
}

export function EditSharedEnvSetDialog({
  open,
  onOpenChange,
  setId,
  initial,
}: EditSharedEnvSetDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      name: initial.name,
      description: initial.description ?? "",
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      updateEnvSet({
        id: setId,
        name: value.name.trim(),
        description: value.description.trim() || undefined,
      });
    },
  });

  const {
    mutate: updateEnvSet,
    isPending,
    error: mutationError,
  } = useMutation(
    trpc.sharedEnvSet.update.mutationOptions({
      onSuccess: () => {
        toast.success("Shared env set updated");
        queryClient.invalidateQueries({
          queryKey: trpc.sharedEnvSet.get.queryKey({ id: setId }),
        });
        onOpenChange(false);
      },
    })
  );

  useEffect(() => {
    if (open) {
      form.reset({
        name: initial.name,
        description: initial.description ?? "",
      });
    }
  }, [open, initial.name, initial.description]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit shared env set</DialogTitle>
          <DialogDescription>Update the name or description of this env set.</DialogDescription>
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
                      placeholder="My Env Set"
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
                    placeholder="What is this env set for?"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    rows={3}
                  />
                  <FieldDescription>
                    Optional. Describe what this env set is used for.
                  </FieldDescription>
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
