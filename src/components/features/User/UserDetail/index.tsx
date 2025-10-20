import { Badge, Box, Button, Card, Heading, HStack, Spacer, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LuCalendar, LuMail, LuPencil, LuStore, LuUser } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { convertRole } from "@/src/helpers/domain/convertShopData";

type ShopWithRole = Doc<"shops"> & {
  role: string;
};

type UserDetailProps = {
  user: Doc<"users">;
  shops: ShopWithRole[];
  currentShopRole: string | null;
  currentShopId: string;
};

export const UserDetail = ({ user, shops, currentShopRole, currentShopId }: UserDetailProps) => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const canEdit = currentShopRole === "owner" || currentShopRole === "manager";
  const [isResending, setIsResending] = useState(false);

  // ユーザーステータス取得（仮ユーザーかどうか判定）
  // @ts-expect-error - tempUser APIは新規追加のため型定義が生成されていない
  const userStatus = useQuery(api.tempUser.getUserStatus, { userId: user._id });
  // @ts-expect-error - tempUser APIは新規追加のため型定義が生成されていない
  const resendInvite = useMutation(api.tempUser.resendInvite);

  const isTempUser = userStatus?.isTempUser ?? false;
  const inviteToken = userStatus?.inviteToken;

  const handleResendInvite = async () => {
    if (!inviteToken) return;

    setIsResending(true);
    try {
      // メールアドレス入力をプロンプトで取得（簡易版）
      const email = window.prompt("招待メールを送信するメールアドレスを入力してください");
      if (!email) {
        setIsResending(false);
        return;
      }

      const result = await resendInvite({
        tempUserId: user._id,
        authId: userId ?? "",
        email,
      });

      if (result?.success) {
        toaster.create({
          description: "招待メールを再送しました",
          type: "success",
        });
      }
    } catch {
      toaster.create({
        description: "招待メールの再送に失敗しました",
        type: "error",
      });
    } finally {
      setIsResending(false);
    }
  };

  // 同じ店舗の複数ロールをまとめる
  const uniqueShops = shops.reduce(
    (acc, shop) => {
      const existing = acc.find((s) => s._id === shop._id);
      if (!existing) {
        acc.push({
          ...shop,
          roles: [shop.role],
        });
      } else {
        if (!existing.roles.includes(shop.role)) {
          existing.roles.push(shop.role);
        }
      }
      return acc;
    },
    [] as (Doc<"shops"> & { roles: string[] })[],
  );

  // ロールを優先度順にソート（owner > manager > staff）
  const sortedShops = uniqueShops.map((shop) => ({
    ...shop,
    roles: shop.roles.sort((a, b) => {
      const getPriority = (role: string) => {
        if (role === "owner") return 3;
        if (role === "manager") return 2;
        return 1;
      };
      return getPriority(b) - getPriority(a);
    }),
  }));

  // 現在の店舗でのロールを取得
  const currentShop = sortedShops.find((shop) => shop._id === currentShopId);
  const rolesInCurrentShop = currentShop?.roles ?? [];

  return (
    <Stack gap="6" w="full">
      {/* 基本情報カード */}
      <Card.Root>
        <Card.Body>
          <Stack gap="4">
            <HStack justifyContent="space-between" alignItems="center">
              <Box color="teal.500" fontSize="xl">
                <LuUser />
              </Box>
              <VStack alignItems="flex-start" gap="1">
                <HStack gap="2">
                  <Heading size="xl">{user.name}</Heading>
                  {isTempUser && (
                    <Badge colorPalette="orange" size="sm">
                      未登録
                    </Badge>
                  )}
                </HStack>
              </VStack>
              <Spacer />
              {canEdit && (
                <Button
                  size="sm"
                  colorPalette="teal"
                  onClick={() => {
                    navigate({
                      to: "/shops/$shopId/members/$userId/edit",
                      params: { shopId: currentShopId, userId: user._id },
                    });
                  }}
                >
                  <LuPencil />
                  編集
                </Button>
              )}
            </HStack>

            <VStack alignItems="flex-start" gap="2">
              <HStack>
                <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]}>
                  この店舗での役割:
                </Text>
                {rolesInCurrentShop.length > 0 ? (
                  <HStack gap="2">
                    {rolesInCurrentShop.map((role) => (
                      <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm">
                        {convertRole.toLabel(role)}
                      </Badge>
                    ))}
                  </HStack>
                ) : (
                  <Text fontSize={["sm", "md"]} color="fg.muted">
                    未所属
                  </Text>
                )}
              </HStack>

              <HStack>
                <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]}>
                  登録日:
                </Text>
                <Text fontSize={["sm", "md"]}>{new Date(user.createdAt).toLocaleDateString("ja-JP")}</Text>
              </HStack>
            </VStack>
          </Stack>
        </Card.Body>
      </Card.Root>

      {/* 仮ユーザーの招待ステータス */}
      {isTempUser && inviteToken && (
        <Card.Root bg="orange.50" borderLeft="4px solid" borderColor="orange.400" _dark={{ bg: "orange.900" }}>
          <Card.Body>
            <Stack gap="4">
              <Heading size="md" color="orange.700" _dark={{ color: "orange.200" }}>
                招待ステータス
              </Heading>
              <Text fontSize="sm" color="orange.600" _dark={{ color: "orange.300" }}>
                このユーザーは仮登録状態です。招待URLからアカウント登録が完了すると、ログインできるようになります。
              </Text>
              <Stack gap="2">
                <HStack>
                  <LuCalendar />
                  <Text fontSize="sm" fontWeight="medium">
                    招待送信日:
                  </Text>
                  <Text fontSize="sm">{new Date(inviteToken.createdAt).toLocaleDateString("ja-JP")}</Text>
                </HStack>
                <HStack>
                  <LuCalendar />
                  <Text fontSize="sm" fontWeight="medium">
                    有効期限:
                  </Text>
                  <Text fontSize="sm">{new Date(inviteToken.expiresAt).toLocaleDateString("ja-JP")}</Text>
                </HStack>
              </Stack>
              {canEdit && (
                <Button
                  size="sm"
                  colorPalette="orange"
                  onClick={handleResendInvite}
                  loading={isResending}
                  w={{ base: "full", lg: "auto" }}
                >
                  <LuMail />
                  招待を再送
                </Button>
              )}
            </Stack>
          </Card.Body>
        </Card.Root>
      )}

      {/* 所属店舗一覧セクション */}
      <Stack gap="4">
        <HStack justifyContent="space-between" alignItems="center">
          <Heading size="lg">所属店舗 ({sortedShops.length}店舗)</Heading>
        </HStack>

        {sortedShops.length > 0 ? (
          <VStack gap="3" alignItems="stretch">
            {sortedShops.map((shop) => (
              <Card.Root
                key={shop._id}
                _hover={{ transform: "translateY(-2px)", shadow: "md" }}
                transition="all 0.15s ease"
              >
                <Link to="/shops/$shopId" params={{ shopId: shop._id }}>
                  <Card.Body>
                    <HStack justifyContent="space-between" alignItems="center">
                      <HStack gap="3">
                        <Box color="teal.500" fontSize="xl">
                          <LuStore />
                        </Box>
                        <Text fontSize={["md", "lg"]} fontWeight="medium">
                          {shop.shopName}
                        </Text>
                      </HStack>
                      <HStack gap="2">
                        {shop.roles.map((role) => (
                          <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm">
                            {convertRole.toLabel(role)}
                          </Badge>
                        ))}
                      </HStack>
                    </HStack>
                  </Card.Body>
                </Link>
              </Card.Root>
            ))}
          </VStack>
        ) : (
          <Box textAlign="center" py="10">
            <Text color="fg.muted">所属店舗がありません</Text>
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

export const UserDetailLoading = () => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
      <VStack gap="4">
        <Spinner size="xl" color="teal.500" />
        <Text color="fg.muted">読み込み中...</Text>
      </VStack>
    </Box>
  );
};

export const UserDetailNotFound = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Box fontSize="6xl" color="fg.muted">
          <LuUser />
        </Box>
        <Heading size="lg" color="fg.muted">
          ユーザーが見つかりません
        </Heading>
        <Text color="fg.muted">指定されたユーザーは存在しないか、削除された可能性があります</Text>
      </Stack>
    </Box>
  );
};
