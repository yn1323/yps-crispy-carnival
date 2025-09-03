"use client";

import { Badge, Box, Button, Card, Container, Flex, Grid, Heading, Stack, Text, VStack } from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { HiArrowLeft, HiCalendar, HiOfficeBuilding, HiPencil, HiUser, HiUserAdd, HiUserGroup } from "react-icons/hi";
import { Animation } from "@/src/components/templates/Animation";
import { verifySession } from "@/src/helpers/utils/transition";

export const runtime = "edge";

// 仮のデータ
const getMockShopData = (id: string) => {
  const shops = {
    "1": {
      id: "1",
      shopName: "カフェ渋谷店",
      openTime: "09:00",
      closeTime: "22:00",
      description: "レジ締め時は必ず店長に報告。清掃は閉店30分前から開始。",
      currentUserRole: "manager",
      staffCount: 12,
      todayShifts: [
        {
          name: "田中太郎",
          role: "staff",
          time: "09:00-17:00",
          status: "working",
        },
        {
          name: "佐藤花子",
          role: "staff",
          time: "13:00-21:00",
          status: "soon",
        },
        {
          name: "山田次郎",
          role: "manager",
          time: "10:00-18:00",
          status: "working",
        },
      ],
      allStaff: [
        {
          id: "1",
          name: "田中太郎",
          role: "staff",
          joinDate: "2024-01-15",
          status: "active",
        },
        {
          id: "2",
          name: "佐藤花子",
          role: "staff",
          joinDate: "2024-02-01",
          status: "active",
        },
        {
          id: "3",
          name: "山田次郎",
          role: "manager",
          joinDate: "2023-12-01",
          status: "active",
        },
        {
          id: "4",
          name: "鈴木美咲",
          role: "staff",
          joinDate: "2024-03-10",
          status: "active",
        },
      ],
      pendingInvitations: 2,
      recentActivity: [
        { type: "shift_submitted", user: "田中太郎", time: "2時間前" },
        { type: "invitation_used", user: "鈴木美咲", time: "1日前" },
        { type: "settings_updated", user: "山田次郎", time: "3日前" },
      ],
    },
  };
  return shops[id as keyof typeof shops];
};

