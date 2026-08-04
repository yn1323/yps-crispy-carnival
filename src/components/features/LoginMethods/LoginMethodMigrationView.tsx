import { Alert, Badge, Box, Card, Checkbox, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { LuArrowLeft, LuCheck, LuRefreshCw, LuShieldCheck } from "react-icons/lu";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { EmailCodeVerificationForm } from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { Button } from "@/src/components/ui/Button";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
import type {
  EmailPasswordMigrationPhase,
  GoogleConnectionPhase,
  GoogleReplacementPhase,
  LoginMethodMigrationFeedback,
} from "./migrationTypes";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { EmailPasswordMigrationController } from "./useEmailPasswordMigrationController";
import type { GoogleConnectionController } from "./useGoogleConnectionController";
import type { GoogleReplacementController } from "./useGoogleReplacementController";

const emailSchema = z.object({ email: requiredEmailSchema });
const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください。"),
    confirmation: z.string(),
    signOutOfOtherSessions: z.boolean(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ["confirmation"],
    message: "確認用パスワードが一致しません。",
  });

type EmailValues = z.infer<typeof emailSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

type CommonProps = {
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
  canRequestPreviousMethodRemoval: boolean;
};

export type LoginMethodMigrationViewProps = CommonProps &
  (
    | { flow: "add-email-password"; controller: EmailPasswordMigrationController }
    | { flow: "connect-google"; controller: GoogleConnectionController }
    | { flow: "replace-google"; controller: GoogleReplacementController }
  );

export function LoginMethodMigrationView(props: LoginMethodMigrationViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentPhase = props.controller.state.phase;
  const isReverifying = props.reverification.state.status !== "idle";
  const isReverificationSubmitting =
    props.reverification.state.status === "submitting" || props.reverification.state.status === "completing";
  const isControllerBusy =
    props.controller.state.feedback.status === "loading" ||
    (props.flow === "replace-google" &&
      (props.controller.fallback.state.feedback.status === "loading" ||
        props.controller.newGoogle.state.feedback.status === "loading"));
  const preventLeaving = isReverificationSubmitting || isControllerBusy;

  useEffect(() => {
    if (currentPhase) headingRef.current?.focus();
  }, [currentPhase]);

  const backToOverview = () => {
    if (preventLeaving) return;
    if (isReverifying) {
      props.reverification.cancel();
    }
    props.onBackToOverview();
  };

  return (
    <Stack w="full" maxW="640px" gap={5}>
      <Button alignSelf="flex-start" variant="ghost" onClick={backToOverview} disabled={preventLeaving}>
        <LuArrowLeft aria-hidden />
        ログイン設定に戻る
      </Button>

      <Box>
        <Text ref={headingRef} as="h2" tabIndex={-1} fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
          {flowTitle(props.flow)}
        </Text>
        <Text mt={1} color="fg.muted">
          {flowDescription(props.flow)}
        </Text>
      </Box>

      <PhaseIndicator flow={props.flow} phase={props.controller.state.phase} />

      {isReverifying ? (
        <Card.Root variant="outline" borderRadius="xl">
          <Card.Header pb={2}>
            <HStack gap={2}>
              <LuShieldCheck aria-hidden />
              <Card.Title>確認が必要です</Card.Title>
            </HStack>
          </Card.Header>
          <Card.Body>
            <LoginMethodReverificationView controller={props.reverification} />
          </Card.Body>
        </Card.Root>
      ) : props.flow === "add-email-password" ? (
        <EmailPasswordMigrationContent
          controller={props.controller}
          onBackToOverview={props.onBackToOverview}
          onRequestPreviousMethodRemoval={props.onRequestPreviousMethodRemoval}
          canRequestPreviousMethodRemoval={props.canRequestPreviousMethodRemoval}
        />
      ) : props.flow === "connect-google" ? (
        <GoogleConnectionContent
          controller={props.controller}
          onBackToOverview={props.onBackToOverview}
          onRequestPreviousMethodRemoval={props.onRequestPreviousMethodRemoval}
          canRequestPreviousMethodRemoval={props.canRequestPreviousMethodRemoval}
        />
      ) : (
        <GoogleReplacementContent controller={props.controller} />
      )}
    </Stack>
  );
}

