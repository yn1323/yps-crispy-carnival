import { Box, Flex, Heading, HStack, Skeleton, Stack } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuChevronDown, LuPlus, LuUsers } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { StaffRow } from "./StaffRow";

type Props = {
  staffs: Staff[];
  status: PaginationStatus;
  canLoadMore: boolean;
  onAddClick: () => void;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  onShowLineQr: (staff: Staff) => void;
  onSendLineInvite: (staff: Staff) => void;
  onSendRecruitments: (staff: Staff) => void;
  onSendCurrentShift: (staff: Staff) => void;
  hasCurrentShift: boolean;
  onLoadMore: () => void;
};

export const StaffRoster = ({
  staffs,
  status,
  canLoadMore,
  onAddClick,
  onEdit,
  onDelete,
  onShowLineQr,
  onSendLineInvite,
  onSendRecruitments,
  onSendCurrentShift,
  hasCurrentShift,
  onLoadMore,
}: Props) => {
  const showLoadMore = canLoadMore && status !== "LoadingFirstPage";
  const sorted = [...staffs].sort((a, b) => Number(b.isManager) - Number(a.isManager));

  return (
    <Stack as="section" aria-label="スタッフ一覧" gap={{ base: 4, lg: 5 }}>
      <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
        <Stack gap={1} minW={0}>
          <HStack gap={2.5} align="center">
            <Box color="fg.muted" fontSize={{ base: "xl", lg: "2xl" }}>
              <LuUsers />
            </Box>
            <Heading
              as="h2"
              fontSize={{ base: "lg", lg: "xl" }}
              lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
              fontWeight="bold"
              color="gray.900"
            >
              スタッフ一覧
            </Heading>
          </HStack>
        </Stack>
        <Flex gap={2} wrap="wrap">
          <Button
            data-tour={DASHBOARD_TOUR_TARGET.addStaff}
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={onAddClick}
            gap={1.5}
            fontWeight="semibold"
          >
            <LuPlus />
            スタッフを招待
          </Button>
        </Flex>
      </Flex>

      {sorted.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="まだスタッフはいません"
          description="名前とメールアドレスでスタッフを追加できます。"
          tone="brand"
          variant="section"
        />
      ) : (
        <Box
          bg="white"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="blackAlpha.50"
          boxShadow="xs"
          overflow="hidden"
        >
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.50">
            {sorted.map((s) => (
              <StaffRow
                key={s._id}
                staff={s}
                onEdit={onEdit}
                onDelete={onDelete}
                onShowLineQr={onShowLineQr}
                onSendLineInvite={onSendLineInvite}
                onSendRecruitments={onSendRecruitments}
                onSendCurrentShift={onSendCurrentShift}
                hasCurrentShift={hasCurrentShift}
              />
            ))}
          </Stack>
        </Box>
      )}

      {showLoadMore && (
        <Flex justify="center">
          <Button
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={onLoadMore}
            loading={status === "LoadingMore"}
            gap={1}
          >
            <LuChevronDown />
            もっと見る
          </Button>
        </Flex>
      )}
    </Stack>
  );
};

export const StaffRosterSkeleton = () => (
  <Stack as="section" aria-label="スタッフ一覧を読み込み中" gap={{ base: 4, lg: 5 }}>
    <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
      <HStack gap={2.5} align="center">
        <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
        <Skeleton h={{ base: "28px", lg: "30px" }} w="112px" />
      </HStack>
      <Skeleton h="32px" w={{ base: "120px", md: "132px" }} />
    </Flex>

    <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.50" boxShadow="xs" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.50">
        {Array.from({ length: 5 }).map((_, index) => (
          <StaffRowSkeleton key={index} isManager={index === 0} showLineLinked={index === 0 || index === 2} />
        ))}
      </Stack>
    </Box>
  </Stack>
);

const StaffRowSkeleton = ({ isManager, showLineLinked }: { isManager: boolean; showLineLinked: boolean }) => (
  <HStack
    as="article"
    gap={3}
    px={{ base: 3, lg: 4 }}
    py={3.5}
    align="center"
    bg={isManager ? "teal.50/50" : "transparent"}
    minH="68px"
  >
    <Skeleton boxSize="40px" borderRadius="full" flexShrink={0} />
    <Stack gap={2} flex={1} minW={0}>
      <HStack gap={2} align="center" wrap="wrap">
        <Skeleton h="20px" w={{ base: "96px", lg: "112px" }} />
        {isManager && <Skeleton h="20px" w="52px" borderRadius="full" />}
        {showLineLinked && <Skeleton h="20px" w="78px" borderRadius="full" />}
      </HStack>
      <Skeleton h="16px" w="180px" display={{ base: "none", lg: "block" }} />
    </Stack>
    <Skeleton boxSize="32px" borderRadius="md" flexShrink={0} />
  </HStack>
);
