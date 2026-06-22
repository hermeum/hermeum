import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";

import { Button } from "@hermeum/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@hermeum/components/ui/alert";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@hermeum/components/ui/field";
import { Input } from "@hermeum/components/ui/input";
import { TriangleAlert } from "lucide-react";
import { EnvVarSchema } from "@/entities";

interface EnvVarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill for update mode; omit for add mode */
  initial?: { name: string; value: string };
  isPending: boolean;
  onSubmit: (envVar: { name: string; value: string }) => void;
  error: string | null;
}

export function EnvVarDialog({
  open,
  onOpenChange,
  initial,
  isPending,
  onSubmit,
  error,
}: EnvVarDialogProps) {
  const isUpdate = !!initial;

  const form = useForm({
    defaultValues: { name: initial?.name ?? "", value: initial?.value ?? "" },
    validators: { onSubmit: EnvVarSchema },
    onSubmit: async ({ value }) => {
      onSubmit({ name: value.name.trim(), value: value.value });
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: initial?.name ?? "", value: initial?.value ?? "" });
    }
  }, [open, initial?.name, initial?.value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? "Update environment variable" : "Add environment variable"}
          </DialogTitle>
        </DialogHeader>

        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>Restart required</AlertTitle>
          <AlertDescription>
            Agents using this secret must be restarted to apply this change.
          </AlertDescription>
        </Alert>

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
                      placeholder="MY_VAR"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                      disabled={isUpdate}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="value">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Value</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder="value"
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

            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isUpdate ? "Updating…" : "Adding…") : isUpdate ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
