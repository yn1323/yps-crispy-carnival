import { Box, Checkbox, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LuCheck, LuSparkles } from "react-icons/lu";
import { type StaffRegistrationFormData, staffRegistrationFormSchema } from "@/convex/staffRegistration/schemas";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
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
            リンクが無効になっている可能性があります。シフト担当者に新しい登録リンクを確認してください。
          </Text>
        </Stack>
      </RegistrationShell>
    );
  }

  if (isSubmitted) {
    return (
      <RegistrationShell centerContent>
        <Empty
          icon={LuCheck}
          title="申請を送りました"
          description="シフト担当者が承認すると、シフト提出の案内がメールで届きます。承認までしばらくおまちください。"
          tone="success"
          iconVariant="circle"
          size="lg"
          minH="auto"
        />
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
              シフト担当者が承認すると、このメールアドレスにシフト提出の案内が届きます。
            </Text>
          </Stack>

          <Stack gap={4} bg="teal.50/70" borderWidth="1px" borderColor="teal.100" borderRadius="lg" p={4}>
            <ConfirmRow label="名前" value={confirmData.name} />
            <ConfirmRow label="メールアドレス" value={confirmData.email} />
          </Stack>

          <Stack direction={{ base: "column", sm: "row" }} gap={{ base: 2, sm: 3 }} pt={2}>
            <Button
              type="button"
              variant="outline"
              colorPalette="gray"
              size="lg"
              w="full"
              minH="48px"
              flex={1}
              borderRadius="lg"
              borderColor="gray.300"
              order={{ base: 2, sm: 1 }}
              disabled={isSubmitting}
              onClick={() => setConfirmData(null)}
            >
              修正する
            </Button>
            <Button
              type="button"
              colorPalette="teal"
              size="lg"
              w="full"
              minH="48px"
              flex={1}
              borderRadius="lg"
              order={{ base: 1, sm: 2 }}
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
              シフトリは、お店から届くリンクで希望シフトを提出できるサービスです。名前と連絡先を登録すると、シフト担当者の確認後に案内が届きます。
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
                cursor="pointer"
                onCheckedChange={(details) => {
                  setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control cursor="pointer" />
                <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
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

function RegistrationShell({ children, centerContent = false }: { children: ReactNode; centerContent?: boolean }) {
  return (
    <Box
      px={{ base: 4, md: 6 }}
      py={{ base: 6, md: 8 }}
      flex={1}
      display={centerContent ? "flex" : undefined}
      alignItems={centerContent ? "center" : undefined}
    >
      <Box maxW="520px" mx="auto">
        {children}
      </Box>
    </Box>
  );
}
