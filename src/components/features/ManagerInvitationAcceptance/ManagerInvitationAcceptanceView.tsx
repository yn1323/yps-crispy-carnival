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
  Input,
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
    <Box minH="100dvh" bgGradient="to-b" gradientFrom="gray.100" gradientVia="gray.50" gradientTo="white">
      <Header variant="public" showLinks={false} showLogin={false} showSignup={false} />
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
    return (
      <VStack role="status" aria-label="招待情報を確認中" gap={5} py={{ base: 12, md: 16 }}>
        <Spinner size="xl" color="teal.600" borderWidth="3px" />
        <Stack gap={1} textAlign="center">
          <Heading as="h1" size="lg">
            招待情報を確認しています
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            このまましばらくお待ちください。
          </Text>
        </Stack>
      </VStack>
    );
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
          もう一度試す
        </Button>
      )}

      {state.kind === "used" && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onGoToDashboard}>
          ダッシュボードへ
        </Button>
      )}

      {state.kind === "accepted" && !state.isPreparingDestination && !state.hasDestination && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onGoToDashboard}>
          ダッシュボードへ
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
        <Circle size="64px" bg="gray.100" color="teal.700">
          <LuLink size={28} aria-hidden />
        </Circle>
        <Stack gap={2}>
          <Heading as="h1" size={{ base: "lg", md: "xl" }} color="gray.950">
            招待先の確認が必要
          </Heading>
          <Text color="gray.700" fontSize="sm" lineHeight="tall">
            このアカウントに招待先のメールアドレスを追加して確認します。確認後ログインにも使える場合があります。
          </Text>
        </Stack>
      </VStack>

      {state.step === "input" ? (
        <Stack as="form" gap={5} onSubmit={handleSubmit(({ email }) => actions.onStartVerification(email))}>
          <Alert.Root status="info" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Description>
              招待メールを受け取ったメールアドレスを入力してください。確認コードをその宛先へ送信します。
            </Alert.Description>
          </Alert.Root>
          {state.errorMessage && (
            <Alert.Root status="error" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Description whiteSpace="pre-line">{state.errorMessage}</Alert.Description>
            </Alert.Root>
          )}
          <Field.Root invalid={!!errors.email}>
            <Field.Label>招待先メールアドレス</Field.Label>
            <Input
              type="email"
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              placeholder="example@email.com"
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
          secondaryActions={
            <Stack gap={2}>
              <Button type="button" variant="ghost" disabled={state.isBusy} onClick={actions.onResendCode}>
                確認コードを再送する
              </Button>
              <Button type="button" variant="ghost" disabled={state.isBusy} onClick={actions.onBackToVerificationInput}>
                メールアドレスを入力し直す
              </Button>
            </Stack>
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
        <Circle size="64px" bg="gray.100" color="teal.700">
          <LuBuilding2 size={28} aria-hidden />
        </Circle>
        <Stack gap={2}>
          <Heading as="h1" size={{ base: "lg", md: "xl" }} color="gray.950">
            {state.organizationName}から管理者として招待されています
          </Heading>
          <Text color="gray.700" fontSize="sm" lineHeight="tall">
            ログイン後、必要に応じて招待先メールアドレスの確認を行います。
          </Text>
        </Stack>
      </VStack>

      <Stack
        gap={4}
        bg="gray.50"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="xl"
        p={{ base: 4, md: 5 }}
      >
        <Text color="gray.900" fontSize="sm" fontWeight="bold">
          参加後にできること
        </Text>
        <Stack gap={3}>
          <PermissionRow>グループに所属するすべての店舗の管理</PermissionRow>
          <PermissionRow>プラン、支払い方法などの契約操作</PermissionRow>
        </Stack>
        <HStack gap={2} color="gray.700">
          <LuClock aria-hidden />
          <Text fontSize="xs">有効期限：{state.expiresAtLabel}</Text>
        </HStack>
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
          <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onLogin}>
            <LuLogIn aria-hidden />
            ログインして続ける
          </Button>
          <Button variant="outline" colorPalette="teal" size="lg" minH="48px" onClick={actions.onSignup}>
            <LuUserPlus aria-hidden />
            アカウントを作成する
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
        title: "この招待は期限切れです",
        description: "招待を送った管理者に、新しい招待URLの発行を依頼してください。",
        icon: LuClock,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "revoked":
      return {
        title: "この招待は取り消されています",
        description: "参加が必要な場合は、招待を送った管理者に最新の状況を確認してください。",
        icon: LuCircleAlert,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "used":
      return {
        title: "この招待への参加は完了しています",
        description: "招待を受けたアカウントでログインしている場合は、ダッシュボードから店舗を確認できます。",
        icon: LuCheck,
        iconBg: "green.50",
        iconColor: "green.700",
      };
    case "unavailable":
      return {
        title: "この招待は現在利用できません",
        description: "グループの契約や利用状況が変わった可能性があります。\n招待を送った管理者に確認してください。",
        icon: LuCircleAlert,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "invalid":
      return {
        title: "招待URLを確認できません",
        description: "URLが途中で切れていないか確認し、招待メールに記載された最新のURLを開いてください。",
        icon: LuLink,
        iconBg: "gray.100",
        iconColor: "gray.700",
      };
    case "conflict":
      return {
        title: "招待先の情報を確認できません",
        description: "招待を送った管理者に登録内容を確認してもらってから、もう一度お試しください。",
        icon: LuRefreshCw,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "retryableError":
      return {
        title: "管理者として参加できませんでした",
        description: "通信が一時的に不安定な可能性があります。\n時間をおいて、もう一度お試しください。",
        icon: LuRefreshCw,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "accepted": {
      const participationLabel = state.organizationName
        ? `${state.organizationName}の管理者として参加しました。`
        : "管理者として参加しました。";
      const description = state.isPreparingDestination
        ? `${participationLabel}\n対象店舗を開いています。`
        : state.hasDestination
          ? `${participationLabel}\n対象店舗へ移動します。`
          : `${participationLabel}\n現在、表示できる店舗がありません。\n案内を送った管理者に、店舗の登録状況を確認してください。`;
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
