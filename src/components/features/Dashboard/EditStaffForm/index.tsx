import { Field, Input, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Staff } from "../types";
import { type EditStaffFormData, editStaffSchema } from "./index";

type Props = {
  staff: Staff;
  onSubmit: (data: EditStaffFormData) => void;
};

export const EditStaffForm = ({ staff, onSubmit }: Props) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditStaffFormData>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: { name: staff.name, email: staff.email },
  });

  const nameError = errors.name;
  const emailError = errors.email;

  return (
    <form id="edit-staff-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={4}>
        <Field.Root invalid={!!nameError}>
          <Field.Label>名前</Field.Label>
          <Input placeholder="例：田中 花子" {...register("name")} />
          {nameError && <Field.ErrorText>{nameError.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!emailError}>
          <Field.Label>メールアドレス</Field.Label>
          <Input placeholder="例：hanako@example.com" {...register("email")} />
          {emailError && <Field.ErrorText>{emailError.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