function EmailPasswordMigrationContent({
  controller,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
  canRequestPreviousMethodRemoval,
}: {
  controller: EmailPasswordMigrationController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
  canRequestPreviousMethodRemoval: boolean;
}) {
  const { state } = controller;
  return (
    <MigrationCard feedback={state.feedback}>
      <CurrentLoginMethodSummary
        google="現在の設定を維持します"
        emailPassword={emailPasswordSummary(state.phase, state.targetMaskedEmail)}
      />
      {state.phase === "choosingEmail" ? <EmailChoiceStep controller={controller} requireUnlinked={false} /> : null}
      {state.phase === "verifyingEmail" ? (
        <EmailVerificationStep controller={controller} onBack={controller.reset} />
      ) : null}
      {state.phase === "settingPassword" ? <PasswordStep controller={controller} onBack={controller.reset} /> : null}
      {state.phase === "methodReady" ? (
        <CompletedState
          title="新しいログイン方法を設定しました"
          description="現在は2つのログイン方法を利用できます。ログイン時にGoogleかメールアドレス・パスワードのどちらか一方を選べます。"
          actions={
            <AdditionalMethodResultActions
              onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
              onKeepBoth={onBackToOverview}
              canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval && state.safeForGoogleDisconnect}
              removalUnavailableMessage={
                state.safeForGoogleDisconnect
                  ? "Googleを解除する操作は現在利用できません。今は2つの方法を残してください。"
                  : "Googleを解除するには、Googleと接続していない確認済みメールアドレスが必要です。今は2つの方法を残してください。"
              }
            />
          }
        />
      ) : null}
      {state.phase === "unavailable" ? (
        <UnavailableState onRefresh={controller.refresh} message="この変更は現在利用できません。" />
      ) : null}
    </MigrationCard>
  );
}

function GoogleConnectionContent({
  controller,
  onBackToOverview,
  onRequestPreviousMethodRemoval,
  canRequestPreviousMethodRemoval,
}: {
  controller: GoogleConnectionController;
  onBackToOverview: () => void;
  onRequestPreviousMethodRemoval: () => void;
  canRequestPreviousMethodRemoval: boolean;
}) {
  const { state } = controller;
  const busy = state.feedback.status === "loading";
  return (
    <MigrationCard feedback={state.feedback}>
      <CurrentLoginMethodSummary
        google={googleConnectionSummary(state.phase, state.maskedEmail)}
        emailPassword="既存の設定を維持します"
      />
      {state.phase === "readyToConnect" ? (
        <Stack gap={5}>
          <Box>
            <Text fontSize="lg" fontWeight="semibold">
              Googleアカウントを選択します
            </Text>
            <Text mt={2} color="fg.muted">
              Google側の画面で、シフトリへのログインに使うアカウントを選択してください。メールアドレスの入力は不要です。
            </Text>
          </Box>
          <Button
            alignSelf={{ base: "stretch", sm: "flex-start" }}
            colorPalette="teal"
            size="lg"
            loading={busy}
            loadingText="確認中"
            onClick={() => {
              void controller.start();
            }}
          >
            Googleアカウントを選ぶ
          </Button>
        </Stack>
      ) : null}
      {state.phase === "redirecting" ? (
        <StatusState
          title="Googleの画面を開いています"
          description="画面が切り替わらない場合は、最新の状態を確認してください。"
        />
      ) : null}
      {state.phase === "settling" ? (
        <StatusState title="Googleログインを確認しています" description="この画面を閉じずにお待ちください。" />
      ) : null}
      {state.phase === "methodReady" ? (
        <CompletedState
          title="新しいログイン方法を設定しました"
          description="現在は2つのログイン方法を利用できます。ログイン時にGoogleかメールアドレス・パスワードのどちらか一方を選べます。"
          actions={
            <AdditionalMethodResultActions
              onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval}
              onKeepBoth={onBackToOverview}
              canRequestPreviousMethodRemoval={canRequestPreviousMethodRemoval}
              removalUnavailableMessage="パスワードを削除する操作は現在利用できません。今は2つの方法を残してください。"
            />
          }
        />
      ) : null}
      {state.phase === "unavailable" ? (
        <UnavailableState
          onRefresh={controller.refresh}
          onRetry={() => controller.start()}
          message="Googleログインを追加できませんでした。以前のログイン方法は変更されていません。"
        />
      ) : null}
    </MigrationCard>
  );
}

