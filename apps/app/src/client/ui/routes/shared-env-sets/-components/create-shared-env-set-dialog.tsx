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
import { Field, FieldError, FieldGroup, FieldLabel } from "@hermeum/components/ui/field";
import { Input } from "@hermeum/components/ui/input";
import { Textarea } from "@hermeum/components/ui/textarea";
import { toast } from "sonner";
import { useTRPC } from "@/router";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
});

interface CreateSharedEnvSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSharedEnvSetDialog({ open, onOpenChange }: CreateSharedEnvSetDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { name: "", description: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      createEnvSet({
        name: value.name.trim(),
        description: value.description.trim() || undefined,
      });
    },
  });

  const {
    mutate: createEnvSet,
    isPending,
    error: mutationError,
  } = useMutation(
    trpc.sharedEnvSet.create.mutationOptions({
      onSuccess: () => {
        toast.success("Shared env set created");
        queryClient.invalidateQueries({ queryKey: trpc.sharedEnvSet.list.queryKey() });
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
          <DialogTitle>Create shared env set</DialogTitle>
          <DialogDescription>
            Give your env set a name and an optional description.
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
                </Field>
              )}
            </form.Field>

            {mutationError && <FieldError>{mutationError.message}</FieldError>}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create env set"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
