import { Box, Checkbox, Circle, Field, HStack, Stack, Text, VStack } from "@chakra-ui/react";
import type { FormEventHandler, ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { LuCheck, LuClock, LuMail, LuUserPlus } from "react-icons/lu";
import {
  EMAIL_MAX_LENGTH,
  MINUTE_MS,
  PERSON_NAME_MAX_LENGTH,
  STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH,
  STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
} from "@/convex/constants";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { StaffGuideContent } from "@/src/components/shared/StaffGuideContent";
import { TurnstileWidget } from "@/src/components/shared/TurnstileWidget";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/FormControls";

const STAFF_REGISTRATION_TROUBLE_GUIDANCE =
  "解決しない場合は、シフトの管理者に名前とメールアドレスを伝え、スタッフ登録を依頼してください。";

const VERIFICATION_CODE_LENGTH_LABEL = `${STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH}桁`;
// 確認コードのメールの送信元。迷惑メールフォルダや受信設定で探せるよう、画面に出す。
const VERIFICATION_SENDER_EMAIL = "noreply@shiftori.app";
const VERIFICATION_CODE_TTL_LABEL = `${STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS / MINUTE_MS}分`;

type Props = {
  state:
    | { kind: "expired" }
    | { kind: "submitted" }
    | {
        kind: "code";
        email: string;
        codeRegistration: UseFormRegisterReturn<"code">;
        codeError?: string;
        isConfirming: boolean;
        isResending: boolean;
        resendRemainingSeconds: number;
        onConfirmCode: FormEventHandler<HTMLFormElement>;
        onResend: () => Promise<void> | void;
        onReviseEmail: () => void;
      }
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
            リンクが古くなっている可能性があります。
            <br />
            シフト作成担当者連絡し、新しい登録リンクの発行を依頼してください。
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
            管理者が承認するまでお待ちください。
            <br />
            承認後は入力したメールアドレスに通知が届きます。
            <br />
            こちらのページは閉じて構いません。
          </Text>
        </PanelFrame>
      </RegistrationGuideShell>
    );
  }

  if (state.kind === "code") {
    const isBusy = state.isConfirming || state.isResending;
    const isResendWaiting = state.resendRemainingSeconds > 0;
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="action" icon={<LuMail />} title="確認コードを入力してください">
          <VStack align="stretch" gap={5}>
            <Stack gap={2} bg="white" borderWidth="1px" borderColor="border.default" borderRadius="lg" p={4}>
              <ConfirmRow label="メールアドレス" value={state.email} />
              <Button
                type="button"
                variant="plain"
                size="sm"
                colorPalette="teal"
                alignSelf="flex-start"
                h="auto"
                p={0}
                textDecoration="underline"
                disabled={isBusy}
                onClick={state.onReviseEmail}
              >
                メールアドレスを修正する
              </Button>
            </Stack>

            <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
              <Text>
                {VERIFICATION_SENDER_EMAIL} から確認メールを送りました。
                <br />
                メールに記載の数字{VERIFICATION_CODE_LENGTH_LABEL}を入力してください。
              </Text>
              <Text>確認コードの有効期限は{VERIFICATION_CODE_TTL_LABEL}です。</Text>
            </Stack>

            <form id="staff-registration-code-form" onSubmit={state.onConfirmCode} noValidate>
              <Stack gap={5}>
                <Field.Root invalid={!!state.codeError}>
                  <Field.Label>確認コード</Field.Label>
                  <Input
                    {...state.codeRegistration}
                    bg="white"
                    size="lg"
                    textAlign="center"
                    letterSpacing="0.3em"
                    type="number"
                    // 数値入力は矢印キーとホイールで値が増減する。6桁で自動申請するため、意図しない別のコードを送らない。
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault();
                    }}
                    onWheel={(event) => event.currentTarget.blur()}
                    inputMode="numeric"
                    autocompletePolicy="auth"
                    autoComplete="one-time-code"
                    maxLength={STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH}
                    placeholder="123456"
                  />
                  {state.codeError && <Field.ErrorText whiteSpace="pre-line">{state.codeError}</Field.ErrorText>}
                </Field.Root>

                <Stack gap={2}>
                  <Button
                    type="submit"
                    form="staff-registration-code-form"
                    colorPalette="teal"
                    size="lg"
                    minH="48px"
                    borderRadius="lg"
                    loading={state.isConfirming}
                    disabled={state.isResending}
                  >
                    申請する
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    colorPalette="gray"
                    size="sm"
                    loading={state.isResending}
                    disabled={isResendWaiting || state.isConfirming}
                    onClick={state.onResend}
                  >
                    {isResendWaiting
                      ? `確認コードを再送する（あと${state.resendRemainingSeconds}秒）`
                      : "確認コードを再送する"}
                  </Button>
                </Stack>

                <Text fontSize="xs" color="fg.muted" lineHeight="tall">
                  メールが届かない場合は、迷惑メールフォルダを確認してください。
                  <br />
                  {STAFF_REGISTRATION_TROUBLE_GUIDANCE}
                </Text>
              </Stack>
            </form>
          </VStack>
        </PanelFrame>
      </RegistrationGuideShell>
    );
  }

  if (state.kind === "confirmation") {
    return (
      <RegistrationGuideShell>
        <PanelFrame tone="action" icon={<LuUserPlus />} title="申請内容を確認してください">
          <VStack align="stretch" gap={5}>
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
                troubleGuidance={STAFF_REGISTRATION_TROUBLE_GUIDANCE}
              />
            ) : null}
            {state.verificationError ? (
              <Text color="red.600" fontSize="sm" whiteSpace="pre-line">
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
                確認に進む
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
            名前とメールアドレスを入力して、スタッフ登録申請します。
            <br />
            管理者承認後、シフトの連絡が届くようになります。
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
