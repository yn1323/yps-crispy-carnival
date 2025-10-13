import { Box, Button, Card, Flex, Grid, Heading, Stack, Text, VStack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import {
  HiBell,
  HiCalendar,
  HiChevronRight,
  HiExclamation,
  HiOfficeBuilding,
  HiPlay,
  HiPlus,
  HiStop,
  HiUser,
  HiUserGroup,
} from "react-icons/hi";

// 動的データ生成関数
const generateShiftsFromToday = () => {
  const today = new Date();
  const shifts = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dateString = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;

    // ランダムでシフトを生成（70%の確率でシフトあり）
    if (Math.random() > 0.3) {
      const startHours = [9, 10, 13, 14, 15];
      const workHours = [6, 7, 8];
      const start = startHours[Math.floor(Math.random() * startHours.length)];
      const end = start + workHours[Math.floor(Math.random() * workHours.length)];
      shifts.push({
        date: dateString,
        time: `${start.toString().padStart(2, "0")}:00-${end.toString().padStart(2, "0")}:00`,
        startTime: `${start.toString().padStart(2, "0")}:00`,
        endTime: `${end.toString().padStart(2, "0")}:00`,
      });
    }
  }

  return shifts.slice(0, 3); // 最大3つまで
};

// 仮のデータ（動的シフト生成）
const mockShops = [
  {
    id: "1",
    shopName: "カフェ渋谷店",
    role: "manager",
    shifts: generateShiftsFromToday(),
    staffCount: 12,
    pendingRequests: 2, // 未処理の申請
    urgentNotifications: 1,
  },
  {
    id: "2",
    shopName: "カフェ新宿店",
    role: "staff",
    shifts: generateShiftsFromToday(),
    staffCount: 8,
    pendingRequests: 0,
    urgentNotifications: 0,
  },
  {
    id: "3",
    shopName: "カフェ池袋店",
    role: "manager",
    shifts: generateShiftsFromToday(),
    staffCount: 15,
    pendingRequests: 0,
    urgentNotifications: 0,
  },
];

