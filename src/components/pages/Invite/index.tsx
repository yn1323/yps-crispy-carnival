import { Box, Button, Card, Center, Heading, Icon, Spinner, Text, VStack } from "@chakra-ui/react";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { LuCircleCheck, LuCircleX, LuClock, LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { toaster } from "@/src/components/ui/toaster";

type InvitePageProps = {
  token: string;
};

const roleLabels: Record<string, string> = {
  owner: "オーナー",
  manager: "マネージャー",
  general: "スタッフ",
};

export const InvitePage = ({ token }: InvitePageProps) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const navigate = useNavigate();

  const invitation = useQuery(api.invite.queries.getByToken, token ? { token } : "skip");
  const acceptInvite = useMutation(api.invite.mutations.accept);

  // トークンがない場合
  if (!token) {
    return (
      <ErrorState
        icon={LuCircleX}
        iconColor="red.500"
        title="無効なリンク"
        description="招待リンクが無効です。正しいリンクを確認してください。"
      />
    );
  }

  // ローディング中
  if (!isLoaded || invitation === undefined) {
    return (
      <Center minH="100vh" bg="gray.50">
        <Spinner size="xl" />
      </Center>
    );
  }

  // 招待が見つからない
  if (invitation === null) {
    return (
      <ErrorState
        icon={LuCircleX}
        iconColor="red.500"
        title="招待が見つかりません"
        description="この招待リンクは存在しないか、既に削除されています。"
      />
    );
  }

  // キャンセル済み
  if (invitation.isDeleted) {
    return (
      <ErrorState
        icon={LuCircleX}
        iconColor="red.500"
        title="招待がキャンセルされました"
        description="この招待は招待者によってキャンセルされました。"
      />
    );
  }

  // 有効期限切れ
  if (invitation.isExpired) {
    return (
      <ErrorState
        icon={LuClock}
        iconColor="orange.500"
        title="招待の有効期限切れ"
        description="この招待リンクは有効期限が切れています。招待者に再送をリクエストしてください。"
      />
    );
  }

  // 既に承認済み
  if (invitation.status === "active") {
    return (
      <SuccessState
        title="既に参加済みです"
        description={`${invitation.shop.shopName}には既に参加しています。`}
        onNavigate={() => navigate({ to: "/shops/$shopId", params: { shopId: invitation.shop.shopId } })}
      />
    );
  }

  const handleAccept = async () => {
    if (!userId) return;

    try {
      const result = await acceptInvite({
        token,
        authId: userId,
      });

      if (result.success) {
        toaster.success({
          title: `${result.data.shopName}に参加しました`,
        });
        navigate({ to: "/shops/$shopId", params: { shopId: result.data.shopId } });
      }
    } catch (error) {
      toaster.error({
        title: "参加に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Card.Root maxW="md" w="full" shadow="lg">
        <Card.Body>
          <VStack gap={6} align="stretch">
            <Center>
              <Box bg="teal.100" p={4} borderRadius="full">
                <Icon as={LuStore} boxSize={8} color="teal.600" />
              </Box>
            </Center>

            <VStack gap={2}>
              <Heading size="lg" textAlign="center">
                店舗への招待
              </Heading>
              <Text color="gray.600" textAlign="center">
                {invitation.shop.shopName}へ招待されています
              </Text>
            </VStack>

            <Box bg="gray.50" p={4} borderRadius="md">
              <VStack gap={2} align="stretch">
                <Box>
                  <Text fontSize="sm" color="gray.500">
                    あなたの名前
                  </Text>
                  <Text fontWeight="medium">{invitation.displayName}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">
                    ロール
                  </Text>
                  <Text fontWeight="medium">{roleLabels[invitation.role ?? "general"] ?? "スタッフ"}</Text>
                </Box>
              </VStack>
            </Box>

            {isSignedIn ? (
              <Button colorPalette="teal" size="lg" onClick={handleAccept}>
                この店舗に参加する
              </Button>
            ) : (
              <VStack gap={3}>
                <Text fontSize="sm" color="gray.600" textAlign="center">
                  参加するにはログインが必要です
                </Text>
                <SignInButton forceRedirectUrl={`/invite?token=${token}`}>
                  <Button colorPalette="teal" size="lg" w="full">
                    ログインして参加する
                  </Button>
                </SignInButton>
              </VStack>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
};

// エラー状態コンポーネント
type ErrorStateProps = {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
};

const ErrorState = ({ icon, iconColor, title, description }: ErrorStateProps) => {
  const navigate = useNavigate();

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Card.Root maxW="md" w="full" shadow="lg">
        <Card.Body>
          <VStack gap={6} align="stretch">
            <Center>
              <Box bg="gray.100" p={4} borderRadius="full">
                <Icon as={icon} boxSize={8} color={iconColor} />
              </Box>
            </Center>

            <VStack gap={2}>
              <Heading size="lg" textAlign="center">
                {title}
              </Heading>
              <Text color="gray.600" textAlign="center">
                {description}
              </Text>
            </VStack>

            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              トップページへ
            </Button>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
};

// 成功状態コンポーネント
type SuccessStateProps = {
  title: string;
  description: string;
  onNavigate: () => void;
};

const SuccessState = ({ title, description, onNavigate }: SuccessStateProps) => {
  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Card.Root maxW="md" w="full" shadow="lg">
        <Card.Body>
          <VStack gap={6} align="stretch">
            <Center>
              <Box bg="green.100" p={4} borderRadius="full">
                <Icon as={LuCircleCheck} boxSize={8} color="green.600" />
              </Box>
            </Center>

            <VStack gap={2}>
              <Heading size="lg" textAlign="center">
                {title}
              </Heading>
              <Text color="gray.600" textAlign="center">
                {description}
              </Text>
            </VStack>

            <Button colorPalette="teal" onClick={onNavigate}>
              店舗ページへ
            </Button>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
};
