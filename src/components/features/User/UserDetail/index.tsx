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
  Separator,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LuArrowLeft, LuCalendar, LuClock, LuPencil, LuStore, LuTrendingUp, LuUser, LuUsers } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
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
  const navigate = useNavigate();
  const canEdit = currentShopRole === "owner" || currentShopRole === "manager";

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
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      {/* ヘッダー */}
      <Box mb={{ base: 4, md: 6 }}>
        <Link to="/shops/$shopId" params={{ shopId: currentShopId }}>
          <Button
            variant="ghost"
            mb={{ base: 3, md: 4 }}
            ml={-2}
            color="gray.600"
            _hover={{ color: "gray.900" }}
            gap={2}
          >
            <LuArrowLeft size={16} />
            店舗詳細に戻る
          </Button>
        </Link>

        <Flex align="flex-start" justify="space-between" gap={4}>
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
              <Flex align="center" gap={2} fontSize="sm" color="gray.600">
                <LuCalendar size={16} />
                <Text>登録日: {new Date(user.createdAt).toLocaleDateString("ja-JP")}</Text>
              </Flex>
            </Box>
          </Flex>

          {canEdit && (
            <Button
              onClick={() => {
                navigate({
                  to: "/shops/$shopId/members/$userId/edit",
                  params: { shopId: currentShopId, userId: user._id },
                });
              }}
              variant="outline"
              borderColor="teal.600"
              color="teal.600"
              _hover={{ bg: "teal.50" }}
              gap={2}
            >
              <LuPencil size={16} />
              編集
            </Button>
          )}
        </Flex>
      </Box>

      {/* この店舗での役割カード */}
      <Box mb={{ base: 4, md: 6 }}>
        <Card.Root borderWidth={0} shadow="sm">
          <Card.Body p={{ base: 4, md: 6 }}>
            <Flex align="center" justify="space-between">
              <Flex align="center" gap={3}>
                <Flex p={2} bg="purple.50" borderRadius="lg">
                  <Icon size="lg" color="purple.600">
                    <LuUsers />
                  </Icon>
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
                  <Icon size="lg" color="teal.600">
                    <LuCalendar />
                  </Icon>
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
                  <Icon size="lg" color="orange.600">
                    <LuTrendingUp />
                  </Icon>
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
                  <Icon size="lg" color="blue.600">
                    <LuClock />
                  </Icon>
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
      <Tabs.Root defaultValue="info" w="full" variant="enclosed">
        <Tabs.List mb={{ base: 4, md: 6 }}>
          <Tabs.Trigger value="info" gap={2}>
            <LuStore size={16} />
            <Text display={{ base: "none", sm: "inline" }}>基本情報</Text>
            <Text display={{ base: "inline", sm: "none" }}>情報</Text>
          </Tabs.Trigger>
          <Tabs.Trigger value="shifts" gap={2}>
            <LuCalendar size={16} />
            <Text display={{ base: "none", sm: "inline" }}>シフト履歴</Text>
            <Text display={{ base: "inline", sm: "none" }}>シフト</Text>
          </Tabs.Trigger>
          <Tabs.Trigger value="attendance" gap={2}>
            <LuClock size={16} />
            <Text display={{ base: "none", sm: "inline" }}>勤怠記録</Text>
            <Text display={{ base: "inline", sm: "none" }}>勤怠</Text>
          </Tabs.Trigger>
        </Tabs.List>

        {/* 基本情報タブ */}
        <Tabs.Content value="info">
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={{ base: 4, md: 6 }}>
              <Heading as="h4" size="md" color="gray.900" mb={4}>
                所属店舗一覧
              </Heading>
              {sortedShops.length > 0 ? (
                <Box>
                  {sortedShops.map((shop, index) => (
                    <Box key={shop._id}>
                      <Flex align="center" justify="space-between" p={3} bg="gray.50" borderRadius="lg">
                        <Flex align="center" gap={3}>
                          <Flex p={2} bg="white" borderRadius="lg">
                            <Icon color="teal.600">
                              <LuStore />
                            </Icon>
                          </Flex>
                          <Text fontSize="sm" color="gray.900">
                            {shop.shopName}
                          </Text>
                        </Flex>
                        <Flex gap={2}>
                          {shop.roles.map((role) => (
                            <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm">
                              {convertRole.toLabel(role)}
                            </Badge>
                          ))}
                        </Flex>
                      </Flex>
                      {index < sortedShops.length - 1 && <Box h={3} />}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text color="gray.500" textAlign="center" py={4}>
                  所属店舗がありません
                </Text>
              )}
            </Card.Body>
          </Card.Root>
        </Tabs.Content>

        {/* シフト履歴タブ（固定データ） */}
        <Tabs.Content value="shifts">
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={{ base: 4, md: 6 }}>
              {[
                { date: "11/9", day: "土", shift: "10:00 - 18:00", status: "確定" },
                { date: "11/8", day: "金", shift: "10:00 - 18:00", status: "完了" },
                { date: "11/7", day: "木", shift: "休み", status: "休日" },
                { date: "11/6", day: "水", shift: "13:00 - 21:00", status: "完了" },
                { date: "11/5", day: "火", shift: "10:00 - 18:00", status: "完了" },
              ].map((shift, index) => (
                <Box key={index}>
                  <Flex align="center" justify="space-between" py={3}>
                    <Flex align="center" gap={{ base: 3, md: 4 }}>
                      <Box textAlign="center" minW="48px">
                        <Text fontSize="sm" color="gray.900">
                          {shift.date}
                        </Text>
                        <Text fontSize="xs" color="gray.600">
                          {shift.day}
                        </Text>
                      </Box>
                      <Separator orientation="vertical" h={8} />
                      <Box>
                        <Text fontSize="sm" color={shift.status === "休日" ? "gray.500" : "gray.900"}>
                          {shift.shift}
                        </Text>
                      </Box>
                    </Flex>
                    <Badge
                      variant="outline"
                      fontSize="xs"
                      bg={shift.status === "確定" ? "teal.600" : shift.status === "完了" ? "transparent" : "gray.50"}
                      color={shift.status === "確定" ? "white" : shift.status === "完了" ? "gray.700" : "gray.600"}
                      borderColor={shift.status === "確定" ? "teal.600" : "gray.300"}
                    >
                      {shift.status}
                    </Badge>
                  </Flex>
                  {index < 4 && <Separator />}
                </Box>
              ))}
            </Card.Body>
          </Card.Root>
        </Tabs.Content>

        {/* 勤怠記録タブ（固定データ） */}
        <Tabs.Content value="attendance">
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={{ base: 4, md: 6 }}>
              {[
                { date: "11/8", day: "金", checkIn: "09:58", checkOut: "18:05", workHours: "8.1時間", status: "正常" },
                { date: "11/6", day: "水", checkIn: "12:55", checkOut: "21:10", workHours: "8.3時間", status: "正常" },
                { date: "11/5", day: "火", checkIn: "10:05", checkOut: "18:02", workHours: "8.0時間", status: "正常" },
                { date: "11/4", day: "月", checkIn: "09:50", checkOut: "17:55", workHours: "8.1時間", status: "正常" },
                { date: "11/1", day: "金", checkIn: "10:15", checkOut: "18:00", workHours: "7.8時間", status: "遅刻" },
              ].map((record, index) => (
                <Box key={index}>
                  <Box py={3}>
                    <Flex align="center" justify="space-between" mb={2}>
                      <Flex align="center" gap={3}>
                        <Box textAlign="center" minW="48px">
                          <Text fontSize="sm" color="gray.900">
                            {record.date}
                          </Text>
                          <Text fontSize="xs" color="gray.600">
                            {record.day}
                          </Text>
                        </Box>
                        <Badge
                          variant={record.status === "正常" ? "outline" : "solid"}
                          fontSize="xs"
                          borderColor={record.status === "正常" ? "teal.300" : undefined}
                          color={record.status === "正常" ? "teal.700" : "white"}
                          bg={record.status === "正常" ? "teal.50" : "orange.600"}
                        >
                          {record.status}
                        </Badge>
                      </Flex>
                      <Text fontSize="sm" color="gray.900" fontWeight="medium">
                        {record.workHours}
                      </Text>
                    </Flex>
                    <Flex align="center" gap={4} fontSize="xs" color="gray.600" ml="60px">
                      <Text>出勤: {record.checkIn}</Text>
                      <Text>退勤: {record.checkOut}</Text>
                    </Flex>
                  </Box>
                  {index < 4 && <Separator />}
                </Box>
              ))}
            </Card.Body>
          </Card.Root>
        </Tabs.Content>
      </Tabs.Root>
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
