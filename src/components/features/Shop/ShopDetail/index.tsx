import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Separator,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LuArrowLeft,
  LuCalendar,
  LuChevronRight,
  LuClock,
  LuCreditCard,
  LuMapPin,
  LuPencil,
  LuPlus,
  LuSearch,
  LuStore,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { convertRole, convertSubmitFrequency } from "@/src/helpers/domain/convertShopData";

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
  const navigate = useNavigate();
  const canEdit = userRole === "owner" || userRole === "manager";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [roleFilter, setRoleFilter] = useState("all");

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

  // 検索とフィルタリング機能
  const filteredUsers = sortedUsers.filter((user) => {
    // 名前検索
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase());

    // 役割フィルター
    const matchesRole =
      roleFilter === "all" ||
      user.roles.some((role) => {
        if (roleFilter === "オーナー") return role === "owner";
        if (roleFilter === "マネージャー") return role === "manager";
        if (roleFilter === "スタッフ") return role === "staff";
        return false;
      });

    // ステータスフィルター（現状は全員activeなので、後で実装）
    const matchesStatus = statusFilter === "all" || statusFilter === "active";

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      {/* ヘッダー */}
      <Box mb={{ base: 4, md: 6 }}>
        <Link to="/shops">
          <Button
            variant="ghost"
            mb={{ base: 3, md: 4 }}
            ml={-2}
            color="gray.600"
            _hover={{ color: "gray.900" }}
            gap={2}
          >
            <LuArrowLeft size={16} />
            店舗一覧に戻る
          </Button>
        </Link>

        <Flex align="center" justify="space-between">
          <Flex align="center" gap={3}>
            <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
              <LuStore size={24} color="var(--chakra-colors-teal-600)" />
            </Flex>
            <Heading as="h2" size="xl" color="gray.900">
              {shop.shopName}
            </Heading>
          </Flex>
          {canEdit && (
            <Button
              onClick={() => {
                navigate({ to: "/shops/$shopId/edit", params: { shopId: shop._id } });
              }}
              colorPalette="teal"
              gap={2}
            >
              <LuPencil size={16} />
              <Text display={{ base: "none", md: "inline" }}>編集</Text>
            </Button>
          )}
        </Flex>
      </Box>

      {/* タブ */}
      <Tabs.Root defaultValue="info" w="full" variant="enclosed">
        <Tabs.List mb={{ base: 4, md: 6 }}>
          <Tabs.Trigger value="info" gap={2}>
            <LuStore size={16} />
            店舗情報
          </Tabs.Trigger>
          <Tabs.Trigger value="staff" gap={2}>
            <LuUsers size={16} />
            スタッフ ({sortedUsers.length}名)
          </Tabs.Trigger>
        </Tabs.List>

        {/* 店舗情報タブ */}
        <Tabs.Content value="info">
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={{ base: 4, md: 6 }}>
              {/* 住所（固定値） */}
              <Flex align="center" gap={2} mb={4} pb={4} borderBottom="1px" borderColor="gray.100">
                <LuMapPin size={20} color="var(--chakra-colors-gray-500)" />
                <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                  東京都新宿区西新宿1-1-1
                </Text>
              </Flex>

              {/* 詳細情報グリッド */}
              <Box>
                {/* 営業時間 */}
                <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                  <LuClock size={20} color="var(--chakra-colors-gray-500)" />
                  <Box flex={1}>
                    <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                      営業時間
                    </Text>
                    <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                      {shop.openTime} - {shop.closeTime}
                    </Text>
                  </Box>
                </Flex>

                {/* シフト提出期限 */}
                <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                  <LuCalendar size={20} color="var(--chakra-colors-gray-500)" />
                  <Box flex={1}>
                    <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                      シフト提出期限
                    </Text>
                    <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                      {convertSubmitFrequency.toLabel(shop.submitFrequency)}
                    </Text>
                  </Box>
                </Flex>

                {/* シフト閉鎖時間（固定値） */}
                <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                  <LuClock size={20} color="var(--chakra-colors-gray-500)" />
                  <Box flex={1}>
                    <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                      シフト閉鎖時間
                    </Text>
                    <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                      30分
                    </Text>
                  </Box>
                </Flex>

                {/* タイムカード */}
                <Flex align="flex-start" gap={3}>
                  <LuCreditCard size={20} color="var(--chakra-colors-gray-500)" />
                  <Box flex={1}>
                    <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={1}>
                      タイムカード
                    </Text>
                    <Badge
                      variant="outline"
                      fontSize="xs"
                      borderColor={shop.useTimeCard ? "teal.300" : "gray.300"}
                      color={shop.useTimeCard ? "teal.700" : "gray.600"}
                      bg={shop.useTimeCard ? "teal.50" : "transparent"}
                    >
                      {shop.useTimeCard ? "利用中" : "未利用"}
                    </Badge>
                  </Box>
                </Flex>
              </Box>

              {/* 説明 */}
              {shop.description && (
                <>
                  <Separator my={4} />
                  <Box>
                    <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={2}>
                      説明
                    </Text>
                    <Text fontSize={{ base: "sm", md: "base" }} color="gray.700" lineHeight="relaxed">
                      {shop.description}
                    </Text>
                  </Box>
                </>
              )}
            </Card.Body>
          </Card.Root>
        </Tabs.Content>

        {/* スタッフタブ */}
        <Tabs.Content value="staff">
          {/* 検索とフィルター */}
          <Box mb={4}>
            <Flex direction={{ base: "column", md: "row" }} gap={3} mb={3}>
              {/* 検索バー */}
              <Box position="relative" flex={1}>
                <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" pointerEvents="none">
                  <LuSearch size={16} color="var(--chakra-colors-gray-400)" />
                </Box>
                <Input
                  type="text"
                  placeholder="名前で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  pl={10}
                />
              </Box>

              {/* ステータスフィルター */}
              <NativeSelectRoot w={{ base: "full", md: "180px" }}>
                <NativeSelectField value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="active">在籍中</option>
                  <option value="resigned">退職済み</option>
                  <option value="all">全員</option>
                </NativeSelectField>
              </NativeSelectRoot>

              {/* 役割フィルター */}
              <NativeSelectRoot w={{ base: "full", md: "180px" }}>
                <NativeSelectField value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">全役割</option>
                  <option value="オーナー">オーナー</option>
                  <option value="マネージャー">マネージャー</option>
                  <option value="スタッフ">スタッフ</option>
                </NativeSelectField>
              </NativeSelectRoot>
            </Flex>

            {/* スタッフ招待ボタン */}
            {canEdit && (
              <Button
                w={{ base: "full", md: "auto" }}
                colorPalette="teal"
                gap={2}
                onClick={() => {
                  // TODO: スタッフ追加画面への遷移
                  console.log("Add staff to shop:", shop._id);
                }}
              >
                <LuPlus size={16} />
                スタッフを招待
              </Button>
            )}
          </Box>

          {/* フィルター結果表示 */}
          {filteredUsers.length > 0 ? (
            <>
              <Text fontSize="sm" color="gray.600" mb={3}>
                {filteredUsers.length}名のスタッフ
              </Text>
              <Box>
                {filteredUsers.map((user) => (
                  <Link
                    key={user._id}
                    to="/shops/$shopId/members/$userId"
                    params={{ shopId: shop._id, userId: user._id }}
                  >
                    <Card.Root
                      mb={{ base: 2, md: 3 }}
                      borderWidth={0}
                      shadow="sm"
                      _hover={{ shadow: "md" }}
                      transition="all 0.15s"
                      cursor="pointer"
                    >
                      <Card.Body p={{ base: 3, md: 4 }}>
                        <Flex align="center" justify="space-between" gap={4}>
                          <Flex align="center" gap={3} flex={1} minW={0}>
                            {/* アバター */}
                            <Flex
                              w={{ base: 10, md: 12 }}
                              h={{ base: 10, md: 12 }}
                              borderRadius="full"
                              bgGradient="to-br"
                              gradientFrom="teal.400"
                              gradientTo="teal.600"
                              align="center"
                              justify="center"
                              color="white"
                              flexShrink={0}
                            >
                              <LuUser size={24} />
                            </Flex>

                            {/* スタッフ情報 */}
                            <Box flex={1} minW={0}>
                              <Flex align="center" gap={2}>
                                <Text fontSize={{ base: "sm", md: "base" }} color="gray.900" truncate>
                                  {user.name}
                                </Text>
                                {/* 役割バッジ */}
                                {user.roles.map((role) => (
                                  <Badge
                                    key={role}
                                    colorPalette={convertRole.toBadgeColor(role)}
                                    size="sm"
                                    flexShrink={0}
                                  >
                                    {convertRole.toLabel(role)}
                                  </Badge>
                                ))}
                              </Flex>
                            </Box>
                          </Flex>

                          {/* 矢印アイコン */}
                          <LuChevronRight size={20} color="var(--chakra-colors-gray-400)" />
                        </Flex>
                      </Card.Body>
                    </Card.Root>
                  </Link>
                ))}
              </Box>
            </>
          ) : (
            <Card.Root borderWidth={0} shadow="sm">
              <Card.Body p={8} textAlign="center">
                <Box display="flex" justifyContent="center" mb={3}>
                  <LuUsers size={48} color="var(--chakra-colors-gray-300)" />
                </Box>
                <Text color="gray.500">該当するスタッフが見つかりませんでした</Text>
                <Text fontSize="sm" color="gray.400" mt={1}>
                  検索条件を変更してください
                </Text>
              </Card.Body>
            </Card.Root>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </Container>
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
