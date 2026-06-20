import { Checkbox, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { type Step2Data, step2Schema } from "./index";

type Props = {
  onSubmit: (data: Step2Data) => void | Promise<void>;
  defaultValues?: Pick<Step2Data, "name" | "email">;
  formId?: string;
};

export const SetupStep2 = ({ onSubmit, defaultValues, formId = "setup-step2" }: Props) => {
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      acceptedLegal: false,
    },
  });

  const acceptedLegal = watch("acceptedLegal");

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>あなたの名前</Field.Label>
          <Input {...register("name")} maxLength={PERSON_NAME_MAX_LENGTH} placeholder="例：山田 太郎" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input
            type="email"
            {...register("email")}
            maxLength={EMAIL_MAX_LENGTH}
            placeholder="例：yamada@example.com"
          />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
        <Text fontSize="xs" color="fg.muted">
          ほかのスタッフは登録後にいつでも追加できます。
        </Text>
        <Field.Root invalid={!!errors.acceptedLegal}>
          <Checkbox.Root
            colorPalette="teal"
            checked={acceptedLegal}
            cursor="pointer"
            onCheckedChange={(details) => {
              setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
            }}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control cursor="pointer" />
            <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
              <LegalDocumentLink href="/terms/manager">利用規約</LegalDocumentLink>と
              <LegalDocumentLink href="/privacy/manager">プライバシーポリシー</LegalDocumentLink>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {errors.acceptedLegal && <Field.ErrorText>{errors.acceptedLegal.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
