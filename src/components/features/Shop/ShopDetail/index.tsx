import { Badge, Box, Button, Card, Heading, HStack, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuPencil, LuPlus, LuStore } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { convertRole, convertSubmitFrequency, convertTimeUnit } from "@/src/helpers/domain/convertShopData";

type ShopType = {
  _id: Id<"shops">;
  shopName: string;
  openTime: string;
  closeTime: string;
  timeUnit: number;
  submitFrequency: string;
  useTimeCard: boolean;
  description?: string;
};

type UserType = {
  _id: Id<"users">;
  name: string;
  authId: string;
  role: string;
  createdAt: number;
};

type ShopDetailProps = {
  shop: ShopType;
  users: UserType[];
  userRole: string | null;
};

export const ShopDetail = ({ shop, users, userRole }: ShopDetailProps) => {
  const canEdit = userRole === "owner" || userRole === "manager";

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
          <Heading size="lg">所属スタッフ ({users.length}名)</Heading>
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
          {users.map((user) => (
            <Card.Root
              key={user._id}
              _hover={{ transform: "translateY(-2px)", shadow: "md" }}
              transition="all 0.15s ease"
            >
              <Card.Body>
                <HStack justifyContent="space-between">
                  <Text fontSize={["md", "lg"]} fontWeight="medium">
                    {user.name}
                  </Text>
                  <Badge colorPalette={convertRole.toBadgeColor(user.role)} size="sm">
                    {convertRole.toLabel(user.role)}
                  </Badge>
                </HStack>
              </Card.Body>
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
