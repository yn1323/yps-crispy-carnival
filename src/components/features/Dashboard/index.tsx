import { Badge, Box, Button, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  HiCalendar,
  HiChevronRight,
  HiClock,
  HiExclamation,
  HiLogin,
  HiLogout,
  HiPaperAirplane,
  HiUser,
} from "react-icons/hi";

const user = {
  name: "テストユーザー",
  role: "マネージャー",
};

// サマリーデータ
const summary = [
  {
    title: "今週の勤務時間",
    value: "24.5時間",
    subtext: "残り 15.5h",
    icon: HiClock,
    colorPalette: "teal",
  },
  {
    title: "今月の出勤日数",
    value: "18日",
    subtext: "目標 20日",
    icon: HiCalendar,
    colorPalette: "blue",
  },
  {
    title: "承認待ちシフト",
    value: "3件",
    subtext: "要確認",
    icon: HiExclamation,
    colorPalette: "orange",
  },
];

// クイックアクション
const quickActions = [
  {
    label: "出勤",
    icon: HiLogin,
    colorPalette: "teal",
    variant: "solid" as const,
  },
  {
    label: "退勤",
    icon: HiLogout,
    colorPalette: "gray",
    variant: "solid" as const,
  },
  {
    label: "シフト申請",
    icon: HiPaperAirplane,
    colorPalette: "gray",
    variant: "outline" as const,
  },
  {
    label: "勤怠確認",
    icon: HiUser,
    colorPalette: "gray",
    variant: "outline" as const,
  },
];

// 今週のシフト（固定データ）
const weeklyShifts = [
  { date: "11/8", day: "金", shift: "14:00-22:00", status: "勤務中", isToday: true },
  { date: "11/9", day: "土", shift: "10:00-18:00", status: "確定", isToday: false },
  { date: "11/10", day: "日", shift: "休み", status: "休日", isToday: false },
  { date: "11/11", day: "月", shift: "14:00-22:00", status: "確定", isToday: false },
  { date: "11/12", day: "火", shift: "10:00-16:00", status: "確定", isToday: false },
  { date: "11/13", day: "水", shift: "休み", status: "休日", isToday: false },
  { date: "11/14", day: "木", shift: "14:00-22:00", status: "未定", isToday: false },
];

// お知らせ
const announcements = [
  {
    id: 1,
    title: "年末年始の営業について",
    date: "2日前",
    isImportant: true,
  },
  {
    id: 2,
    title: "シフト提出のお願い",
    date: "4日前",
    isImportant: false,
  },
];

