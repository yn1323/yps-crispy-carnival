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
  Skeleton,
  SkeletonText,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { LuCalendar, LuClock, LuMail, LuPencil, LuStore, LuTrendingUp, LuUser } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { Empty } from "@/src/components/ui/Empty";
import { Title } from "@/src/components/ui/Title";
import { InfoTab } from "./TabContents/InfoTab";
import { ShiftsTab } from "./TabContents/ShiftsTab";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  skills: { position: string; level: string }[];
  maxWeeklyHours: number | undefined;
  memo: string;
  workStyleNote: string;
  hourlyWage: number | null;
  resignedAt: number | undefined;
  resignationReason: string | undefined;
  createdAt: number;
  isManager: boolean;
};

type ShopType = {
  _id: Id<"shops">;
  shopName: string;
};

type StaffDetailProps = {
  staff: StaffType;
  shop: ShopType;
};

export const StaffDetailTabTypes = ["info", "shifts"] as const;

export const StaffDetail = ({ staff, shop }: StaffDetailProps) => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const currentTab = search.tab || "info";

  // アバターのイニシャル生成
  const getInitials = (name: string) => {
    return name
      .split("")
      .slice(0, 2)
      .map((char) => char.toUpperCase())
      .join("");
  };

  // ステータスバッジの生成
  const statusBadge = () => {
    switch (staff.status) {
      case "active":
        return null;
      case "pending":
        return (
          <Badge colorPalette="orange" size="lg">
            招待中
          </Badge>
        );
      case "resigned":
        return (
          <Badge colorPalette="gray" size="lg">
            退職済み
          </Badge>
        );
      default:
        return null;
    }
  };

  // 固定値の統計データ（将来的にはAPIから取得）
  const stats = {
    monthlyWorkDays: 18,
    shiftParticipationRate: 95,
    totalWorkHours: 144,
  };

  const handleTabChange = (value: string) => {
    navigate({
      to: "/shops/$shopId/staffs/$staffId",
      params: { shopId: shop._id, staffId: staff._id },
      search: { tab: value as (typeof StaffDetailTabTypes)[number] },
      replace: true,
    });
  };

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: `/shops/${shop._id}?tab=staff`, label: "スタッフ一覧に戻る" }}
        action={
          <Flex gap={2}>
            <Button
              onClick={() => {
                navigate({
                  to: "/shops/$shopId/staffs/$staffId/edit",
                  params: { shopId: shop._id, staffId: staff._id },
                });
              }}
              colorPalette="teal"
              gap={2}
            >
              <Icon as={LuPencil} boxSize={4} />
              <Text display={{ base: "none", md: "inline" }}>編集</Text>
            </Button>
            {staff.status === "pending" && (
              <Button colorPalette="orange" gap={2}>
                <Icon as={LuMail} boxSize={4} />
                <Text display={{ base: "none", md: "inline" }}>招待メールを再送</Text>
              </Button>
            )}
          </Flex>
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
              {getInitials(staff.displayName)}
            </Text>
          </Flex>

          <Box>
            <Flex align="center" gap={3} mb={2}>
              <Heading as="h2" size="xl" color="gray.900">
                {staff.displayName}
              </Heading>
              {statusBadge()}
              {staff.isManager && (
                <Badge colorPalette="purple" size="lg">
                  マネージャー
                </Badge>
              )}
            </Flex>
            <Flex align="center" gap={2} fontSize="sm" color="gray.600">
              <Icon as={LuCalendar} boxSize={4} />
              <Text>登録日: {new Date(staff.createdAt).toLocaleDateString("ja-JP")}</Text>
            </Flex>
          </Box>
        </Flex>
      </Title>

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

      {/* 退職情報（退職済みの場合のみ表示） */}
      {staff.status === "resigned" && staff.resignedAt && (
        <Card.Root borderColor="gray.300" mb={{ base: 4, md: 6 }}>
          <Card.Header>
            <Heading as="h3" size="md" color="gray.600">
              退職情報
            </Heading>
          </Card.Header>
          <Card.Body pt={0}>
            <VStack align="stretch" gap={2}>
              <Text fontSize="sm" color="gray.500">
                退職日: {new Date(staff.resignedAt).toLocaleDateString("ja-JP")}
              </Text>
              {staff.resignationReason && (
                <Text fontSize="sm" color="gray.600">
                  理由: {staff.resignationReason}
                </Text>
              )}
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

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
        </Tabs.List>

        {/* 基本情報タブ */}
        <Tabs.Content value="info">
          <InfoTab staff={staff} />
        </Tabs.Content>

        {/* シフト履歴タブ（固定データ） */}
        <Tabs.Content value="shifts">
          <ShiftsTab />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
};

// ローディング状態
export const StaffDetailLoading = () => {
  return (
    <Container maxW="6xl" py={6}>
      <VStack align="stretch" gap={6}>
        <Skeleton height="40px" width="150px" />
        <Flex align="center" gap={4}>
          <Skeleton height="80px" width="80px" borderRadius="full" />
          <Box>
            <Skeleton height="32px" width="200px" mb={2} />
            <Skeleton height="20px" width="150px" />
          </Box>
        </Flex>
        <Grid gridTemplateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
          <Skeleton height="80px" />
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </Grid>
        <Card.Root>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <SkeletonText noOfLines={1} />
              <SkeletonText noOfLines={1} />
              <SkeletonText noOfLines={1} />
            </VStack>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Container>
  );
};

// 見つからない状態
type StaffDetailNotFoundProps = {
  shopId: string;
};

export const StaffDetailNotFound = ({ shopId }: StaffDetailNotFoundProps) => (
  <Container maxW="6xl" py={6}>
    <Empty
      icon={LuUser}
      title="スタッフが見つかりませんでした"
      action={
        <Link to="/shops/$shopId" params={{ shopId }} search={{ tab: "staff" }}>
          <Button colorPalette="teal">スタッフ一覧に戻る</Button>
        </Link>
      }
    />
  </Container>
);
