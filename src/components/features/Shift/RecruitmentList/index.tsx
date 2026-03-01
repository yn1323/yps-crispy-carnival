import { Badge, Box, Button, Card, Container, Flex, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { useState } from "react";
import { LuCalendar, LuCalendarPlus, LuChevronRight, LuSettings } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";
import { Empty } from "@/src/components/ui/Empty";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";

dayjs.locale("ja");

type RecruitmentType = {
  _id: string;
  startDate: string;
  endDate: string;
  deadline: string;
  status: "open" | "closed" | "confirmed";
  appliedCount: number;
  totalStaffCount: number;
  confirmedAt?: number;
};

type ShopType = {
  _id: string;
  shopName: string;
};

type RecruitmentListProps = {
  shop: ShopType;
  recruitments: RecruitmentType[];
};

const STATUS_CONFIG = {
  open: { label: "募集中", colorPalette: "teal", iconBg: "teal.50" },
  closed: { label: "締切済み", colorPalette: "orange", iconBg: "orange.50" },
  confirmed: { label: "確定済み", colorPalette: "blue", iconBg: "blue.50" },
} as const;

const formatDateRange = (startDate: string, endDate: string) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return `${start.format("M/D(ddd)")} 〜 ${end.format("M/D(ddd)")}`;
};

const formatDate = (date: string) => {
  return dayjs(date).format("M/D(ddd)");
};

export const RecruitmentList = ({ shop, recruitments }: RecruitmentListProps) => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");

  // ステータスフィルター（バックエンドで開始日の降順ソート済み）
  const filteredRecruitments = recruitments.filter((recruitment) => {
    if (statusFilter === "all") return true;
    return recruitment.status === statusFilter;
  });

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: "/mypage", label: "マイページに戻る" }}
        action={
          <HStack gap={2} display={{ base: "none", md: "flex" }}>
            <Link to="/shops/$shopId/shifts/settings" params={{ shopId: shop._id }}>
              <Button variant="outline" colorPalette="gray" gap={2}>
                <Icon as={LuSettings} boxSize={4} />
                必要人員設定
              </Button>
            </Link>
            <Link to="/shops/$shopId/shifts/recruitments/new" params={{ shopId: shop._id }}>
              <Button colorPalette="teal" gap={2}>
                <Icon as={LuCalendarPlus} boxSize={4} />
                新規募集作成
              </Button>
            </Link>
          </HStack>
        }
      >
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuCalendar} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              シフト管理
            </Heading>
            <Text fontSize="sm" color="gray.500">
              {shop.shopName}
            </Text>
          </Box>
        </Flex>
      </Title>

      <Animation>
        {/* フィルター */}
        <Box mb={4}>
          <Flex direction={{ base: "column", md: "row" }} gap={3} mb={3}>
            {/* ステータスフィルター */}
            <Select
              items={[
                { value: "all", label: "全て" },
                { value: "open", label: "募集中" },
                { value: "closed", label: "締切済み" },
                { value: "confirmed", label: "確定済み" },
              ]}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              w={{ base: "full", md: "180px" }}
            />
          </Flex>

          {/* モバイル用ボタン */}
          <Flex direction="column" gap={2} display={{ base: "flex", md: "none" }}>
            <Link to="/shops/$shopId/shifts/settings" params={{ shopId: shop._id }}>
              <Button w="full" variant="outline" colorPalette="gray" gap={2}>
                <Icon as={LuSettings} boxSize={4} />
                必要人員設定
              </Button>
            </Link>
            <Link to="/shops/$shopId/shifts/recruitments/new" params={{ shopId: shop._id }}>
              <Button w="full" colorPalette="teal" gap={2}>
                <Icon as={LuCalendarPlus} boxSize={4} />
                新規募集作成
              </Button>
            </Link>
          </Flex>
        </Box>

        {/* 募集一覧 */}
        {filteredRecruitments.length > 0 ? (
          <>
            <Text fontSize="sm" color="gray.600" mb={3}>
              {filteredRecruitments.length}件の募集
            </Text>
            <Box>
              {filteredRecruitments.map((recruitment) => {
                const config = STATUS_CONFIG[recruitment.status];
                return (
                  <Card.Root
                    key={recruitment._id}
                    mb={{ base: 2, md: 3 }}
                    borderWidth={0}
                    shadow="sm"
                    _hover={{ shadow: "md", cursor: "pointer" }}
                    transition="all 0.15s"
                    onClick={() =>
                      navigate({
                        to: "/shops/$shopId/shifts/recruitments/$recruitmentId",
                        params: { shopId: shop._id, recruitmentId: recruitment._id },
                      })
                    }
                  >
                    <Card.Body p={{ base: 3, md: 4 }}>
                      <Flex align="center" justify="space-between" gap={4}>
                        <Flex align="center" gap={3} flex={1} minW={0}>
                          {/* カレンダーアイコン */}
                          <Flex
                            w={{ base: 10, md: 12 }}
                            h={{ base: 10, md: 12 }}
                            borderRadius="lg"
                            bg={config.iconBg}
                            align="center"
                            justify="center"
                            flexShrink={0}
                          >
                            <Icon as={LuCalendar} boxSize={5} color="gray.600" />
                          </Flex>

                          {/* 募集情報 */}
                          <Box flex={1} minW={0}>
                            <HStack gap={2} flexWrap="wrap" mb={1}>
                              <Text fontSize={{ base: "sm", md: "base" }} fontWeight="semibold" color="gray.900">
                                {formatDateRange(recruitment.startDate, recruitment.endDate)}
                              </Text>
                              <Badge colorPalette={config.colorPalette} size="sm">
                                {config.label}
                              </Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">
                              {recruitment.status === "confirmed" ? (
                                <>
                                  確定日: {formatDate(dayjs(recruitment.confirmedAt).format("YYYY-MM-DD"))} |{" "}
                                  {recruitment.appliedCount}名確定
                                </>
                              ) : (
                                <>
                                  締切: {formatDate(recruitment.deadline)} | 申請: {recruitment.appliedCount}/
                                  {recruitment.totalStaffCount}名
                                </>
                              )}
                            </Text>
                          </Box>
                        </Flex>

                        {/* 矢印アイコン */}
                        <Icon as={LuChevronRight} boxSize={5} color="gray.400" />
                      </Flex>
                    </Card.Body>
                  </Card.Root>
                );
              })}
            </Box>
          </>
        ) : (
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={8}>
              <Empty
                icon={LuCalendar}
                title="シフト募集がありません"
                description="新規募集を作成して、スタッフにシフト希望を募集しましょう"
                minH="auto"
                action={
                  <Link to="/shops/$shopId/shifts/recruitments/new" params={{ shopId: shop._id }}>
                    <Button colorPalette="teal" gap={2}>
                      <Icon as={LuCalendarPlus} boxSize={4} />
                      新規募集作成
                    </Button>
                  </Link>
                }
              />
            </Card.Body>
          </Card.Root>
        )}
      </Animation>
    </Container>
  );
};

export const RecruitmentListLoading = () => {
  return <LoadingState />;
};

export const RecruitmentListNotFound = () => (
  <Empty
    icon={LuCalendar}
    title="店舗が見つかりません"
    description="指定された店舗は存在しないか、削除された可能性があります"
    action={
      <Link to="/mypage">
        <Button colorPalette="teal" size="lg">
          マイページに戻る
        </Button>
      </Link>
    }
  />
);