export default async function ShopDetailPage() {
  await verifySession();

  const params = useParams();
  const router = useRouter();
  const shopId = params.id as string;

  const shop = getMockShopData(shopId);

  if (!shop) {
    return (
      <Animation>
        <Container maxW="container.xl" py={8}>
          <Text>店舗が見つかりません</Text>
        </Container>
      </Animation>
    );
  }

  const isManager = shop.currentUserRole === "manager";
  const workingStaff = shop.todayShifts.filter((s) => s.status === "working").length;

  return (
    <Animation>
      <Container maxW="container.xl" py={8}>
        <VStack gap={6} align="stretch">
          {/* ヘッダー */}
          <Box>
            <Button onClick={() => router.push("/mypage")} variant="ghost" mb={4}>
              <HiArrowLeft />
              マイページに戻る
            </Button>

            <Flex justify="space-between" align="start" mb={4}>
              <Box>
                <Flex align="center" gap={3} mb={2}>
                  <HiOfficeBuilding size={24} color="gray" />
                  <Heading size="xl">{shop.shopName}</Heading>
                  <Badge colorPalette={isManager ? "teal" : "gray"} variant="subtle">
                    {isManager ? "マネージャー" : "スタッフ"}
                  </Badge>
                </Flex>
                <Text color="fg.muted">
                  営業時間: {shop.openTime} - {shop.closeTime}
                </Text>
              </Box>

              {isManager && (
                <Flex gap={3}>
                  <Button onClick={() => router.push(`/shops/${shopId}/edit`)} variant="outline" colorPalette="gray">
                    <HiPencil />
                    店舗設定
                  </Button>
                  <Button onClick={() => router.push(`/shops/${shopId}/invite`)} colorPalette="teal" variant="solid">
                    <HiUserAdd />
                    スタッフ招待
                  </Button>
                </Flex>
              )}
            </Flex>
          </Box>

          {/* メインコンテンツ */}
          <Grid
            templateColumns={{
              base: "1fr",
              lg: "2fr 1fr",
            }}
            gap={6}
          >
            {/* 左側：メインコンテンツ */}
            <VStack gap={6} align="stretch">
              {/* 今日のシフト状況 */}
              <Card.Root>
                <Card.Header>
                  <Flex justify="space-between" align="center">
                    <Heading size="md">
                      <HiCalendar style={{ display: "inline", marginRight: "8px" }} />
                      今日のシフト状況
                    </Heading>
                    <Badge colorPalette="teal" variant="subtle">
                      {workingStaff}名出勤中
                    </Badge>
                  </Flex>
                </Card.Header>
                <Card.Body>
                  <Stack gap={3}>
                    {shop.todayShifts.map((shift, index) => (
                      <Flex
                        key={index}
                        justify="space-between"
                        align="center"
                        p={3}
                        borderRadius="md"
                        bg={
                          shift.status === "working" ? "green.50" : shift.status === "soon" ? "orange.50" : "bg.muted"
                        }
                        borderLeft="4px solid"
                        borderColor={
                          shift.status === "working"
                            ? "green.400"
                            : shift.status === "soon"
                              ? "orange.400"
                              : "border.muted"
                        }
                        _dark={{
                          bg:
                            shift.status === "working"
                              ? "green.900"
                              : shift.status === "soon"
                                ? "orange.900"
                                : "bg.muted",
                        }}
                      >
                        <Box>
                          <Flex align="center" gap={2} mb={1}>
                            {shift.role === "manager" ? <HiUser size={16} /> : <HiUserGroup size={16} />}
                            <Text fontWeight="medium">{shift.name}</Text>
                            <Badge size="sm" colorPalette={shift.role === "manager" ? "teal" : "gray"}>
                              {shift.role === "manager" ? "マネージャー" : "スタッフ"}
                            </Badge>
                          </Flex>
                          <Text fontSize="sm" color="fg.muted">
                            {shift.time}
                          </Text>
                        </Box>
                        <Badge
                          colorPalette={
                            shift.status === "working" ? "green" : shift.status === "soon" ? "orange" : "gray"
                          }
                          variant="subtle"
                        >
                          {shift.status === "working" ? "勤務中" : shift.status === "soon" ? "まもなく出勤" : "待機"}
                        </Badge>
                      </Flex>
                    ))}
                  </Stack>
                </Card.Body>
              </Card.Root>

              {/* スタッフ一覧 */}
              <Card.Root>
                <Card.Header>
                  <Flex justify="space-between" align="center">
                    <Heading size="md">
                      <HiUserGroup style={{ display: "inline", marginRight: "8px" }} />
                      スタッフ一覧
                    </Heading>
                    <Text fontSize="sm" color="fg.muted">
                      {shop.staffCount}名
                    </Text>
                  </Flex>
                </Card.Header>
                <Card.Body>
                  <Grid
                    templateColumns={{
                      base: "1fr",
                      md: "repeat(2, 1fr)",
                    }}
                    gap={4}
                  >
                    {shop.allStaff.map((staff) => (
                      <Flex key={staff.id} justify="space-between" align="center" p={3} borderRadius="md" bg="bg.muted">
                        <Box>
                          <Flex align="center" gap={2} mb={1}>
                            {staff.role === "manager" ? <HiUser size={16} /> : <HiUserGroup size={16} />}
                            <Text fontWeight="medium">{staff.name}</Text>
                          </Flex>
                          <Text fontSize="sm" color="fg.muted">
                            入社: {staff.joinDate}
                          </Text>
                        </Box>
                        <Badge colorPalette={staff.role === "manager" ? "teal" : "gray"} variant="subtle">
                          {staff.role === "manager" ? "マネージャー" : "スタッフ"}
                        </Badge>
                      </Flex>
                    ))}
                  </Grid>
                </Card.Body>
              </Card.Root>
            </VStack>

            {/* 右側：サイドバー */}
            <VStack gap={6} align="stretch">
              {/* 店舗情報 */}
              <Card.Root>
                <Card.Header>
                  <Heading size="md">店舗情報</Heading>
                </Card.Header>
                <Card.Body>
                  <Stack gap={3}>
                    <Box>
                      <Text fontSize="sm" fontWeight="medium" color="fg.muted" mb={1}>
                        営業時間
                      </Text>
                      <Text>
                        {shop.openTime} - {shop.closeTime}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="sm" fontWeight="medium" color="fg.muted" mb={1}>
                        スタッフ数
                      </Text>
                      <Text>{shop.staffCount}名</Text>
                    </Box>
                    {isManager && shop.description && (
                      <Box>
                        <Text fontSize="sm" fontWeight="medium" color="fg.muted" mb={1}>
                          マネージャーメモ
                        </Text>
                        <Text
                          fontSize="sm"
                          bg="blue.50"
                          p={3}
                          borderRadius="md"
                          _dark={{ bg: "blue.900", color: "blue.100" }}
                        >
                          {shop.description}
                        </Text>
                      </Box>
                    )}
                  </Stack>
                </Card.Body>
              </Card.Root>

              {/* 招待状況（マネージャーのみ） */}
              {isManager && (
                <Card.Root>
                  <Card.Header>
                    <Heading size="md">招待状況</Heading>
                  </Card.Header>
                  <Card.Body>
                    <Stack gap={3}>
                      <Flex justify="space-between" align="center">
                        <Text fontSize="sm">未使用の招待</Text>
                        <Badge colorPalette="teal" variant="subtle">
                          {shop.pendingInvitations}件
                        </Badge>
                      </Flex>
                      <Text fontSize="xs" color="fg.muted">
                        ※招待は1回限り有効です
                      </Text>
                      <Button
                        onClick={() => router.push(`/shops/${shopId}/invite`)}
                        variant="outline"
                        size="sm"
                        width="full"
                      >
                        招待を管理
                      </Button>
                    </Stack>
                  </Card.Body>
                </Card.Root>
              )}

              {/* 最近のアクティビティ */}
              <Card.Root>
                <Card.Header>
                  <Heading size="md">最近のアクティビティ</Heading>
                </Card.Header>
                <Card.Body>
                  <Stack gap={3}>
                    {shop.recentActivity.map((activity, index) => (
                      <Flex key={index} gap={3} align="start">
                        <Box width={2} height={2} borderRadius="full" bg="teal.400" mt={2} flexShrink={0} />
                        <Box flex={1}>
                          <Text fontSize="sm">
                            {activity.type === "shift_submitted" && `${activity.user}がシフトを提出`}
                            {activity.type === "invitation_used" && `${activity.user}が招待を使用`}
                            {activity.type === "settings_updated" && `${activity.user}が設定を更新`}
                          </Text>
                          <Text fontSize="xs" color="fg.muted">
                            {activity.time}
                          </Text>
                        </Box>
                      </Flex>
                    ))}
                  </Stack>
                </Card.Body>
              </Card.Root>
            </VStack>
          </Grid>
        </VStack>
      </Container>
    </Animation>
  );
}
