import { Checkbox, Field, Input, Link, Stack, Text } from "@chakra-ui/react";
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
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { name: "", email: "", acceptedLegal: false },
  });

  const acceptedLegal = watch("acceptedLegal");

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
        <Field.Root invalid={!!errors.acceptedLegal}>
          <Checkbox.Root
            colorPalette="teal"
            checked={acceptedLegal}
            onCheckedChange={(details) => {
              setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
            }}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label fontSize="sm" lineHeight={1.7}>
              <Link href="/terms/manager" target="_blank" rel="noopener noreferrer" color="teal.700">
                利用規約
              </Link>
              と
              <Link href="/privacy/manager" target="_blank" rel="noopener noreferrer" color="teal.700">
                プライバシーポリシー
              </Link>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {errors.acceptedLegal && <Field.ErrorText>{errors.acceptedLegal.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
