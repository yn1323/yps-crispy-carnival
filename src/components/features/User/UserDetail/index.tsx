import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LuCalendar, LuClock, LuPencil, LuStore, LuTrendingUp, LuUser, LuUsers } from "react-icons/lu";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Title } from "@/src/components/ui/Title";
import { convertRole } from "@/src/helpers/domain/convertShopData";
import { AttendanceTab } from "./TabContents/AttendanceTab";
import { InfoTab } from "./TabContents/InfoTab";
import { ShiftsTab } from "./TabContents/ShiftsTab";

type ShopWithRole = Doc<"shops"> & {
  role: string;
};

// 制限ビュー用の型
type LimitedUser = {
  _id: Id<"users">;
  name: string;
  role: string | null;
  isLimitedView: true;
};

// 全情報ユーザーの型
type FullUser = Doc<"users">;

type UserDetailProps = {
  user: FullUser | LimitedUser;
  shops: ShopWithRole[];
  currentShopRole: string | null;
  currentShopId: string;
  currentUserId: Id<"users"> | null;
};

// isLimitedViewフラグの判定ヘルパー
const isLimitedView = (user: FullUser | LimitedUser): user is LimitedUser => {
  return "isLimitedView" in user && user.isLimitedView === true;
};

export const UserDetailTabTypes = ["info", "shifts", "attendance"] as const;