function GoogleReplacementContent({ controller }: { controller: GoogleReplacementController }) {
  const { state } = controller;
  return (
    <MigrationCard feedback={state.feedback}>
      <CurrentLoginMethodSummary
        google={googleReplacementSummary(state.phase, controller.newGoogle.state.maskedEmail)}
        emailPassword={replacementFallbackSummary(state.phase, controller.fallback.state)}
      />
      {state.phase === "ensuringFallback" ? (
        <Stack gap={5}>
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>
              先に、Googleと接続していない確認済みメールアドレスとパスワードを退避方法として設定します。
            </Alert.Description>
          </Alert.Root>
          {controller.fallback.state.phase === "choosingEmail" ? (
            <EmailChoiceStep controller={controller.fallback} requireUnlinked />
          ) : null}
          {controller.fallback.state.phase === "verifyingEmail" ? (
            <EmailVerificationStep controller={controller.fallback} onBack={controller.fallback.reset} />
          ) : null}
          {controller.fallback.state.phase === "settingPassword" ? (
            <PasswordStep controller={controller.fallback} onBack={controller.fallback.reset} />
          ) : null}
        </Stack>
      ) : null}
      {state.phase === "fallbackReady" ? (
        <Stack gap={5}>
          <Box>
            <Text fontSize="lg" fontWeight="semibold">
              退避方法を確認しました
            </Text>
            <Text mt={2} color="fg.muted">
              以前のGoogleを解除しても、確認済みメールアドレスとパスワードでログインできます。
            </Text>
          </Box>
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>
              次へ進むと、現在のGoogleアカウントではログインできなくなります。新しいGoogleの接続に失敗しても、退避方法は削除しません。
            </Alert.Description>
          </Alert.Root>
          <Button
            alignSelf={{ base: "stretch", sm: "flex-start" }}
            colorPalette="red"
            size="lg"
            onClick={() => {
              void controller.removeOldGoogle();
            }}
          >
            以前のGoogleを解除して続ける
          </Button>
        </Stack>
      ) : null}
      {state.phase === "removingOldGoogle" ? (
        <StatusState title="以前のGoogleを解除しています" description="退避方法を再確認してから解除します。" />
      ) : null}
      {state.phase === "connectingNewGoogle" ? (
        <Stack gap={5}>
          <Box>
            <Text fontSize="lg" fontWeight="semibold">
              新しいGoogleアカウントを選択します
            </Text>
            <Text mt={2} color="fg.muted">
              Google側の画面で新しいアカウントを選択してください。接続に失敗しても、退避用のログイン方法は残ります。
            </Text>
          </Box>
          <Button
            alignSelf={{ base: "stretch", sm: "flex-start" }}
            colorPalette="teal"
            size="lg"
            onClick={() => {
              void controller.startNewGoogle();
            }}
          >
            新しいGoogleアカウントを選ぶ
          </Button>
        </Stack>
      ) : null}
      {state.phase === "newGoogleReady" ? (
        <CompletedState
          title="Googleログインを利用できます"
          description="退避用のメールアドレスとパスワードは残しています。不要な場合はログイン設定へ戻り、別の操作として削除してください。"
        />
      ) : null}
      {state.phase === "unavailable" ? (
        <UnavailableState onRefresh={controller.refresh} message="Googleアカウントの変更は現在利用できません。" />
      ) : null}
    </MigrationCard>
  );
}

