import { Box, Checkbox, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LuCheck, LuSparkles } from "react-icons/lu";
import { type StaffRegistrationFormData, staffRegistrationFormSchema } from "@/convex/staffRegistration/schemas";
import { Button } from "@/src/components/ui/Button";
import { LegalDocumentLink } from "../LegalDocumentLink";
import { suggestEmailTypoFix } from "./emailTypo";

export type StaffRegistrationPageData =
  | {
      status: "ok";
      shopName: string;
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    }
  | {
      status: "expired";
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    };

type Props = {
  data: StaffRegistrationPageData;
  isSubmitting?: boolean;
  isSubmitted?: boolean;
  initialConfirmData?: StaffRegistrationFormData;
  onSubmit: (data: StaffRegistrationFormData) => Promise<void> | void;
};

export function StaffRegistrationPage({
  data,
  isSubmitting = false,
  isSubmitted = false,
  initialConfirmData,
  onSubmit,
}: Props) {
  const [confirmData, setConfirmData] = useState<StaffRegistrationFormData | null>(initialConfirmData ?? null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StaffRegistrationFormData>({
    resolver: zodResolver(staffRegistrationFormSchema),
    defaultValues: { name: "", email: "", acceptedLegal: false },
  });
  const acceptedLegal = watch("acceptedLegal");
  const email = watch("email");
  const typoSuggestion = suggestEmailTypoFix(email);

  if (data.status === "expired") {
    return (
      <RegistrationShell>
        <Stack gap={3} textAlign="center">
          <Heading as="h1" fontSize="xl" color="gray.900">
            登録リンクを確認できません
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            リンクが無効になっている可能性があります。店長に新しい登録リンクを確認してください。
          </Text>
        </Stack>
      </RegistrationShell>
    );
  }

  if (isSubmitted) {
    return (
      <RegistrationShell>
        <Stack gap={4} textAlign="center" align="center">
          <Box
            boxSize="56px"
            borderRadius="full"
            bg="teal.100"
            color="teal.700"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="2xl"
          >
            <LuCheck />
          </Box>
          <Stack gap={2}>
            <Heading as="h1" fontSize="xl" color="gray.900">
              申請を送りました
            </Heading>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              店長が承認すると、シフト提出の案内がメールで届きます。
            </Text>
          </Stack>
        </Stack>
      </RegistrationShell>
    );
  }

  if (confirmData) {
    return (
      <RegistrationShell>
        <Stack gap={6}>
          <Stack gap={3}>
            <Heading as="h1" fontSize="xl" color="gray.900">
              申請内容を確認してください
            </Heading>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              店長が承認すると、このメールアドレスにシフト提出の案内が届きます。
            </Text>
          </Stack>

          <Stack gap={4} bg="teal.50/70" borderWidth="1px" borderColor="teal.100" borderRadius="lg" p={4}>
            <ConfirmRow label="名前" value={confirmData.name} />
            <ConfirmRow label="メールアドレス" value={confirmData.email} />
          </Stack>

          <Stack direction={{ base: "column", sm: "row" }} gap={3}>
            <Button
              type="button"
              variant="outline"
              flex={1}
              disabled={isSubmitting}
              onClick={() => setConfirmData(null)}
            >
              修正する
            </Button>
            <Button
              type="button"
              colorPalette="teal"
              flex={1}
              loading={isSubmitting}
              onClick={() => onSubmit(confirmData)}
            >
              申請する
            </Button>
          </Stack>
        </Stack>
      </RegistrationShell>
    );
  }

  return (
    <RegistrationShell>
      <Stack gap={6}>
        <Stack gap={3}>
          <Box color="teal.600" fontSize="2xl">
            <LuSparkles />
          </Box>
          <Stack gap={1.5}>
            <Heading as="h1" fontSize="xl" color="gray.900">
              {data.shopName} のシフト提出に参加します
            </Heading>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              シフトリは、お店から届くリンクで希望シフトを提出できるサービスです。名前と連絡先を登録すると、店長の確認後に案内が届きます。
            </Text>
          </Stack>
        </Stack>

        <form id="staff-registration-form" onSubmit={handleSubmit((values) => setConfirmData(values))} noValidate>
          <Stack gap={5}>
            <Field.Root invalid={!!errors.name}>
              <Field.Label>名前</Field.Label>
              <Input {...register("name")} placeholder="例：田中 花子" />
              {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
            </Field.Root>

            <Field.Root invalid={!!errors.email}>
              <Field.Label>メールアドレス</Field.Label>
              <Input type="email" {...register("email")} placeholder="例：hanako@example.com" />
              {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
              {typoSuggestion && (
                <Text fontSize="xs" color="orange.600">
                  もしかして {typoSuggestion} ですか？
                </Text>
              )}
            </Field.Root>

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
                  <LegalDocumentLink href={data.documents.terms.path}>利用規約</LegalDocumentLink>と
                  <LegalDocumentLink href={data.documents.privacy.path}>プライバシーポリシー</LegalDocumentLink>
                  に同意します
                </Checkbox.Label>
              </Checkbox.Root>
              {errors.acceptedLegal && <Field.ErrorText>{errors.acceptedLegal.message}</Field.ErrorText>}
            </Field.Root>

            {typoSuggestion && (
              <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" p={3}>
                <Stack gap={2}>
                  <Text fontSize="xs" color="orange.700">
                    メールアドレスの入力ミスかもしれません。
                  </Text>
                  <Button
                    type="button"
                    variant="plain"
                    size="sm"
                    colorPalette="orange"
                    alignSelf="flex-start"
                    onClick={() => setValue("email", typoSuggestion, { shouldDirty: true, shouldValidate: true })}
                  >
                    {typoSuggestion} に直す
                  </Button>
                </Stack>
              </Box>
            )}

            <Button type="submit" form="staff-registration-form" colorPalette="teal" loading={isSubmitting}>
              確認へ
            </Button>
          </Stack>
        </form>
      </Stack>
    </RegistrationShell>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <Text fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="md" fontWeight="bold" color="gray.900" wordBreak="break-all">
        {value}
      </Text>
    </Stack>
  );
}

function RegistrationShell({ children }: { children: ReactNode }) {
  return (
    <Box px={{ base: 4, md: 6 }} py={{ base: 6, md: 8 }} flex={1}>
      <Box maxW="520px" mx="auto">
        {children}
      </Box>
    </Box>
  );
}