export const UserDetail = ({ user, shops, currentShopRole, currentShopId, currentUserId }: UserDetailProps) => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const currentTab = search.tab || "info";
  const fromTab = search.fromTab;

  // 制限ビューかどうかを判定
  const limitedView = isLimitedView(user);

  // 対象ユーザーのこの店舗での役割を取得
  const targetUserRole = limitedView ? user.role : (shops.find((shop) => shop._id === currentShopId)?.role ?? null);

  // 編集権限の判定（制限ビューの場合は編集不可）
  // - オーナー: 全員編集可能
  // - マネージャー: 全員編集可能、ただしオーナーは編集不可
  // - 一般ユーザー: 自分のものだけ編集可能
  const canEdit = (() => {
    if (limitedView) return false;
    if (currentShopRole === "owner") return true;
    if (currentShopRole === "manager") return targetUserRole !== "owner";
    if (currentShopRole === "general") return currentUserId === user._id;
    return false;
  })();

  const handleTabChange = (value: string) => {
    navigate({
      to: "/shops/$shopId/staffs/$userId",
      params: { shopId: currentShopId, userId: user._id },
      search: { tab: value as (typeof UserDetailTabTypes)[number] },
      replace: true,
    });
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
  const rolesInCurrentShop = limitedView ? (user.role ? [user.role] : []) : (currentShop?.roles ?? []);

  // アバターのイニシャル生成
  const getInitials = (name: string) => {
    return name
      .split("")
      .slice(0, 2)
      .map((char) => char.toUpperCase())
      .join("");
  };

  // 固定値の統計データ
  const stats = {
    monthlyWorkDays: 18,
    shiftParticipationRate: 95,
    totalWorkHours: 144,
  };

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: `/shops/${currentShopId}${fromTab ? `?tab=${fromTab}` : ""}`, label: "店舗詳細に戻る" }}
        action={
          canEdit ? (
            <Button
              onClick={() => {
                navigate({
                  to: "/shops/$shopId/staffs/$userId/edit",
                  params: { shopId: currentShopId, userId: user._id },
                });
              }}
              colorPalette="teal"
              gap={2}
            >
              <Icon as={LuPencil} boxSize={4} />
              編集
            </Button>
          ) : undefined
        }
      >
        <Flex align="center" gap={4}>
          {/* アバター */}
          <Flex
            w={{ base: 16, md: 20 }}
            h={{ base: 16, md: 20 }}
            borderRadius="full"
            bgGradient="to-br"
            gradientFrom="teal.400"
            gradientTo="teal.600"
            align="center"
            justify="center"
            color="white"
            flexShrink={0}
          >
            <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold">
              {getInitials(user.name)}
            </Text>
          </Flex>

          <Box>
            <Heading as="h2" size="xl" color="gray.900" mb={2}>
              {user.name}
            </Heading>
            {!limitedView && (
              <Flex align="center" gap={2} fontSize="sm" color="gray.600">
                <Icon as={LuCalendar} boxSize={4} />
                <Text>登録日: {new Date(user.createdAt).toLocaleDateString("ja-JP")}</Text>
              </Flex>
            )}
          </Box>
        </Flex>
      </Title>

      {/* この店舗での役割カード */}
      <Box mb={{ base: 4, md: 6 }}>
        <Card.Root borderWidth={0} shadow="sm">
          <Card.Body p={{ base: 4, md: 6 }}>
            <Flex align="center" justify="space-between">
              <Flex align="center" gap={3}>
                <Flex p={2} bg="purple.50" borderRadius="lg">
                  <Icon as={LuUsers} boxSize={5} color="purple.600" />
                </Flex>
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={1}>
                    この店舗での役割
                  </Text>
                  {rolesInCurrentShop.length > 0 ? (
                    <Flex gap={2}>
                      {rolesInCurrentShop.map((role) => (
                        <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm">
                          {convertRole.toLabel(role)}
                        </Badge>
                      ))}
                    </Flex>
                  ) : (
                    <Text fontSize="sm" color="gray.500">
                      未所属
                    </Text>
                  )}
                </Box>
              </Flex>
            </Flex>
          </Card.Body>
        </Card.Root>
      </Box>

      {/* 制限ビューの場合は詳細情報を表示しない */}
      {!limitedView && (
        <>
          {/* 今月の概要 */}
          <Box mb={{ base: 4, md: 6 }}>
            <Heading as="h3" size="lg" color="gray.900" mb={3}>
              今月の概要
            </Heading>
            <Grid gridTemplateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
              {/* 勤務日数 */}
              <Card.Root borderWidth={0} shadow="sm">
                <Card.Body p={4}>
                  <Flex align="center" gap={3}>
                    <Flex p={2} bg="teal.50" borderRadius="lg">
                      <Icon as={LuCalendar} boxSize={5} color="teal.600" />
                    </Flex>
                    <Box>
                      <Text fontSize="xs" color="gray.600" mb={1}>
                        勤務日数
                      </Text>
                      <Text color="gray.900" fontWeight="medium">
                        {stats.monthlyWorkDays}日
                      </Text>
                    </Box>
                  </Flex>
                </Card.Body>
              </Card.Root>

              {/* シフト参加率 */}
              <Card.Root borderWidth={0} shadow="sm">
                <Card.Body p={4}>
                  <Flex align="center" gap={3}>
                    <Flex p={2} bg="orange.50" borderRadius="lg">
                      <Icon as={LuTrendingUp} boxSize={5} color="orange.600" />
                    </Flex>
                    <Box>
                      <Text fontSize="xs" color="gray.600" mb={1}>
                        シフト参加率
                      </Text>
                      <Text color="gray.900" fontWeight="medium">
                        {stats.shiftParticipationRate}%
                      </Text>
                    </Box>
                  </Flex>
                </Card.Body>
              </Card.Root>

              {/* 総勤務時間 */}
              <Card.Root borderWidth={0} shadow="sm">
                <Card.Body p={4}>
                  <Flex align="center" gap={3}>
                    <Flex p={2} bg="blue.50" borderRadius="lg">
                      <Icon as={LuClock} boxSize={5} color="blue.600" />
                    </Flex>
                    <Box>
                      <Text fontSize="xs" color="gray.600" mb={1}>
                        総勤務時間
                      </Text>
                      <Text color="gray.900" fontWeight="medium">
                        {stats.totalWorkHours}h
                      </Text>
                    </Box>
                  </Flex>
                </Card.Body>
              </Card.Root>
            </Grid>
          </Box>

          {/* タブコンテンツ */}
          <Tabs.Root value={currentTab} onValueChange={(e) => handleTabChange(e.value)} w="full" variant="enclosed">
            <Tabs.List mb={{ base: 4, md: 6 }}>
              <Tabs.Trigger value="info" gap={2}>
                <Icon as={LuStore} boxSize={4} />
                <Text display={{ base: "none", sm: "inline" }}>基本情報</Text>
                <Text display={{ base: "inline", sm: "none" }}>情報</Text>
              </Tabs.Trigger>
              <Tabs.Trigger value="shifts" gap={2}>
                <Icon as={LuCalendar} boxSize={4} />
                <Text display={{ base: "none", sm: "inline" }}>シフト履歴</Text>
                <Text display={{ base: "inline", sm: "none" }}>シフト</Text>
              </Tabs.Trigger>
              <Tabs.Trigger value="attendance" gap={2}>
                <Icon as={LuClock} boxSize={4} />
                <Text display={{ base: "none", sm: "inline" }}>勤怠記録</Text>
                <Text display={{ base: "inline", sm: "none" }}>勤怠</Text>
              </Tabs.Trigger>
            </Tabs.List>

            {/* 基本情報タブ */}
            <Tabs.Content value="info">
              <InfoTab shops={sortedShops} />
            </Tabs.Content>

            {/* シフト履歴タブ（固定データ） */}
            <Tabs.Content value="shifts">
              <ShiftsTab />
            </Tabs.Content>

            {/* 勤怠記録タブ（固定データ） */}
            <Tabs.Content value="attendance">
              <AttendanceTab />
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </Container>
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
          <Icon as={LuUser} boxSize={12} />
        </Box>
        <Heading size="lg" color="fg.muted">
          ユーザーが見つかりません
        </Heading>
        <Text color="fg.muted">指定されたユーザーは存在しないか、削除された可能性があります</Text>
      </Stack>
    </Box>
  );
};