function EmailChoiceStep({
  controller,
  requireUnlinked,
}: {
  controller: EmailPasswordMigrationController;
  requireUnlinked: boolean;
}) {
  const selectCurrentEmail = controller.useCurrentEmail;
  const selectDifferentEmail = controller.useDifferentEmail;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack gap={5}>
      <Box>
        <Text fontSize="lg" fontWeight="semibold">
          {requireUnlinked ? "退避用のメールアドレス" : "ログインに使うメールアドレス"}
        </Text>
        <Text mt={2} color="fg.muted">
          {requireUnlinked
            ? "Googleと接続していないメールアドレスを選ぶか、新しく追加してください。"
            : "登録済みの確認済みメールを使うか、別のメールアドレスを追加できます。"}
        </Text>
      </Box>

      <Button
        variant="outline"
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        disabled={busy}
        onClick={() => {
          void selectCurrentEmail();
        }}
      >
        {requireUnlinked ? "登録済みの別メールを使う" : "現在のメールを使う"}
      </Button>

      <Stack
        as="form"
        gap={4}
        onSubmit={handleSubmit(async ({ email }) => {
          await selectDifferentEmail(email);
        })}
      >
        <Field.Root invalid={Boolean(errors.email)}>
          <Field.Label>別のメールアドレス</Field.Label>
          <Input
            type="email"
            autoComplete="email"
            placeholder="例：login@example.com"
            maxLength={EMAIL_MAX_LENGTH}
            {...register("email")}
          />
          <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
        </Field.Root>
        <Button
          type="submit"
          colorPalette="teal"
          alignSelf={{ base: "stretch", sm: "flex-start" }}
          loading={busy}
          loadingText="確認中"
        >
          このメールを使う
        </Button>
      </Stack>
    </Stack>
  );
}

function EmailVerificationStep({
  controller,
  onBack,
}: {
  controller: EmailPasswordMigrationController;
  onBack?: () => void;
}) {
  const feedback = controller.state.feedback;
  return (
    <Stack gap={3}>
      <EmailCodeVerificationForm
        description={`${controller.state.targetMaskedEmail ?? "入力したメールアドレス"}に確認コードを送りました。`}
        isSubmitting={feedback.status === "loading"}
        submitLabel="メールを確認"
        submittingLabel="確認中"
        onSubmit={async ({ code }) => {
          await controller.verifyEmail(code);
        }}
        secondaryActions={
          <HStack justify="flex-end" flexWrap="wrap">
            {onBack ? (
              <Button type="button" variant="ghost" disabled={feedback.status === "loading"} onClick={onBack}>
                メールアドレスを選び直す
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={feedback.status === "loading"}
              onClick={() => {
                void controller.resendEmailCode();
              }}
            >
              確認コードを再送
            </Button>
          </HStack>
        }
      />
    </Stack>
  );
}

function PasswordStep({ controller, onBack }: { controller: EmailPasswordMigrationController; onBack?: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmation: "", signOutOfOtherSessions: false },
    shouldFocusError: true,
  });
  const busy = controller.state.feedback.status === "loading";

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={handleSubmit(async ({ newPassword, signOutOfOtherSessions }) => {
        await controller.setPassword({ newPassword, signOutOfOtherSessions });
      })}
    >
      <Box>
        <Text fontSize="lg" fontWeight="semibold">
          パスワードを設定します
        </Text>
        <Text mt={2} color="fg.muted">
          現在のパスワードはありません。新しいパスワードだけを入力してください。
        </Text>
      </Box>
      <Field.Root invalid={Boolean(errors.newPassword)}>
        <Field.Label>新しいパスワード</Field.Label>
        <Input type="password" autoComplete="new-password" {...register("newPassword")} />
        <Field.ErrorText>{errors.newPassword?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={Boolean(errors.confirmation)}>
        <Field.Label>新しいパスワード（確認）</Field.Label>
        <Input type="password" autoComplete="new-password" {...register("confirmation")} />
        <Field.ErrorText>{errors.confirmation?.message}</Field.ErrorText>
      </Field.Root>
      <Checkbox.Root>
        <Checkbox.HiddenInput {...register("signOutOfOtherSessions")} />
        <Checkbox.Control />
        <Checkbox.Label>ほかの端末からログアウトする</Checkbox.Label>
      </Checkbox.Root>
      <HStack gap={3} flexWrap="wrap">
        {onBack ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
            メールアドレスを選び直す
          </Button>
        ) : null}
        <Button type="submit" colorPalette="teal" size="lg" loading={busy} loadingText="設定中">
          パスワードを設定
        </Button>
      </HStack>
    </Stack>
  );
}

