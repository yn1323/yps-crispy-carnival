import { Box, Checkbox, Field, Input, Link, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { type ManagerProfileInput, managerProfileSchema } from "@/convex/setup/schemas";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";

export type Step2Data = ManagerProfileInput;

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
    resolver: zodResolver(managerProfileSchema),
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
        <Box borderRadius="lg" bg="blue.50" px={4} py={3}>
          <Text fontSize="sm" color="blue.900" lineHeight="tall">
            このお店を登録すると、最初の組織に支払い不要のBusinessが適用されます。2暦月のトライアル期限や支払い情報の登録はありません。
            現在の公開範囲は、1組織・1店舗・1管理者です。
          </Text>
          <Link href="/pricing" target="_blank" rel="noreferrer" color="teal.700" fontSize="sm" fontWeight="bold">
            料金とプランを確認する（新しいタブ）
          </Link>
        </Box>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>あなたの名前</Field.Label>
          <Input {...register("name")} maxLength={PERSON_NAME_MAX_LENGTH} placeholder="例：山田 太郎" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.email}>
          <Field.Label>シフト連絡先メールアドレス</Field.Label>
          <Input
            type="email"
            {...register("email")}
            maxLength={EMAIL_MAX_LENGTH}
            placeholder="例：yamada@example.com"
          />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
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
