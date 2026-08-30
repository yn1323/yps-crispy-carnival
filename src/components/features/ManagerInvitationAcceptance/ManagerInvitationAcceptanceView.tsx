import {
  Alert,
  Box,
  Card,
  Circle,
  Container,
  Field,
  Heading,
  HStack,
  Icon,
  Spinner,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCheck, LuCircleAlert, LuClock, LuLink, LuLogIn, LuRefreshCw, LuUserPlus } from "react-icons/lu";
import { z } from "zod";
import { requiredEmailSchema } from "@/convex/_lib/validation";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import {
  EmailCodeVerificationForm,
  type EmailVerificationValues,
} from "@/src/components/features/AuthPage/EmailCodeVerificationForm";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/FormControls";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

const invitationEmailSchema = z.object({ email: requiredEmailSchema });
type InvitationEmailValues = z.infer<typeof invitationEmailSchema>;

export type ManagerInvitationAcceptanceViewState =
  | { kind: "loading" }
  | {
      kind: "ready";
      organizationName: string;
      expiresAtLabel: string;
      isSignedIn: boolean;
      isAccepting: boolean;
    }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "used" }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | {
      kind: "verificationRequired";
      step: "input";
      errorMessage: string | null;
      isBusy: boolean;
    }
  | {
      kind: "verificationRequired";
      step: "code";
      maskedEmail: string;
      errorMessage: string | null;
      infoMessage: string | null;
      isBusy: boolean;
    }
  | { kind: "conflict"; isAccepting: boolean }
  | { kind: "retryableError"; isRetrying: boolean }
  | {
      kind: "accepted";
      organizationName: string | null;
      isPreparingDestination: boolean;
      hasDestination: boolean;
    };

export type ManagerInvitationAcceptanceViewProps = {
  state: ManagerInvitationAcceptanceViewState;
  actions: {
    onAccept: () => void;
    onLogin: () => void;
    onSignup: () => void;
    onStartVerification: (email: string) => void | Promise<void>;
    onVerifyCode: (values: EmailVerificationValues) => void | Promise<void>;
    onResendCode: () => void | Promise<void>;
    onBackToVerificationInput: () => void;
    onGoToDashboard: () => void;
  };
};

export function ManagerInvitationAcceptanceView({ state, actions }: ManagerInvitationAcceptanceViewProps) {
  return (
    <Box minH="100dvh" bgGradient="to-b" gradientFrom="teal.50" gradientVia="gray.50" gradientTo="white">
      <Header variant="public" showLogin={false} showSignup={false} />
      <Container
        as="main"
        maxW="2xl"
        minH="100dvh"
        display="flex"
        alignItems="center"
        px={{ base: 4, md: 6 }}
        pt={`calc(${HEADER_HEIGHT.base} + 32px)`}
        pb={{ base: 8, md: 12 }}
      >
        <Card.Root w="full" borderWidth="1px" borderColor="blackAlpha.100" borderRadius="2xl" shadow="xl">
          <Card.Body p={{ base: 6, md: 9 }} aria-live="polite">
            <InvitationContent state={state} actions={actions} />
          </Card.Body>
        </Card.Root>
      </Container>
    </Box>
  );
}

function InvitationContent({ state, actions }: ManagerInvitationAcceptanceViewProps) {
  if (state.kind === "loading") {
    return <ShiftoriLoading variant="section" aria-label="招待情報を確認中" />;
  }

  if (state.kind === "ready") {
    return <ReadyInvitation state={state} actions={actions} />;
  }

  if (state.kind === "verificationRequired") {
    return <VerificationRequired state={state} actions={actions} />;
  }

  const content = getStatusContent(state);
  return (
    <VStack align="stretch" gap={6}>
      <VStack gap={4} textAlign="center">
        <Circle size="64px" bg={content.iconBg} color={content.iconColor}>
          <Icon as={content.icon} boxSize={7} />
        </Circle>
        <Stack gap={2}>
          <Heading as="h1" size={{ base: "lg", md: "xl" }} color="gray.950">
            {content.title}
          </Heading>
          <Text color="gray.700" fontSize="sm" lineHeight="tall" whiteSpace="pre-line">
            {content.description}
          </Text>
        </Stack>
      </VStack>

      {state.kind === "conflict" && (
        <Button colorPalette="teal" size="lg" minH="48px" loading={state.isAccepting} onClick={actions.onAccept}>
          もう一度確認する
        </Button>
      )}

      {state.kind === "retryableError" && (
        <Button colorPalette="teal" size="lg" minH="48px" loading={state.isRetrying} onClick={actions.onAccept}>
          再実行する
        </Button>
      )}

      {state.kind === "used" && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onGoToDashboard}>
          シフトリを確認する
        </Button>
      )}

      {state.kind === "accepted" && !state.isPreparingDestination && !state.hasDestination && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onGoToDashboard}>
          シフトリを確認する
        </Button>
      )}
    </VStack>
  );
}