function MigrationCard({ feedback, children }: { feedback: LoginMethodMigrationFeedback; children: ReactNode }) {
  return (
    <Card.Root variant="outline" borderRadius="xl">
      <Card.Body>
        <Stack gap={5}>
          <FeedbackAlert feedback={feedback} />
          {children}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

function FeedbackAlert({ feedback }: { feedback: LoginMethodMigrationFeedback }) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedback.status === "error" && feedback.message) alertRef.current?.focus();
  }, [feedback.message, feedback.status]);

  if (!feedback.message || feedback.status === "idle" || feedback.status === "loading") return null;
  return (
    <Alert.Root
      ref={alertRef}
      status={feedback.status === "error" ? "error" : "success"}
      role={feedback.status === "error" ? "alert" : "status"}
      aria-live={feedback.status === "error" ? "assertive" : "polite"}
      tabIndex={feedback.status === "error" ? -1 : undefined}
      borderRadius="lg"
    >
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{feedback.message}</Alert.Description>
    </Alert.Root>
  );
}

function CurrentLoginMethodSummary({ google, emailPassword }: { google: string; emailPassword: string }) {
  return (
    <Box bg="bg.muted" borderRadius="lg" px={4} py={3} aria-label="現在のログイン方法">
      <Text fontWeight="semibold">現在のログイン方法</Text>
      <Stack mt={2} gap={1}>
        <Text fontSize="sm">
          <Text as="span" fontWeight="medium">
            Google：
          </Text>
          {google}
        </Text>
        <Text fontSize="sm">
          <Text as="span" fontWeight="medium">
            メールアドレスとパスワード：
          </Text>
          {emailPassword}
        </Text>
      </Stack>
    </Box>
  );
}

function emailPasswordSummary(phase: EmailPasswordMigrationPhase, targetMaskedEmail: string | null) {
  if (phase === "choosingEmail") return "設定するメールアドレスを選択中です";
  if (phase === "verifyingEmail") return `${targetMaskedEmail ?? "選択したメールアドレス"}（メール確認中）`;
  if (phase === "settingPassword") return `${targetMaskedEmail ?? "選択したメールアドレス"}（パスワード設定前）`;
  if (phase === "methodReady") return `${targetMaskedEmail ?? "確認済みメールアドレス"}（利用できます）`;
  return "状態を確認できません";
}

function googleConnectionSummary(phase: GoogleConnectionPhase, maskedEmail: string | null) {
  if (phase === "methodReady") return `${maskedEmail ?? "選択したGoogleアカウント"}（利用できます）`;
  if (phase === "redirecting" || phase === "settling") return "接続を確認中です";
  if (phase === "readyToConnect") return "追加するGoogleアカウントを選択前です";
  return "状態を確認できません";
}

function googleReplacementSummary(phase: GoogleReplacementPhase, newGoogleMaskedEmail: string | null) {
  if (phase === "ensuringFallback" || phase === "fallbackReady") return "現在のGoogleを維持しています";
  if (phase === "removingOldGoogle") return "以前のGoogleを解除中です";
  if (phase === "connectingNewGoogle") return "以前のGoogleは解除済みです。新しいGoogleを選択前です";
  if (phase === "newGoogleReady") {
    return `${newGoogleMaskedEmail ?? "新しいGoogleアカウント"}（利用できます）`;
  }
  return "状態を確認できません";
}

function replacementFallbackSummary(
  phase: GoogleReplacementPhase,
  fallbackState: EmailPasswordMigrationController["state"],
) {
  if (phase !== "ensuringFallback") {
    if (phase === "unavailable" && !fallbackState.safeForGoogleDisconnect) return "状態を確認できません";
    return `${fallbackState.targetMaskedEmail ?? "退避用メールアドレス"}（利用できます）`;
  }
  return emailPasswordSummary(fallbackState.phase, fallbackState.targetMaskedEmail);
}

function CompletedState({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <Stack gap={3} align="start">
      <Badge colorPalette="green" size="lg">
        <LuCheck aria-hidden />
        利用できます
      </Badge>
      <Text fontSize="lg" fontWeight="semibold">
        {title}
      </Text>
      <Text color="fg.muted">{description}</Text>
      {actions}
    </Stack>
  );
}

