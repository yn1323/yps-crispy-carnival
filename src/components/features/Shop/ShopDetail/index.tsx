import { Badge, Box, Button, Card, Heading, HStack, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuPencil, LuPlus, LuStore } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { convertRole, convertSubmitFrequency, convertTimeUnit } from "@/src/helpers/domain/convertShopData";

type UserWithRole = {
  _id: Doc<"users">["_id"];
  name: string;
  authId: string;
  role: string;
  createdAt: number;
};

type UserWithRoles = {
  _id: Doc<"users">["_id"];
  name: string;
  authId: string;
  roles: string[];
  createdAt: number;
};

type ShopDetailProps = {
  shop: Doc<"shops">;
  users: UserWithRole[];
  userRole: string | null;
};

export const ShopDetail = ({ shop, users, userRole }: ShopDetailProps) => {
  const canEdit = userRole === "owner" || userRole === "manager";

  // ユーザーごとに全てのロールをまとめる
  const uniqueUsers = users.reduce((acc, user) => {
    const existing = acc.find((u) => u._id === user._id);
    if (!existing) {
      acc.push({
        _id: user._id,
        name: user.name,
        authId: user.authId,
        roles: [user.role],
        createdAt: user.createdAt,
      });
    } else {
      if (!existing.roles.includes(user.role)) {
        existing.roles.push(user.role);
      }
    }
    return acc;
  }, [] as UserWithRoles[]);

  // ロールを優先度順にソート（owner > manager > staff）
  const sortedUsers = uniqueUsers.map((user) => ({
    ...user,
    roles: user.roles.sort((a, b) => {
      const getPriority = (role: string) => {
        if (role === "owner") return 3;
        if (role === "manager") return 2;
        return 1;
      };
      return getPriority(b) - getPriority(a);
    }),
  }));

  return (
    <Stack gap="6" w="full">
      {/* 基本情報カード */}
      <Card.Root>
        <Card.Body>
          <Stack gap="4">
            <HStack justifyContent="space-between" alignItems="flex-start">
              <Heading size="xl">{shop.shopName}</Heading>
              {canEdit && (
                <Button
                  size="sm"
                  colorPalette="teal"
                  onClick={() => {
                    // TODO: 編集画面への遷移
                    console.log("Edit shop:", shop._id);
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
                  営業時間:
                </Text>
                <Text fontSize={["sm", "md"]}>
                  {shop.openTime} - {shop.closeTime}
                </Text>
              </HStack>

              <HStack>
                <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]}>
                  シフト提出頻度:
                </Text>
                <Text fontSize={["sm", "md"]}>{convertSubmitFrequency.toLabel(shop.submitFrequency)}</Text>
              </HStack>

              <HStack>
                <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]}>
                  シフト時間単位:
                </Text>
                <Text fontSize={["sm", "md"]}>{convertTimeUnit.toLabel(shop.timeUnit)}</Text>
              </HStack>

              <HStack>
                <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]}>
                  タイムカード:
                </Text>
                <Badge colorPalette={shop.useTimeCard ? "teal" : "gray"} size="sm">
                  {shop.useTimeCard ? "利用中" : "未利用"}
                </Badge>
              </HStack>

              {shop.description && (
                <Box mt="2">
                  <Text fontWeight="bold" color="fg.muted" fontSize={["sm", "md"]} mb="1">
                    説明:
                  </Text>
                  <Text fontSize={["sm", "md"]} color="fg.muted">
                    {shop.description}
                  </Text>
                </Box>
              )}
            </VStack>
          </Stack>
        </Card.Body>
      </Card.Root>

      {/* スタッフ一覧セクション */}
      <Stack gap="4">
        <HStack justifyContent="space-between" alignItems="center">
          <Heading size="lg">所属スタッフ ({sortedUsers.length}名)</Heading>
          {canEdit && (
            <Button
              size="sm"
              colorPalette="teal"
              onClick={() => {
                // TODO: スタッフ追加画面への遷移
                console.log("Add staff to shop:", shop._id);
              }}
            >
              <LuPlus />
              スタッフ追加
            </Button>
          )}
        </HStack>

        <VStack gap="3" alignItems="stretch">
          {sortedUsers.map((user) => (
            <Card.Root
              key={user._id}
              _hover={{ transform: "translateY(-2px)", shadow: "md" }}
              transition="all 0.15s ease"
            >
              <Link to="/shops/$shopId/members/$userId" params={{ shopId: shop._id, userId: user._id }}>
                <Card.Body>
                  <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={["md", "lg"]} fontWeight="medium">
                      {user.name}
                    </Text>
                    <HStack gap="2">
                      {user.roles.map((role) => (
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
      </Stack>
    </Stack>
  );
};

export const ShopDetailLoading = () => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
      <VStack gap="4">
        <Spinner size="xl" color="teal.500" />
        <Text color="fg.muted">読み込み中...</Text>
      </VStack>
    </Box>
  );
};

export const ShopDetailNotFound = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Box fontSize="6xl" color="fg.muted">
          <LuStore />
        </Box>
        <Heading size="lg" color="fg.muted">
          店舗が見つかりません
        </Heading>
        <Text color="fg.muted">指定された店舗は存在しないか、削除された可能性があります</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};

export const ShopDetailError = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="red.500">
          エラーが発生しました
        </Heading>
        <Text color="fg.muted">店舗情報の取得中にエラーが発生しました</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};