export const Dashboard = () => {
  // Server Component化したら解除する
  // await verifySession();
  const navigate = useNavigate();
  const userName = "テストユーザー"; // 仮のユーザー名
  const now = new Date();
  const today = new Date();
  const todayString = `${today.getMonth() + 1}/${today.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][today.getDay()]})`;
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  // 今日と明日の勤務予定を取得
  const todayShifts = mockShops
    .filter((shop) => shop.shifts.some((shift) => shift.date === todayString))
    .map((shop) => ({
      ...shop,
      todayShift: shop.shifts.find((shift) => shift.date === todayString),
    }));

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowString = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][tomorrow.getDay()]})`;
  const tomorrowShifts = mockShops.filter((shop) => shop.shifts.some((shift) => shift.date === tomorrowString));

  // 勤務状態の判定
  const getWorkStatus = (shift?: { startTime: string; endTime: string }) => {
    if (!shift) {
      return "off";
    }
    const [startTime] = shift.startTime.split(":").map(Number);
    const [endTime] = shift.endTime.split(":").map(Number);
    const currentHour = now.getHours();

    if (currentHour < startTime - 1) {
      return "before"; // 出勤1時間前まで
    }
    if (currentHour < startTime) {
      return "soon"; // 出勤1時間前
    }
    if (currentHour <= endTime) {
      return "working"; // 勤務中
    }
    return "finished"; // 勤務終了
  };

  const todayMainShift = todayShifts[0];
  const workStatus = todayMainShift ? getWorkStatus(todayMainShift.todayShift) : "off";

  // 緊急通知の総数
  const totalUrgentNotifications = mockShops.reduce((sum, shop) => sum + shop.urgentNotifications, 0);
  const totalPendingRequests = mockShops.reduce(
    (sum, shop) => sum + (shop.role === "manager" ? shop.pendingRequests : 0),
    0,
  );

  return (
    <VStack gap={8} align="stretch">
      {/* ヘッダー部分 */}
      <Flex justify="space-between" align="center">
        <Box>
          <Heading size="2xl" mb={2}>
            こんにちは、{userName}さん！
          </Heading>
          <Text color="fg.muted">{todayString} - 今日も一日がんばりましょう！✨</Text>
        </Box>
      </Flex>

      {/* スマート勤務ダッシュボード */}
      <Stack gap={4}>
        {/* 今日の勤務状態 */}
        <Card.Root
          variant="subtle"
          colorPalette={workStatus === "off" ? "gray" : workStatus === "working" ? "green" : "teal"}
        >
          <Card.Body>
            <Flex justify="space-between" align="center">
              <Box>
                <Flex align="center" gap={2} mb={2}>
                  <Text fontSize="sm" color="fg.muted">
                    本日の勤務
                  </Text>
                  {workStatus === "working" && <HiPlay size={16} color="green" />}
                  {workStatus === "soon" && <HiExclamation size={16} color="orange" />}
                </Flex>

                {workStatus === "off" ? (
                  <>
                    <Text fontSize="2xl" fontWeight="bold">
                      お疲れさまでした！
                    </Text>
                    <Text fontSize="md" color="fg.muted" mt={1}>
                      今日はゆっくり休んでください ✨
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fontSize="2xl" fontWeight="bold">
                      {todayMainShift?.shopName}
                    </Text>
                    <Flex align="center" gap={4} mt={2}>
                      <Text fontSize="lg" color="fg">
                        {todayMainShift?.todayShift?.time}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        現在 {currentTime}
                      </Text>
                    </Flex>
                    {workStatus === "soon" && (
                      <Text fontSize="sm" color="orange.600" mt={1}>
                        💡 もうすぐ出勤時間です！
                      </Text>
                    )}
                    {workStatus === "working" && (
                      <Text fontSize="sm" color="green.600" mt={1}>
                        🟢 勤務中です。お疲れさまです！
                      </Text>
                    )}
                  </>
                )}
              </Box>

              <Stack gap={2}>
                {workStatus !== "off" && (
                  <Button
                    onClick={() => navigate({ to: "/timecard" })}
                    colorPalette={workStatus === "working" ? "red" : "teal"}
                    size="lg"
                  >
                    {workStatus === "working" ? <HiStop size={20} /> : <HiPlay size={20} />}
                    {workStatus === "working" ? "退勤" : "出勤"}
                  </Button>
                )}

                {(totalUrgentNotifications > 0 || totalPendingRequests > 0) && (
                  <Button
                    variant="outline"
                    colorPalette="orange"
                    size="sm"
                    // onClick={() => navigate("/notifications")}
                  >
                    <HiExclamation size={16} />
                    緊急 {totalUrgentNotifications + totalPendingRequests}件
                  </Button>
                )}
              </Stack>
            </Flex>
          </Card.Body>
        </Card.Root>

        {/* 明日の予定プレビュー */}
        {tomorrowShifts.length > 0 && (
          <Card.Root bg="blue.50" borderLeft="4px solid" borderColor="blue.400" _dark={{ bg: "blue.900" }}>
            <Card.Body py={3}>
              <Flex justify="space-between" align="center">
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="blue.700" _dark={{ color: "blue.200" }}>
                    明日の勤務予定
                  </Text>
                  <Text fontSize="md" color="blue.600" _dark={{ color: "blue.300" }}>
                    {tomorrowShifts[0].shopName} -{" "}
                    {tomorrowShifts[0].shifts.find((s) => s.date === tomorrowString)?.time}
                  </Text>
                </Box>
                <Button variant="ghost" size="sm" colorPalette="blue">
                  <HiChevronRight size={16} />
                  詳細
                </Button>
              </Flex>
            </Card.Body>
          </Card.Root>
        )}
      </Stack>

      {/* 通知・お知らせセクション */}
      <Card.Root>
        <Card.Header>
          <Flex justify="space-between" align="center">
            <Heading size="md">
              <HiBell style={{ display: "inline", marginRight: "8px" }} />
              お知らせ
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              すべて見る
            </Text>
          </Flex>
        </Card.Header>
        <Card.Body>
          <Stack gap={3}>
            <Box
              p={3}
              bg="blue.50"
              borderRadius="md"
              borderLeft="4px solid"
              borderColor="blue.500"
              _dark={{ bg: "blue.900" }}
            >
              <Flex justify="space-between" align="start">
                <Box flex={1}>
                  <Text fontWeight="medium" mb={1} _dark={{ color: "blue.100" }}>
                    【重要】年末年始の営業について
                  </Text>
                  <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.200" }}>
                    12/31〜1/3は全店舗休業となります
                  </Text>
                </Box>
                <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap" ml={3}>
                  2日前
                </Text>
              </Flex>
            </Box>
            <Box p={3} bg="bg.muted" borderRadius="md">
              <Flex justify="space-between" align="start">
                <Box flex={1}>
                  <Text fontWeight="medium" mb={1}>
                    シフト提出のお願い
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    来月のシフト提出期限は今週金曜日です
                  </Text>
                </Box>
                <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap" ml={3}>
                  4日前
                </Text>
              </Flex>
            </Box>
          </Stack>
        </Card.Body>
      </Card.Root>

      {/* 店舗一覧セクション */}
      <Box>
        <Flex justify="space-between" align="center" mb={6}>
          <Heading size="lg">所属店舗</Heading>
          <Button onClick={() => navigate({ to: "/shops/new" })} colorPalette="teal" variant="solid">
            <HiPlus />
            新規店舗を作成
          </Button>
        </Flex>

        <Grid
          templateColumns={{
            base: "1fr",
            md: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
          }}
          gap={6}
        >
          {mockShops.map((shop) => (
            <Card.Root
              key={shop.id}
              onClick={() => navigate({ to: `/shops/${shop.id}` })}
              cursor="pointer"
              _hover={{ shadow: "lg", transform: "translateY(-2px)" }}
              transition="all 0.2s"
            >
              <Card.Body>
                <Stack gap={4}>
                  <Flex justify="space-between" align="start">
                    <Box>
                      <Heading size="md" mb={1}>
                        {shop.shopName}
                      </Heading>
                      <Flex align="center" gap={1}>
                        {shop.role === "manager" ? <HiUser size={14} /> : <HiUserGroup size={14} />}
                        <Text
                          fontSize="sm"
                          color={shop.role === "manager" ? "teal.600" : "fg.muted"}
                          fontWeight="medium"
                        >
                          {shop.role === "manager" ? "マネージャー" : "スタッフ"}
                        </Text>
                      </Flex>
                    </Box>
                    <HiOfficeBuilding size={24} color="gray" />
                  </Flex>

                  <Box>
                    <Flex align="center" gap={2} mb={3}>
                      <HiCalendar size={16} />
                      <Text fontSize="sm" fontWeight="medium">
                        直近のシフト
                      </Text>
                    </Flex>
                    <Stack gap={1}>
                      {shop.shifts.length > 0 ? (
                        shop.shifts.map((shift, index) => {
                          const isToday = shift.date === todayString;
                          const isTomorrow = shift.date === tomorrowString;
                          return (
                            <Flex
                              key={index}
                              justify="space-between"
                              align="center"
                              p={2}
                              borderRadius="md"
                              bg={isToday ? "teal.50" : isTomorrow ? "blue.50" : "transparent"}
                              borderLeft={isToday || isTomorrow ? "3px solid" : "none"}
                              borderColor={isToday ? "teal.500" : isTomorrow ? "blue.400" : "transparent"}
                            >
                              <Flex align="center" gap={2}>
                                <Text fontSize="sm" color={isToday ? "teal.700" : isTomorrow ? "blue.600" : "fg.muted"}>
                                  {shift.date}
                                </Text>
                                {isToday && (
                                  <Text fontSize="xs" color="teal.500">
                                    今日
                                  </Text>
                                )}
                                {isTomorrow && (
                                  <Text fontSize="xs" color="blue.500">
                                    明日
                                  </Text>
                                )}
                              </Flex>
                              <Text
                                fontSize="sm"
                                fontWeight={isToday ? "bold" : "medium"}
                                color={isToday ? "teal.700" : isTomorrow ? "blue.600" : "fg"}
                              >
                                {shift.time}
                              </Text>
                            </Flex>
                          );
                        })
                      ) : (
                        <Text fontSize="sm" color="fg.muted">
                          予定されているシフトはありません
                        </Text>
                      )}
                    </Stack>
                  </Box>

                  <Flex justify="space-between" align="center">
                    <Text fontSize="sm" color="fg.muted">
                      スタッフ数: {shop.staffCount}名
                    </Text>
                    <Flex align="center" gap={2}>
                      {(shop.pendingRequests > 0 || shop.urgentNotifications > 0) && (
                        <Flex align="center" gap={1}>
                          <HiExclamation size={12} color="orange" />
                          <Text fontSize="xs" color="orange.600">
                            {shop.pendingRequests + shop.urgentNotifications}件
                          </Text>
                        </Flex>
                      )}
                      {shop.role === "manager" && (
                        <Text fontSize="xs" color="teal.600">
                          管理者権限
                        </Text>
                      )}
                    </Flex>
                  </Flex>
                </Stack>
              </Card.Body>
            </Card.Root>
          ))}
        </Grid>
      </Box>
    </VStack>
  );
};
