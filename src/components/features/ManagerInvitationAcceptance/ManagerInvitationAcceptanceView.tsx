import { Box, Card, Circle, Container, Heading, HStack, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuBuilding2,
  LuCheck,
  LuCircleAlert,
  LuClock,
  LuLink,
  LuLogIn,
  LuRefreshCw,
  LuUserPlus,
  LuUserX,
} from "react-icons/lu";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

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
  | { kind: "conflict" }
  | { kind: "accountAlreadyRegistered"; organizationName: string | null }
  | { kind: "retryableError"; isRetrying: boolean }
  | {
      kind: "accepted";
      organizationName: string | null;
      isPreparingDestination: boolean;
      hasDestination: boolean;
    };

/** ログイン中のアカウント。ログインしていない場合はnullで、共通の行を表示しない。 */
export type ManagerInvitationAcceptanceAccount = {
  email: string;
  errorMessage: string | null;
  isLoggingOut: boolean;
};

export type ManagerInvitationAcceptanceViewProps = {
  state: ManagerInvitationAcceptanceViewState;
  account: ManagerInvitationAcceptanceAccount | null;
  actions: {
    onAccept: () => void;
    onLogin: () => void;
    onSignup: () => void;
    onLogout: () => void;
    onGoToDashboard: () => void;
  };
};

export function ManagerInvitationAcceptanceView({ state, account, actions }: ManagerInvitationAcceptanceViewProps) {
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
            {account && state.kind !== "accepted" && (
              <SignedInAccountRow account={account} onLogout={actions.onLogout} />
            )}
          </Card.Body>
        </Card.Root>
      </Container>
    </Box>
  );
}

type ContentProps = Pick<ManagerInvitationAcceptanceViewProps, "state" | "actions">;

function InvitationContent({ state, actions }: ContentProps) {
  if (state.kind === "loading") {
    return <ShiftoriLoading variant="section" aria-label="招待情報を確認中" />;
  }

  if (state.kind === "ready") {
    return <ReadyInvitation state={state} actions={actions} />;
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

      {(state.kind === "conflict" || state.kind === "accountAlreadyRegistered") && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onLogout}>
          別のアカウントでログインする
        </Button>
      )}

      {state.kind === "retryableError" && (
        <Button colorPalette="teal" size="lg" minH="48px" loading={state.isRetrying} onClick={actions.onAccept}>
          再実行する
        </Button>
      )}

      {/* 参加済みの招待と、参加したあとに開く店舗がない場合は、自分でシフトリへ進めるようにする。 */}
      {(state.kind === "used" ||
        (state.kind === "accepted" && !state.isPreparingDestination && !state.hasDestination)) && (
        <Button colorPalette="teal" size="lg" minH="48px" onClick={actions.onGoToDashboard}>
          シフトリを確認する
        </Button>
      )}
    </VStack>
  );
}

/**
 * ログイン中のアカウントと、別のアカウントへ切り替えるためのログアウト。
 * 想定していない状態でも行き止まりにしないため、ログイン中のすべての状態に出す。
 */
function SignedInAccountRow({
  account,
  onLogout,
}: {
  account: ManagerInvitationAcceptanceAccount;
  onLogout: () => void;
}) {
  return (
    <Stack gap={2} mt={6} pt={4} borderTopWidth="1px" borderColor="gray.200">
      <HStack justify="space-between" gap={3}>
        <Text color="gray.700" fontSize="xs" lineHeight="tall" minW={0} wordBreak="break-all">
          {account.email ? `${account.email}でログイン中` : "ログイン中"}
        </Text>
        <Button variant="outline" size="sm" flexShrink={0} loading={account.isLoggingOut} onClick={onLogout}>
          ログアウト
        </Button>
      </HStack>
      {account.errorMessage && (
        <Text role="alert" color="red.600" fontSize="xs" lineHeight="tall">
          {account.errorMessage}
        </Text>
      )}
    </Stack>
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
        <Button colorPalette="teal" size="lg" minH="48px" loading={state.isAccepting} onClick={actions.onAccept}>
          参加する
        </Button>
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
  state: Exclude<ManagerInvitationAcceptanceViewState, { kind: "loading" } | { kind: "ready" }>,
): StatusContent {
  switch (state.kind) {
    case "expired":
      return {
        title: "招待リンクの利用期限が切れています",
        description: "担当者に新しい招待リンクの発行を依頼してください。",
        icon: LuClock,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "revoked":
      return {
        title: "この招待リンクは使えなくなりました",
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
        title: "招待リンクが現在利用できません",
        description: "組織・店舗の契約状況が変わった可能性があります。\n担当者に確認してください。",
        icon: LuCircleAlert,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "invalid":
      return {
        title: "招待リンクが正しくありません",
        description: "招待リンクが誤っています。\n担当者に確認してください。",
        icon: LuLink,
        iconBg: "gray.100",
        iconColor: "gray.700",
      };
    case "conflict":
      return {
        title: "このアカウントでは参加できません",
        description:
          "招待された方とは別のアカウントでログインしている可能性があります。\nログインし直しても参加できない場合は、担当者に確認してください。",
        icon: LuUserX,
        iconBg: "orange.50",
        iconColor: "orange.700",
      };
    case "accountAlreadyRegistered":
      return {
        title: "このアカウントでは参加できません",
        description: `このアカウントは、すでに${state.organizationName ?? "この組織"}に登録されています。\n別の方が招待を受ける場合は、その方のアカウントでログインしてください。`,
        icon: LuUserX,
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
