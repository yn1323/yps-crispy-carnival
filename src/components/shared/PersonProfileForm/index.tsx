import { Field, Input, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { editStaffSchema } from "@/convex/staff/schemas";

export type PersonProfileFormData = z.infer<typeof editStaffSchema>;

type Props = {
  formId: string;
  initialValues: PersonProfileFormData;
  emailField?: "editable" | "hidden";
  onDirtyChange?: (isDirty: boolean) => void;
  onSubmit: (data: PersonProfileFormData) => void | Promise<void>;
};

export function PersonProfileForm({ formId, initialValues, emailField = "editable", onDirtyChange, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<PersonProfileFormData>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <form id={formId} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={4}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>名前</Field.Label>
          <Input placeholder="例：田中 花子" maxLength={PERSON_NAME_MAX_LENGTH} {...register("name")} />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>

        {emailField === "editable" ? (
          <Field.Root invalid={!!errors.email}>
            <Field.Label>メールアドレス</Field.Label>
            <Input
              type="email"
              placeholder="例：hanako@example.com"
              maxLength={EMAIL_MAX_LENGTH}
              {...register("email")}
            />
            {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
          </Field.Root>
        ) : (
          <input type="hidden" {...register("email")} />
        )}
      </Stack>
    </form>
  );
}
