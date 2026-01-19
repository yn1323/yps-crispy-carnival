import { Badge, Box, Button, Card, Container, Flex, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useState } from "react";
import { LuCalendarCheck, LuClipboardList, LuUser } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";

type ShiftRequestType = {
  _id: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
};

type StaffWithRequestsType = {
  staffId: string;
  staffName: string;
  status: "applied" | "not_applied";
  requests: ShiftRequestType[];
  totalDays: number;
  totalHours: number;
};

type RecruitmentInfoType = {
  _id: string;
  startDate: string;
  endDate: string;
  deadline: string;
  status: "open" | "closed" | "confirmed";
};

type RequestStatusProps = {
  shopId: string;
  recruitmentId: string;
  recruitment: RecruitmentInfoType;
  staffsWithRequests: StaffWithRequestsType[];
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "全て" },
  { value: "applied", label: "申請済み" },
  { value: "not_applied", label: "未申請" },
];

const STATUS_CONFIG = {
  applied: { label: "申請済み", colorPalette: "teal" },
  not_applied: { label: "未申請", colorPalette: "gray" },
} as const;

export const RequestStatus = ({ shopId, recruitmentId, recruitment, staffsWithRequests }: RequestStatusProps) => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredStaffs = staffsWithRequests.filter((staff) => {
    if (statusFilter === "all") return true;
    return staff.status === statusFilter;
  });

  const appliedCount = staffsWithRequests.filter((s) => s.status === "applied").length;
  const totalCount = staffsWithRequests.length;

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    return `${start.format("M/D(ddd)")}〜${end.format("M/D(ddd)")}`;
  };

  const handleCloseRecruitment = () => {
    // TODO: useMutation呼び出し
    console.log("募集を締め切る:", recruitmentId);
    toaster.create({
      description: "募集を締め切りました",
      type: "success",
    });
  };

  const handleGoToConfirm = () => {
    navigate({
      to: "/shops/$shopId/shifts/recruitments/$recruitmentId/confirm",
      params: { shopId, recruitmentId },
    });
  };

  return (
    <Container maxW="6xl">
      <Title prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuClipboardList} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              申請状況確認
            </Heading>
            <Text color="gray.500" fontSize="sm">
              {formatDateRange(recruitment.startDate, recruitment.endDate)}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* フィルターエリア */}
      <Flex
        mb={4}
        gap={4}
        direction={{ base: "column", sm: "row" }}
        justify="space-between"
        align={{ base: "stretch", sm: "center" }}
      >
        <Select
          items={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          w={{ base: "full", md: "180px" }}
        />
        <Text color="gray.600" fontSize="sm" fontWeight="medium">
          申請済み: {appliedCount}/{totalCount}名
        </Text>
      </Flex>

      {/* スタッフ一覧 */}
      {filteredStaffs.length === 0 ? (
        <Empty icon={LuUser} title="該当するスタッフがいません" description="フィルター条件を変更してください" />
      ) : (
        <VStack gap={3} align="stretch">
          {filteredStaffs.map((staff) => (
            <StaffRequestCard key={staff.staffId} staff={staff} />
          ))}
        </VStack>
      )}

      {/* アクションボタン */}
      <Flex
        mt={6}
        gap={3}
        direction={{ base: "column", sm: "row" }}
        justify="flex-end"
        borderTop="1px solid"
        borderColor="gray.200"
        pt={6}
      >
        {recruitment.status === "open" && (
          <Button
            variant="outline"
            colorPalette="orange"
            onClick={handleCloseRecruitment}
            w={{ base: "full", sm: "auto" }}
          >
            募集を締め切る
          </Button>
        )}
        <Button colorPalette="teal" onClick={handleGoToConfirm} w={{ base: "full", sm: "auto" }}>
          シフト確定へ進む
        </Button>
      </Flex>
    </Container>
  );
};

// スタッフカードコンポーネント
const StaffRequestCard = ({ staff }: { staff: StaffWithRequestsType }) => {
  const statusConfig = STATUS_CONFIG[staff.status];

  return (
    <Card.Root borderWidth={0} shadow="sm" _hover={{ shadow: "md" }} transition="all 0.15s">
      <Card.Body p={{ base: 3, md: 4 }}>
        <Flex justify="space-between" align="flex-start" mb={2}>
          <Flex align="center" gap={2}>
            <Icon as={LuUser} color="gray.500" />
            <Text fontWeight="bold" color="gray.900">
              {staff.staffName}
            </Text>
          </Flex>
          <Badge colorPalette={statusConfig.colorPalette} size="sm">
            {statusConfig.label}
          </Badge>
        </Flex>

        {staff.status === "applied" && staff.requests.length > 0 ? (
          <Box>
            <VStack align="stretch" gap={1} mb={2}>
              {staff.requests.map((request) => (
                <Flex key={request._id} align="center" gap={2}>
                  <Icon as={LuCalendarCheck} color="teal.500" boxSize={4} />
                  <Text fontSize="sm" color="gray.600">
                    {dayjs(request.date).format("M/D(ddd)")} {request.startTime}-{request.endTime}
                  </Text>
                </Flex>
              ))}
            </VStack>
            <Text fontSize="xs" color="gray.500">
              計: {staff.totalDays}日 / {staff.totalHours}時間
            </Text>
          </Box>
        ) : (
          <Text fontSize="sm" color="gray.400">
            申請なし
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
};