export const Dashboard = () => {
  const today = new Date();
  const todayString = `${today.getMonth() + 1}/${today.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][today.getDay()]})`;

  return (
    <VStack gap={8} align="stretch">
      <Box maxW="6xl" mx="auto" p={{ base: "4", md: "8" }} w="full">
        {/* ヘッダー */}
        <Box mb={{ base: "4", md: "8" }}>
          <Text color="gray.900" mb="1">
            おはようございます、{user.name}さん
          </Text>
          <Text color="gray.600" fontSize="sm">
            {todayString} 今日も一日頑張りましょう
          </Text>
        </Box>

        {/* サマリーカード */}
        <Grid
          templateColumns={{ base: "repeat(3, 1fr)", md: "repeat(3, 1fr)" }}
          gap={{ base: "2", md: "4" }}
          mb={{ base: "4", md: "8" }}
        >
          {summary.map((item, index) => (
            <Box key={index} bg="white" borderRadius="lg" boxShadow="sm" p={{ base: "3", md: "6" }}>
              <Flex justify="center" mb={{ base: "2", md: "3" }}>
                <Box p="2" borderRadius="lg" bg={`${item.colorPalette}.50`}>
                  <Icon as={item.icon} boxSize={{ base: "4", md: "5" }} color={`${item.colorPalette}.600`} />
                </Box>
              </Flex>
              <VStack gap="0.5">
                <Text fontSize={{ base: "xs", md: "sm" }} color="gray.600" textAlign="center">
                  {item.title}
                </Text>
                <Text color="gray.900" textAlign="center">
                  {item.value}
                </Text>
                <Text fontSize="xs" color="gray.500" display={{ base: "none", md: "block" }}>
                  {item.subtext}
                </Text>
              </VStack>
            </Box>
          ))}
        </Grid>

        {/* お知らせ */}
        <Box mb={{ base: "4", md: "8" }}>
          <Flex align="center" justify="space-between" mb={{ base: "3", md: "4" }}>
            <Text color="gray.900">お知らせ</Text>
            <Button variant="plain" colorPalette="teal" gap="1" size="sm">
              すべて見る
              <Icon as={HiChevronRight} boxSize="4" />
            </Button>
          </Flex>
          <VStack gap={{ base: "2", md: "3" }} align="stretch">
            {announcements.map((announcement) => (
              <Box
                key={announcement.id}
                bg="white"
                borderRadius="lg"
                boxShadow="sm"
                p={{ base: "3", md: "4" }}
                cursor="pointer"
                _hover={{ boxShadow: "md" }}
                _active={{ transform: "scale(0.98)", boxShadow: "sm" }}
                transition="all 0.15s"
                role="group"
              >
                <Flex align="center" justify="space-between" gap="2">
                  <HStack gap={{ base: "2", md: "3" }} minW="0">
                    <Icon as={HiExclamation} boxSize={{ base: "4", md: "5" }} color="orange.600" flexShrink="0" />
                    <VStack align="start" gap="0.5" minW="0">
                      <HStack gap="2">
                        {announcement.isImportant && (
                          <Badge colorPalette="red" fontSize="xs" variant="solid">
                            重要
                          </Badge>
                        )}
                        <Text fontSize={{ base: "sm", md: "md" }} color="gray.900" truncate>
                          {announcement.title}
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.500">
                        {announcement.date}
                      </Text>
                    </VStack>
                  </HStack>
                  <Icon
                    as={HiChevronRight}
                    boxSize={{ base: "4", md: "5" }}
                    color="gray.400"
                    flexShrink="0"
                    _groupHover={{ color: "teal.600", transform: "translateX(4px)" }}
                    transition="all 0.15s"
                  />
                </Flex>
              </Box>
            ))}
          </VStack>
        </Box>

        {/* クイックアクション */}
        <Box mb={{ base: "4", md: "8" }}>
          <Text color="gray.900" mb={{ base: "3", md: "4" }}>
            クイックアクション
          </Text>
          <Grid templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }} gap={{ base: "2", md: "3" }}>
            {quickActions.map((action, index) => (
              <Button
                key={index}
                colorPalette={action.colorPalette}
                variant={action.variant}
                h="auto"
                py={{ base: "3", md: "4" }}
                flexDirection="column"
                gap={{ base: "1.5", md: "2" }}
                transition="all 0.15s"
              >
                <Icon as={action.icon} boxSize={{ base: "4", md: "5" }} />
                <Text fontSize={{ base: "xs", md: "sm" }}>{action.label}</Text>
              </Button>
            ))}
          </Grid>
        </Box>

        {/* 今週のシフト */}
        <Box>
          <Flex align="center" justify="space-between" mb={{ base: "3", md: "4" }}>
            <Text color="gray.900">今週のシフト</Text>
            <Button variant="plain" colorPalette="teal" gap="1" size="sm">
              シフト詳細
              <Icon as={HiChevronRight} boxSize="4" />
            </Button>
          </Flex>
          <Box bg="white" borderRadius="lg" boxShadow="sm" p={{ base: "3", md: "6" }}>
            <VStack gap={{ base: "2", md: "3" }} align="stretch">
              {weeklyShifts.map((shift, index) => (
                <Flex
                  key={index}
                  align="center"
                  justify="space-between"
                  p={{ base: "2.5", md: "4" }}
                  borderRadius="lg"
                  bg={shift.isToday ? "teal.50" : "gray.50"}
                  border={shift.isToday ? "1px" : "none"}
                  borderColor={shift.isToday ? "teal.200" : "transparent"}
                  transition="all 0.15s"
                >
                  <HStack gap={{ base: "2", md: "4" }}>
                    <VStack gap="0" minW={{ base: "40px", md: "48px" }}>
                      <Text fontSize={{ base: "xs", md: "sm" }} color={shift.isToday ? "teal.600" : "gray.900"}>
                        {shift.date}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        {shift.day}
                      </Text>
                    </VStack>
                    <Text fontSize={{ base: "sm", md: "md" }} color={shift.status === "休日" ? "gray.500" : "gray.900"}>
                      {shift.shift}
                    </Text>
                  </HStack>
                  <Box>
                    {shift.status === "勤務中" && (
                      <Badge colorPalette="teal" fontSize="xs" variant="solid">
                        勤務中
                      </Badge>
                    )}
                    {shift.status === "確定" && (
                      <Badge variant="outline" fontSize="xs">
                        確定
                      </Badge>
                    )}
                    {shift.status === "未定" && (
                      <Badge colorPalette="orange" variant="outline" fontSize="xs">
                        未定
                      </Badge>
                    )}
                    {shift.status === "休日" && (
                      <Badge variant="outline" fontSize="xs" colorPalette="gray">
                        休日
                      </Badge>
                    )}
                  </Box>
                </Flex>
              ))}
            </VStack>
          </Box>
        </Box>
      </Box>
    </VStack>
  );
};
