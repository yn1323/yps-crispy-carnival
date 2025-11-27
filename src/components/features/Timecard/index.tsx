import { Badge, Box, Button, Card, Container, Flex, Grid, HStack, Icon, Table, Text, VStack } from "@chakra-ui/react";
import { LuCalendar, LuClock, LuLogIn, LuLogOut, LuPencil, LuTimer, LuTrendingUp } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";
import { Title } from "@/src/components/ui/Title";

// モックデータの型定義
type AttendanceRecord = {
  id: string;
  date: string;
  dayOfWeek: string;
  clockIn: string | null;
  clockOut: string | null;
  breakTime: string;
  workTime: string;
  status: "completed" | "in_progress" | "absent" | "holiday";
};

type MonthlySummary = {
  totalWorkDays: number;
  totalWorkHours: string;
  averageWorkHours: string;
  overtimeHours: string;
  lateCount: number;
  earlyLeaveCount: number;
};

type TimecardProps = {
  currentTime: string;
  currentDate: string;
  isClockedIn: boolean;
  todayRecord: {
    clockIn: string | null;
    clockOut: string | null;
  };
  attendanceRecords: AttendanceRecord[];
  monthlySummary: MonthlySummary;
  onClockIn: () => void;
  onClockOut: () => void;
  onEditRequest: (recordId: string) => void;
};

// ステータスに応じたバッジを返す
const StatusBadge = ({ status }: { status: AttendanceRecord["status"] }) => {
  const config = {
    completed: { color: "green", label: "完了" },
    in_progress: { color: "blue", label: "勤務中" },
    absent: { color: "red", label: "欠勤" },
    holiday: { color: "gray", label: "休日" },
  };

  const { color, label } = config[status];
  return (
    <Badge colorPalette={color} variant="subtle">
      {label}
    </Badge>
  );
};

export const Timecard = ({
  currentTime,
  currentDate,
  isClockedIn,
  todayRecord,
  attendanceRecords,
  monthlySummary,
  onClockIn,
  onClockOut,
  onEditRequest,
}: TimecardProps) => {
  return (
    <Container maxW="6xl">
      <Title>タイムカード</Title>

      {/* 打刻セクション */}
      <FormCard icon={LuClock} iconColor="teal.600" title="打刻">
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
          {/* 現在時刻表示 */}
          <Card.Root borderWidth={1} borderColor="gray.200">
            <Card.Body p={6}>
              <VStack gap={2}>
                <Text color="gray.500" fontSize="sm">
                  {currentDate}
                </Text>
                <Text fontSize="4xl" fontWeight="bold" color="gray.900">
                  {currentTime}
                </Text>
                <HStack gap={4} mt={2}>
                  {todayRecord.clockIn && (
                    <Flex align="center" gap={1} color="gray.600">
                      <Icon as={LuLogIn} boxSize={4} />
                      <Text fontSize="sm">出勤: {todayRecord.clockIn}</Text>
                    </Flex>
                  )}
                  {todayRecord.clockOut && (
                    <Flex align="center" gap={1} color="gray.600">
                      <Icon as={LuLogOut} boxSize={4} />
                      <Text fontSize="sm">退勤: {todayRecord.clockOut}</Text>
                    </Flex>
                  )}
                </HStack>
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* 打刻ボタン */}
          <Card.Root borderWidth={1} borderColor="gray.200">
            <Card.Body p={6}>
              <VStack gap={4} h="full" justify="center">
                {!isClockedIn ? (
                  <Button colorPalette="teal" size="xl" w="full" h="80px" fontSize="xl" onClick={onClockIn}>
                    <Icon as={LuLogIn} boxSize={6} mr={2} />
                    出勤
                  </Button>
                ) : (
                  <Button colorPalette="orange" size="xl" w="full" h="80px" fontSize="xl" onClick={onClockOut}>
                    <Icon as={LuLogOut} boxSize={6} mr={2} />
                    退勤
                  </Button>
                )}
                <Text fontSize="sm" color="gray.500">
                  {isClockedIn ? "お疲れ様です。退勤ボタンを押してください" : "出勤ボタンを押して勤務を開始"}
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </Grid>
      </FormCard>

      {/* 月間サマリー */}
      <Box mt={6}>
        <FormCard icon={LuTrendingUp} iconColor="blue.600" title="今月のサマリー">
          <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }} gap={4}>
            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    出勤日数
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="gray.900">
                    {monthlySummary.totalWorkDays}
                    <Text as="span" fontSize="sm" fontWeight="normal" ml={1}>
                      日
                    </Text>
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    総労働時間
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="gray.900">
                    {monthlySummary.totalWorkHours}
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    平均労働時間
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="gray.900">
                    {monthlySummary.averageWorkHours}
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    残業時間
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.500">
                    {monthlySummary.overtimeHours}
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    遅刻回数
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color={monthlySummary.lateCount > 0 ? "red.500" : "gray.900"}>
                    {monthlySummary.lateCount}
                    <Text as="span" fontSize="sm" fontWeight="normal" ml={1}>
                      回
                    </Text>
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root borderWidth={1} borderColor="gray.200">
              <Card.Body p={4}>
                <VStack gap={1}>
                  <Text fontSize="sm" color="gray.500">
                    早退回数
                  </Text>
                  <Text
                    fontSize="2xl"
                    fontWeight="bold"
                    color={monthlySummary.earlyLeaveCount > 0 ? "red.500" : "gray.900"}
                  >
                    {monthlySummary.earlyLeaveCount}
                    <Text as="span" fontSize="sm" fontWeight="normal" ml={1}>
                      回
                    </Text>
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>
          </Grid>
        </FormCard>
      </Box>

      {/* 勤怠履歴 */}
      <Box mt={6}>
        <FormCard icon={LuCalendar} iconColor="purple.600" title="勤怠履歴">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>日付</Table.ColumnHeader>
                  <Table.ColumnHeader>出勤</Table.ColumnHeader>
                  <Table.ColumnHeader>退勤</Table.ColumnHeader>
                  <Table.ColumnHeader>休憩</Table.ColumnHeader>
                  <Table.ColumnHeader>労働時間</Table.ColumnHeader>
                  <Table.ColumnHeader>ステータス</Table.ColumnHeader>
                  <Table.ColumnHeader>操作</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {attendanceRecords.map((record) => (
                  <Table.Row key={record.id}>
                    <Table.Cell>
                      <VStack align="start" gap={0}>
                        <Text fontWeight="medium">{record.date}</Text>
                        <Text fontSize="xs" color="gray.500">
                          {record.dayOfWeek}
                        </Text>
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      {record.clockIn ? (
                        <Flex align="center" gap={1}>
                          <Icon as={LuLogIn} boxSize={3} color="teal.500" />
                          <Text>{record.clockIn}</Text>
                        </Flex>
                      ) : (
                        <Text color="gray.400">-</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {record.clockOut ? (
                        <Flex align="center" gap={1}>
                          <Icon as={LuLogOut} boxSize={3} color="orange.500" />
                          <Text>{record.clockOut}</Text>
                        </Flex>
                      ) : (
                        <Text color="gray.400">-</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Flex align="center" gap={1}>
                        <Icon as={LuTimer} boxSize={3} color="gray.400" />
                        <Text>{record.breakTime}</Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontWeight="medium">{record.workTime}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge status={record.status} />
                    </Table.Cell>
                    <Table.Cell>
                      {record.status !== "holiday" && (
                        <Button variant="ghost" size="sm" onClick={() => onEditRequest(record.id)}>
                          <Icon as={LuPencil} boxSize={4} />
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </FormCard>
      </Box>
    </Container>
  );
};