function AdditionalMethodResultActions({
  onRequestPreviousMethodRemoval,
  onKeepBoth,
  canRequestPreviousMethodRemoval,
  removalUnavailableMessage,
}: {
  onRequestPreviousMethodRemoval: () => void;
  onKeepBoth: () => void;
  canRequestPreviousMethodRemoval: boolean;
  removalUnavailableMessage: string;
}) {
  return (
    <Stack w="full" gap={3} pt={2}>
      {canRequestPreviousMethodRemoval ? (
        <Button
          colorPalette="teal"
          alignSelf={{ base: "stretch", sm: "flex-start" }}
          onClick={onRequestPreviousMethodRemoval}
        >
          以前の方法を停止して切替を完了
        </Button>
      ) : (
        <Alert.Root status="info" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>{removalUnavailableMessage}</Alert.Description>
        </Alert.Root>
      )}
      <Button variant="outline" alignSelf={{ base: "stretch", sm: "flex-start" }} onClick={onKeepBoth}>
        今は2つの方法を残す
      </Button>
    </Stack>
  );
}

function StatusState({ title, description }: { title: string; description: string }) {
  return (
    <Stack gap={2} aria-live="polite">
      <Text fontSize="lg" fontWeight="semibold">
        {title}
      </Text>
      <Text color="fg.muted">{description}</Text>
    </Stack>
  );
}

function UnavailableState({
  message,
  onRefresh,
  onRetry,
}: {
  message: string;
  onRefresh: () => Promise<boolean | undefined>;
  onRetry?: () => Promise<boolean | undefined>;
}) {
  return (
    <Stack gap={4}>
      <Alert.Root status="error" borderRadius="lg">
        <Alert.Indicator />
        <Alert.Description>{message}</Alert.Description>
      </Alert.Root>
      <HStack gap={3} flexWrap="wrap">
        <Button
          variant="outline"
          onClick={() => {
            void onRefresh();
          }}
        >
          <LuRefreshCw aria-hidden />
          最新の状態を確認
        </Button>
        {onRetry ? (
          <Button
            colorPalette="teal"
            onClick={() => {
              void onRetry();
            }}
          >
            もう一度試す
          </Button>
        ) : null}
      </HStack>
    </Stack>
  );
}

function PhaseIndicator({ flow, phase }: { flow: LoginMethodMigrationViewProps["flow"]; phase: string }) {
  const labels = flow === "replace-google" ? ["退避方法", "旧Google解除", "新Google接続"] : ["設定", "確認", "完了"];
  const current = phaseIndex(flow, phase);
  return (
    <>
      <Badge display={{ base: "inline-flex", md: "none" }} alignSelf="flex-start" colorPalette="teal">
        フェーズ {current + 1}/{labels.length}：{labels[current]}
      </Badge>
      <HStack as="ol" display={{ base: "none", md: "flex" }} gap={2} aria-label="変更の進行状況">
        {labels.map((label, index) => (
          <Box
            as="li"
            key={label}
            flex="1"
            px={4}
            py={3}
            borderRadius="lg"
            bg={index === current ? "teal.subtle" : "bg.muted"}
            color={index === current ? "teal.fg" : "fg.muted"}
            fontWeight={index === current ? "semibold" : "normal"}
            aria-current={index === current ? "step" : undefined}
          >
            {index + 1}. {label}
          </Box>
        ))}
      </HStack>
    </>
  );
}

function phaseIndex(flow: LoginMethodMigrationViewProps["flow"], phase: string) {
  if (flow === "replace-google") {
    if (phase === "removingOldGoogle" || phase === "fallbackReady") return 1;
    if (phase === "connectingNewGoogle" || phase === "newGoogleReady") return 2;
    return 0;
  }
  if (flow === "add-email-password") {
    if (phase === "verifyingEmail" || phase === "settingPassword") return 1;
    if (phase === "methodReady") return 2;
    return 0;
  }
  if (phase === "redirecting" || phase === "settling") return 1;
  if (phase === "methodReady") return 2;
  return 0;
}

function flowTitle(flow: LoginMethodMigrationViewProps["flow"]) {
  if (flow === "add-email-password") return "メールアドレスとパスワードを設定";
  if (flow === "connect-google") return "Googleログインを追加";
  return "Googleアカウントを変更";
}

function flowDescription(flow: LoginMethodMigrationViewProps["flow"]) {
  if (flow === "add-email-password") return "メールを確認してから、新しいパスワードを設定します。";
  if (flow === "connect-google") return "現在のログイン方法を残したまま、Googleログインを追加します。";
  return "退避用のログイン方法を確立してから、以前のGoogleを新しいGoogleへ変更します。";
}
