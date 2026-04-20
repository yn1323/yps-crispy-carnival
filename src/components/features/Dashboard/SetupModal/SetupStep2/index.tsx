import { Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type Step2Data, step2Schema } from "./index";

type Props = {
  onSubmit: (data: Step2Data) => void;
  formId?: string;
};

export const SetupStep2 = ({ onSubmit, formId = "setup-step2" }: Props) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>あなたの名前</Field.Label>
          <Input {...register("name")} placeholder="例：山田 太郎" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input type="email" {...register("email")} placeholder="例：yamada@example.com" />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
        <Text fontSize="xs" color="fg.muted">
          ほかのスタッフは登録後にいつでも追加できます。
        </Text>
      </Stack>
    </form>
  );
};