function VerificationRequired({
  state,
  actions,
}: {
  state: Extract<ManagerInvitationAcceptanceViewState, { kind: "verificationRequired" }>;
  actions: ManagerInvitationAcceptanceViewProps["actions"];
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationEmailValues>({ resolver: zodResolver(invitationEmailSchema) });

  return (
    <VStack align="stretch" gap={6}>
      <VStack gap={4} textAlign="center">
        <Circle size="64px" bg="teal.50" color="teal.700">
          <LuLink size={28} aria-hidden />
        </Circle>
        <Stack gap={2}>
          <Heading as="h1" size={{ base: "lg", md: "xl" }} color="gray.950">
            本人確認が必要
          </Heading>
          <Text color="gray.700" fontSize="sm" lineHeight="tall">
            管理者招待メール送信先と、シフトリのアカウントのメールアドレスが異なります。
            <br />
            確認コードから本人確認を行います。
          </Text>
        </Stack>
      </VStack>

      {state.step === "input" ? (
        <Stack as="form" gap={5} onSubmit={handleSubmit(({ email }) => actions.onStartVerification(email))}>
          <Alert.Root status="info" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>
              管理者招待メールを受け取ったメールアドレスを入力してください。
              <br />
              確認コードをその宛先へ送信します。
            </Alert.Description>
          </Alert.Root>
          {state.errorMessage && (
            <Alert.Root status="error" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Description whiteSpace="pre-line">{state.errorMessage}</Alert.Description>
            </Alert.Root>
          )}
          <Field.Root invalid={!!errors.email}>
            <Field.Label>メールアドレス</Field.Label>
            <Input
              type="email"
              autocompletePolicy="auth"
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              placeholder="manager@example.com"
              {...register("email")}
            />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>
          <Button
            type="submit"
            colorPalette="teal"
            size="lg"
            minH="48px"
            loading={state.isBusy}
            loadingText="送信しています"
          >
            確認コードを送信
          </Button>
        </Stack>
      ) : (
        <EmailCodeVerificationForm
          description={`${state.maskedEmail}宛てに送信した確認コードを入力してください。`}
          errorMessage={state.errorMessage ?? undefined}
          infoMessage={state.infoMessage ?? undefined}
          isSubmitting={state.isBusy}
          submitLabel="確認して参加する"
          submittingLabel="確認しています"
          onSubmit={actions.onVerifyCode}
          codeInputAction={
            <Button
              type="button"
              variant="ghost"
              colorPalette="teal"
              size="sm"
              fontWeight="semibold"
              alignSelf="flex-end"
              disabled={state.isBusy}
              onClick={actions.onResendCode}
            >
              コードを再送する
            </Button>
          }
          secondaryActions={
            <Button type="button" variant="outline" disabled={state.isBusy} onClick={actions.onBackToVerificationInput}>
              戻る
            </Button>
          }
        />
      )}
    </VStack>
  );
}

function ReadyInvitation({
  state,
  actions,
}: {
  state: Extract<ManagerInvitationAcceptanceViewState, { kind: "ready" }>;
  actions: ManagerInvitationAcceptanceViewProps["actions"];
}) {
  return (
    <VStack align="stretch" gap={6}>
      <VStack gap={4} textAlign="center">
        <Circle size="64px" bg="teal.50" color="teal.700">
          <LuBuilding2 size={28} aria-hidden />
        </Circle>
        <Stack gap={2}>
          <Heading as="h1" size={{ base: "lg", md: "xl" }} color="gray.950">
            {state.organizationName}に参加します
          </Heading>
        </Stack>
      </VStack>

      <Stack
        gap={4}
        bg="teal.50"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="xl"
        p={{ base: 4, md: 5 }}
      >
        <Text color="gray.900" fontSize="sm" fontWeight="bold">
          管理者ができること
        </Text>
        <Stack gap={3}>
          <PermissionRow>店舗の管理</PermissionRow>
          <PermissionRow>スタッフの管理</PermissionRow>
          <PermissionRow>シフトの管理</PermissionRow>
          <PermissionRow>シフトリへの支払い設定</PermissionRow>
        </Stack>
      </Stack>

      {state.isSignedIn ? (
        <VStack role="status" gap={3} py={2}>
          <Spinner size="md" color="teal.600" borderWidth="2px" />
          <Text color="gray.700" fontSize="sm" lineHeight="tall" textAlign="center">
            招待内容を確認し、管理者として参加する処理を進めています。
          </Text>
        </VStack>
      ) : (
        <Stack gap={3}>
          <HStack gap={2} color="gray.700">
            <Text fontSize="xs">シフトリに参加するには、アカウント登録が必要です。</Text>
          </HStack>
          <Button variant="outline" colorPalette="teal" size="lg" minH="48px" onClick={actions.onSignup}>
            <LuUserPlus aria-hidden />
            はじめてシフトリを利用する
          </Button>
          <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onLogin}>
            <LuLogIn aria-hidden />
            すでにアカウントを持っている
          </Button>
        </Stack>
      )}
    </VStack>
  );
}

