import { Box, Checkbox, Circle, Field, HStack, Input, Stack, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LuCheck, LuClock, LuUserPlus } from "react-icons/lu";
import { type StaffRegistrationFormData, staffRegistrationFormSchema } from "@/convex/staffRegistration/schemas";
import { StaffGuideContent } from "@/src/components/features/StaffGuideContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
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
      <RegistrationShell centerContent>
        <PanelFrame tone="neutral" icon={<LuClock />} title="登録リンクを確認できません" headingAs="h1">
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            リンクが無効になっている可能性があります。シフト担当者に新しい登録リンクを確認してください。
          </Text>
        </PanelFrame>
      </RegistrationShell>
    );
  }

  if (isSubmitted) {
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="success" icon={<LuCheck />} title="申請を送りました">
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            シフト担当者が承認すると、シフト提出の案内がメールで届きます。承認までしばらくおまちください。
          </Text>
        </PanelFrame>
      </RegistrationGuideShell>
    );
  }

  if (confirmData) {
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="action" icon={<LuUserPlus />} title="申請内容を確認してください">
          <VStack align="stretch" gap={5}>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              シフト担当者が承認すると、このメールアドレスにシフト提出の案内が届きます。
            </Text>

            <Stack gap={4} bg="white" borderWidth="1px" borderColor="teal.100" borderRadius="lg" p={4}>
              <ConfirmRow label="名前" value={confirmData.name} />
              <ConfirmRow label="メールアドレス" value={confirmData.email} />
            </Stack>

            <Stack direction={{ base: "column", sm: "row" }} gap={{ base: 2, sm: 3 }} pt={1}>
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
          </VStack>
        </PanelFrame>
      </RegistrationGuideShell>
    );
  }

  return (
    <RegistrationGuideShell>
      <PanelFrame tone="action" icon={<LuUserPlus />} title="スタッフ登録">
        <VStack align="stretch" gap={5}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            名前とメールアドレスを登録すると、シフト担当者の確認後にシフト提出の案内が届きます。
          </Text>
          <form id="staff-registration-form" onSubmit={handleSubmit((values) => setConfirmData(values))} noValidate>
            <Stack gap={5}>
              <Field.Root invalid={!!errors.name}>
                <Field.Label>名前</Field.Label>
                <Input {...register("name")} bg="white" placeholder="例：田中 花子" />
                {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
              </Field.Root>

              <Field.Root invalid={!!errors.email}>
                <Field.Label>メールアドレス</Field.Label>
                <Input type="email" {...register("email")} bg="white" placeholder="例：hanako@example.com" />
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
                  <Checkbox.Control
                    bg="white"
                    borderColor="gray.300"
                    cursor="pointer"
                    _checked={{ bg: "teal.500", borderColor: "teal.500" }}
                  />
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
        </VStack>
      </PanelFrame>
    </RegistrationGuideShell>
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

function RegistrationGuideShell({ children }: { children: ReactNode }) {
  return (
    <Box
      minH="100dvh"
      px={{ base: 3, md: 0 }}
      mt={{ base: `calc(${HEADER_HEIGHT.base} * -1)`, md: `calc(${HEADER_HEIGHT.md} * -1)` }}
      pt={0}
      pb={{ base: 4, md: 8 }}
    >
      <VStack align="stretch" gap={{ base: 4, md: 6 }} w="full" maxW="960px" mx="auto">
        <StaffGuideContent heroTopOffset={HEADER_HEIGHT} />
        <Box px={{ base: 4, md: 8 }} pb={{ base: 5, md: 8 }}>
          {children}
        </Box>
      </VStack>
    </Box>
  );
}

function PanelFrame({
  tone,
  icon,
  title,
  headingAs = "h2",
  children,
}: {
  tone: "action" | "success" | "neutral";
  icon: ReactNode;
  title: string;
  headingAs?: "h1" | "h2";
  children: ReactNode;
}) {
  const styles = {
    action: { bg: "teal.50", iconBg: "teal.500", iconColor: "white" },
    success: { bg: "green.50", iconBg: "green.500", iconColor: "white" },
    neutral: { bg: "gray.50", iconBg: "gray.500", iconColor: "white" },
  }[tone];

  return (
    <Box bg={styles.bg} p={{ base: 5, md: 6 }}>
      <VStack align="stretch" gap={4}>
        <HStack gap={3} align="center">
          <Circle size="36px" bg={styles.iconBg} color={styles.iconColor} flexShrink={0}>
            {icon}
          </Circle>
          <Text as={headingAs} color="gray.900" fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
            {title}
          </Text>
        </HStack>
        {children}
      </VStack>
    </Box>
  );
}
