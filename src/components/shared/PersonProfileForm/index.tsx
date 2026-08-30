import { Field, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { editStaffSchema } from "@/convex/staff/schemas";
import { Input } from "@/src/components/ui/FormControls";

export type PersonProfileFormData = z.infer<typeof editStaffSchema>;

type Props = {
  formId: string;
  initialValues: PersonProfileFormData;
  emailLabel?: string;
  emailHelperText?: ReactNode;
  onSubmit: (data: PersonProfileFormData) => void | Promise<void>;
};

export function PersonProfileForm({
  formId,
  initialValues,
  emailLabel = "メールアドレス",
  emailHelperText,
  onSubmit,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonProfileFormData>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: initialValues,
  });

  return (
    <form id={formId} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={4}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>名前</Field.Label>
          <Input placeholder="サンプル ユーザー" maxLength={PERSON_NAME_MAX_LENGTH} {...register("name")} />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>{emailLabel}</Field.Label>
          <Input type="email" placeholder="user@example.com" maxLength={EMAIL_MAX_LENGTH} {...register("email")} />
          {emailHelperText && <Field.HelperText>{emailHelperText}</Field.HelperText>}
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
}