function PermissionRow({ children }: { children: string }) {
  return (
    <HStack align="flex-start" gap={2.5}>
      <Circle size="20px" bg="teal.600" color="white" flexShrink={0} mt="1px">
        <LuCheck size={13} aria-hidden />
      </Circle>
      <Text color="gray.800" fontSize="sm" lineHeight="tall">
        {children}
      </Text>
    </HStack>
  );
}

type StatusContent = {
  title: string;
  description: string;
  icon: IconType;
  iconBg: string;
  iconColor: string;
};

function getStatusContent(
  state: Exclude<
    ManagerInvitationAcceptanceViewState,
    { kind: "loading" } | { kind: "ready" } | { kind: "verificationRequired" }
  >,
): StatusContent {
  switch (state.kind) {
    case "expired":
      return {
        title: "招待リンクの利用期限が切れています",
        description: "担当者に新しい招待URLの発行を依頼してください。",
        icon: LuClock,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "revoked":
      return {
        title: "招待リンクが無効です",
        description: "担当者が招待を取り消した可能性があります。\n担当者に最新の状況を確認してください。",
        icon: LuCircleAlert,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "used":
      return {
        title: "すでに参加済みです",
        description: "シフトリを利用してみましょう。",
        icon: LuCheck,
        iconBg: "green.50",
        iconColor: "green.700",
      };
    case "unavailable":
      return {
        title: "招待URLが現在利用できません",
        description: "組織・店舗の契約状況が変わった可能性があります。\n担当者に確認してください。",
        icon: LuCircleAlert,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "invalid":
      return {
        title: "招待URL無効です",
        description: "招待URLが誤っています。\n担当者に確認してください。",
        icon: LuLink,
        iconBg: "gray.100",
        iconColor: "gray.700",
      };
    case "conflict":
      return {
        title: "本人確認ができませんでした",
        description: "担当者に登録内容の確認を依頼してください。",
        icon: LuRefreshCw,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "retryableError":
      return {
        title: "参加できませんでした",
        description: "通信が一時的に不安定な可能性があります。\n時間をおいて、再度お試しください。",
        icon: LuRefreshCw,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "accepted": {
      const participationLabel = state.organizationName
        ? `${state.organizationName}の管理者として参加しました。`
        : "管理者として参加しました。";
      const description = state.isPreparingDestination
        ? `${participationLabel}\n店舗ページを開いています。`
        : state.hasDestination
          ? `${participationLabel}\n店舗ページへ移動します。`
          : `${participationLabel}\n表示できる店舗がありません。\n案内を送った担当者に、店舗が存在するか確認してください。`;
      return {
        title: "管理者として参加しました",
        description,
        icon: LuCheck,
        iconBg: "green.50",
        iconColor: "green.700",
      };
    }
  }
}
