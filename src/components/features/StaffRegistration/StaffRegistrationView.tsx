import { Box, Checkbox, Circle, Field, HStack, Input, Stack, Text, VStack } from "@chakra-ui/react";
import type { FormEventHandler, ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { LuCheck, LuClock, LuUserPlus } from "react-icons/lu";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { StaffGuideContent } from "@/src/components/shared/StaffGuideContent";
import { TurnstileWidget } from "@/src/components/shared/TurnstileWidget";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";

type Props = {
  state:
    | { kind: "expired" }
    | { kind: "submitted" }
    | {
        kind: "confirmation";
        confirmData: { name: string; email: string };
        isSubmitting: boolean;
        onRevise: () => void;
        onSubmit: () => Promise<void> | void;
        turnstile: {
          widgetKey: number;
          siteKey: string;
          onError: (errorCode?: string) => void;
          onVerify: (token: string) => void;
        } | null;
        verificationError: string | null;
      }
    | {
        kind: "form";
        termsPath: string;
        privacyPath: string;
        isSubmitting: boolean;
        nameRegistration: UseFormRegisterReturn<"name">;
        emailRegistration: UseFormRegisterReturn<"email">;
        acceptedLegal: boolean;
        nameError?: string;
        emailError?: string;
        acceptedLegalError?: string;
        typoSuggestion: string | null;
        onConfirm: FormEventHandler<HTMLFormElement>;
        onAcceptedLegalChange: (checked: boolean) => void;
        onApplyEmailSuggestion: () => void;
      };
};

export function StaffRegistrationView({ state }: Props) {
  if (state.kind === "expired") {
    return (
      <RegistrationShell centerContent>
        <PanelFrame tone="neutral" icon={<LuClock />} title="登録リンクを確認できません" headingAs="h1">
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            リンクが無効になっている可能性があります。
            <br />
            シフト作成担当者に、新しい登録リンクの発行を依頼してください。
          </Text>
        </PanelFrame>
      </RegistrationShell>
    );
  }

  if (state.kind === "submitted") {
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="success" icon={<LuCheck />} title="スタッフ登録申請を受け付けました">
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            申請内容を確認します。
            <br />
            必要な場合は、入力したメールアドレスへ案内を送ります。
          </Text>
        </PanelFrame>
      </RegistrationGuideShell>
    );
  }

  if (state.kind === "confirmation") {
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="action" icon={<LuUserPlus />} title="申請内容を確認してください">
          <VStack align="stretch" gap={5}>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              承認後、LINE未連携の場合はこのメールアドレスへ連携の案内を送ります。
              <br />
              募集中のシフトがある場合は、提出案内も送ります。
            </Text>

            <Stack gap={4} bg="white" borderWidth="1px" borderColor="border.default" borderRadius="lg" p={4}>
              <ConfirmRow label="名前" value={state.confirmData.name} />
              <ConfirmRow label="メールアドレス" value={state.confirmData.email} />
            </Stack>

            {state.turnstile ? (
              <TurnstileWidget
                key={state.turnstile.widgetKey}
                action="staff_registration"
                onError={state.turnstile.onError}
                onVerify={state.turnstile.onVerify}
                siteKey={state.turnstile.siteKey}
              />
            ) : null}
            {state.verificationError ? (
              <Text color="red.600" fontSize="sm">
                {state.verificationError}
              </Text>
            ) : null}

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
                disabled={state.isSubmitting}
                onClick={state.onRevise}
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
                loading={state.isSubmitting}
                onClick={state.onSubmit}
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
            名前とメールアドレスを入力して、スタッフ登録を申請します。
            <br />
            確認後、必要な案内をメールで送ります。
          </Text>
          <form id="staff-registration-form" onSubmit={state.onConfirm} noValidate>
            <Stack gap={5}>
              <Field.Root invalid={!!state.nameError}>
                <Field.Label>名前</Field.Label>
                <Input
                  {...state.nameRegistration}
                  bg="white"
                  maxLength={PERSON_NAME_MAX_LENGTH}
                  placeholder="サンプル スタッフ"
                />
                {state.nameError && <Field.ErrorText>{state.nameError}</Field.ErrorText>}
              </Field.Root>

              <Field.Root invalid={!!state.emailError}>
                <Field.Label>メールアドレス</Field.Label>
                <Input
                  type="email"
                  {...state.emailRegistration}
                  bg="white"
                  maxLength={EMAIL_MAX_LENGTH}
                  placeholder="staff@example.com"
                />
                {state.emailError && <Field.ErrorText>{state.emailError}</Field.ErrorText>}
                {state.typoSuggestion && (
                  <Text fontSize="xs" color="orange.600">
                    もしかして{state.typoSuggestion}ですか？
                  </Text>
                )}
              </Field.Root>

              <Field.Root invalid={!!state.acceptedLegalError}>
                <Checkbox.Root
                  colorPalette="teal"
                  checked={state.acceptedLegal}
                  cursor="pointer"
                  onCheckedChange={(details) => state.onAcceptedLegalChange(details.checked === true)}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control
                    bg="white"
                    borderColor="gray.300"
                    cursor="pointer"
                    _checked={{ bg: "teal.500", borderColor: "teal.500" }}
                  />
                  <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
                    <LegalDocumentLink href={state.termsPath}>利用規約</LegalDocumentLink>と
                    <LegalDocumentLink href={state.privacyPath}>プライバシーポリシー</LegalDocumentLink>
                    に同意します
                  </Checkbox.Label>
                </Checkbox.Root>
                {state.acceptedLegalError && <Field.ErrorText>{state.acceptedLegalError}</Field.ErrorText>}
              </Field.Root>

              {state.typoSuggestion && (
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
                      onClick={state.onApplyEmailSuggestion}
                    >
                      {state.typoSuggestion}に直す
                    </Button>
                  </Stack>
                </Box>
              )}

              <Button type="submit" form="staff-registration-form" colorPalette="teal" loading={state.isSubmitting}>
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
