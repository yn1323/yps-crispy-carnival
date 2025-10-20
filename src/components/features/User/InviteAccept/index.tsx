import { Badge, Box, Button, Card, Heading, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { HiCheckCircle, HiExclamationCircle, HiXCircle } from "react-icons/hi";
import { api } from "@/convex/_generated/api";
import { toaster } from "@/src/components/ui/toaster";

type Props = {
  token: string;
};

export const InviteAccept = ({ token }: Props) => {
  const { userId, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [isActivating, setIsActivating] = useState(false);

  // @ts-expect-error - tempUser APIは新規追加のため型定義が生成されていない
  const validation = useQuery(api.tempUser.validateInviteToken, { token });
  // @ts-expect-error - tempUser APIは新規追加のため型定義が生成されていない
  const activateUser = useMutation(api.tempUser.activateUserByToken);

  // 認証後、自動で本登録を実行
  useEffect(() => {
    const activate = async () => {
      if (isSignedIn && userId && validation?.valid && !isActivating) {
        setIsActivating(true);
        try {
          const result = await activateUser({
            token,
            authId: userId,
          });

          if (result?.success) {
            toaster.create({
              description: "アカウント登録が完了しました",
              type: "success",
            });
            // 店舗詳細ページにリダイレクト
            navigate({ to: `/shops/${result.data.shopId}` });
          }
        } catch (error) {
          toaster.create({
            description: "アカウント登録に失敗しました",
            type: "error",
          });
          setIsActivating(false);
        }
      }
    };

    activate();
  }, [isSignedIn, userId, validation, isActivating, activateUser, token, navigate]);

  // ローディング中
  if (validation === undefined || isActivating) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <VStack gap={4}>
          <Spinner size="xl" />
          <Text>{isActivating ? "アカウントを登録しています..." : "招待を確認しています..."}</Text>
        </VStack>
      </Box>
    );
  }

  // トークン無効
  if (!validation.valid) {
    const errorMessages = {
      TOKEN_NOT_FOUND: "招待が見つかりません。URLが正しいかご確認ください。",
      TOKEN_NOT_ACTIVE: "この招待は既に使用済みまたはキャンセルされています。",
      TOKEN_EXPIRED: "招待の有効期限が切れています。管理者に再送を依頼してください。",
      TEMP_USER_NOT_FOUND: "登録情報が見つかりません。",
      SHOP_NOT_FOUND: "店舗情報が見つかりません。",
      VALIDATION_ERROR: "招待の検証に失敗しました。",
    };

    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" p={4}>
        <Card.Root maxW="2xl" w="full">
          <Card.Body>
            <VStack gap={6}>
              <Box color="red.500">
                <HiXCircle size={64} />
              </Box>
              <Heading size="lg">招待が無効です</Heading>
              <Text textAlign="center" color="fg.muted">
                {errorMessages[validation.reason as keyof typeof errorMessages] || "招待が無効です"}
              </Text>
              <Button onClick={() => navigate({ to: "/" })} colorPalette="teal">
                トップページに戻る
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    );
  }

  // トークン有効 - 認証フロー
  const { data } = validation;

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" p={4}>
      <Card.Root maxW="2xl" w="full">
        <Card.Body>
          <Stack gap={6}>
            {/* 招待情報表示 */}
            <VStack gap={4}>
              <Box color="green.500">
                <HiCheckCircle size={48} />
              </Box>
              <Heading size="lg">店舗への招待</Heading>
              <Card.Root variant="subtle" w="full">
                <Card.Body>
                  <Stack gap={3}>
                    <Box>
                      <Text fontSize="sm" color="fg.muted">
                        店舗名
                      </Text>
                      <Text fontSize="lg" fontWeight="semibold">
                        {data.shopName}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="sm" color="fg.muted">
                        登録名
                      </Text>
                      <Text fontSize="lg" fontWeight="semibold">
                        {data.tempUserName}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="sm" color="fg.muted">
                        役割
                      </Text>
                      <Badge colorPalette={data.role === "manager" ? "purple" : "blue"}>
                        {data.role === "manager" ? "マネージャー" : "スタッフ"}
                      </Badge>
                    </Box>
                  </Stack>
                </Card.Body>
              </Card.Root>

              <Box bg="blue.50" p={4} borderRadius="md" w="full" _dark={{ bg: "blue.900" }}>
                <Stack gap={2}>
                  <Text fontSize="sm" fontWeight="medium" color="blue.700" _dark={{ color: "blue.200" }}>
                    <HiExclamationCircle style={{ display: "inline", marginRight: "4px" }} />
                    アカウント登録が必要です
                  </Text>
                  <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                    {authMode === "signup"
                      ? "新規アカウントを作成してください。既にアカウントをお持ちの方は「ログイン」に切り替えてください。"
                      : "既存のアカウントでログインしてください。アカウントをお持ちでない方は「新規登録」に切り替えてください。"}
                  </Text>
                </Stack>
              </Box>
            </VStack>

            {/* 認証フォーム切り替えボタン */}
            <Stack gap={2}>
              <Button
                variant={authMode === "signup" ? "solid" : "outline"}
                colorPalette="teal"
                onClick={() => setAuthMode("signup")}
                w="full"
              >
                新規登録
              </Button>
              <Button
                variant={authMode === "signin" ? "solid" : "outline"}
                colorPalette="teal"
                onClick={() => setAuthMode("signin")}
                w="full"
              >
                ログイン
              </Button>
            </Stack>

            {/* Clerk認証フォーム */}
            <Box w="full">
              {authMode === "signup" ? (
                <SignUp routing="hash" signInUrl="#" />
              ) : (
                <SignIn routing="hash" signUpUrl="#" />
              )}
            </Box>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
};
