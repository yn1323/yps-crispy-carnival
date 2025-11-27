import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Icon,
  Spinner,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { SignInButton } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuCheck, LuCircleAlert, LuLogIn, LuStore, LuUserPlus } from "react-icons/lu";
import { toaster } from "@/src/components/ui/toaster";
import { convertRole } from "@/src/helpers/domain/convertShopData";

// 招待情報の型
export type InvitationData = {
  shopName: string;
  displayName: string;
  role: string;
  invitedByName?: string;
  isExpired?: boolean;
  isCancelled?: boolean;
  isAccepted?: boolean;
};

// ローディング表示
export const Loading = () => (
  <Container maxW="lg" py={10}>
    <Flex justify="center" align="center" minH="300px">
      <VStack gap={4}>
        <Spinner size="xl" color="teal.500" />
        <Text color="gray.600">招待情報を読み込み中...</Text>
      </VStack>
    </Flex>
  </Container>
);

// エラー表示
type ErrorViewProps = {
  title: string;
  message: string;
  subMessage?: string;
  iconColor?: string;
};

export const ErrorView = ({ title, message, subMessage, iconColor = "red.400" }: ErrorViewProps) => (
  <Container maxW="lg" py={10}>
    <Card.Root>
      <Card.Body p={8} textAlign="center">
        <Icon as={LuCircleAlert} boxSize={16} color={iconColor} mx="auto" mb={4} />
        <Heading size="lg" color="gray.900" mb={2}>
          {title}
        </Heading>
        <Text color="gray.600">{message}</Text>
        {subMessage && (
          <Text color="gray.500" fontSize="sm" mt={2}>
            {subMessage}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  </Container>
);

// 既に参加済み
export const AlreadyAccepted = () => (
  <Container maxW="lg" py={10}>
    <Card.Root>
      <Card.Body p={8} textAlign="center">
        <Icon as={LuCheck} boxSize={16} color="green.400" mx="auto" mb={4} />
        <Heading size="lg" color="gray.900" mb={2}>
          既に参加済みです
        </Heading>
        <Text color="gray.600">この招待は既に承認されています。</Text>
      </Card.Body>
    </Card.Root>
  </Container>
);

// 承認完了
type AcceptedProps = {
  shopId: string;
  shopName: string;
};

export const Accepted = ({ shopId, shopName }: AcceptedProps) => (
  <Container maxW="lg" py={10}>
    <Card.Root>
      <Card.Body p={8} textAlign="center">
        <Icon as={LuCheck} boxSize={16} color="green.400" mx="auto" mb={4} />
        <Heading size="lg" color="gray.900" mb={2}>
          参加しました！
        </Heading>
        <Text color="gray.600" mb={6}>
          「{shopName}」に参加しました。
        </Text>
        <Link to="/shops/$shopId" params={{ shopId }}>
          <Button colorPalette="teal" size="lg" gap={2}>
            <Icon as={LuStore} boxSize={5} />
            店舗ページへ移動
          </Button>
        </Link>
      </Card.Body>
    </Card.Root>
  </Container>
);

// ログインが必要
export const RequireLogin = () => (
  <Container maxW="lg" py={10}>
    <Card.Root>
      <Card.Body p={{ base: 6, md: 8 }}>
        <InvitationHeader showSubText={false} />
        <Stack gap={3}>
          <Text fontSize="sm" color="gray.600" textAlign="center">
            参加するにはログインが必要です
          </Text>
          <SignInButton mode="modal">
            <Button colorPalette="teal" size="lg" w="full" gap={2}>
              <Icon as={LuLogIn} boxSize={5} />
              ログインして参加する
            </Button>
          </SignInButton>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            <Link to="/" target="_blank">
              はじめての方はこちら
            </Link>
          </Text>
        </Stack>
      </Card.Body>
    </Card.Root>
  </Container>
);

// ログイン済み
type LoggedInProps = {
  invitation: InvitationData;
  token: string;
  userId: string;
  acceptInvitation: (args: { token: string; authId: string }) => Promise<{
    success: boolean;
    data: { shopId: string; shopName: string };
  }>;
  onAccepted: (shop: { id: string; name: string }) => void;
};

export const LoggedIn = ({ invitation, token, userId, acceptInvitation, onAccepted }: LoggedInProps) => {
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async () => {
    if (!userId) return;

    setIsAccepting(true);

    try {
      const result = await acceptInvitation({
        token,
        authId: userId,
      });

      if (result.success) {
        onAccepted({ id: result.data.shopId, name: result.data.shopName });
        toaster.create({
          description: "店舗に参加しました",
          type: "success",
        });
      }
    } catch (e) {
      toaster.create({
        description: e instanceof Error ? e.message : "参加処理に失敗しました",
        type: "error",
      });
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <Container maxW="lg" py={10}>
      <Card.Root>
        <Card.Body p={{ base: 6, md: 8 }}>
          <InvitationHeader />
          <InvitationInfo invitation={invitation} />

          <Button onClick={handleAccept} colorPalette="teal" size="lg" w="full" gap={2} loading={isAccepting}>
            <Icon as={LuCheck} boxSize={5} />
            この店舗に参加する
          </Button>
        </Card.Body>
      </Card.Root>
    </Container>
  );
};

// 招待ヘッダー（共通）
type InvitationHeaderProps = {
  showSubText?: boolean;
};

const InvitationHeader = ({ showSubText = true }: InvitationHeaderProps) => (
  <Flex align="center" gap={3} mb={6}>
    <Flex p={3} bg="teal.50" borderRadius="full">
      <Icon as={LuUserPlus} boxSize={6} color="teal.600" />
    </Flex>
    <Box>
      <Heading size="lg" color="gray.900">
        店舗への招待
      </Heading>
      {showSubText && (
        <Text fontSize="sm" color="gray.600">
          以下の店舗に招待されています
        </Text>
      )}
    </Box>
  </Flex>
);

// 招待情報（共通）
type InvitationInfoProps = {
  invitation: InvitationData;
};

const InvitationInfo = ({ invitation }: InvitationInfoProps) => (
  <Stack gap={4} mb={6}>
    {/* 店舗名 */}
    <Box p={4} bg="gray.50" borderRadius="md">
      <Flex align="center" gap={3}>
        <Icon as={LuStore} boxSize={5} color="gray.600" />
        <Box>
          <Text fontSize="xs" color="gray.500">
            店舗名
          </Text>
          <Text fontWeight="medium" color="gray.900">
            {invitation.shopName}
          </Text>
        </Box>
      </Flex>
    </Box>

    {/* 役割 */}
    <Box p={4} bg="gray.50" borderRadius="md">
      <Flex align="center" justify="space-between">
        <Box>
          <Text fontSize="xs" color="gray.500">
            役割
          </Text>
          <Badge colorPalette={convertRole.toBadgeColor(invitation.role)} mt={1}>
            {convertRole.toLabel(invitation.role)}
          </Badge>
        </Box>
      </Flex>
    </Box>
  </Stack>
);
