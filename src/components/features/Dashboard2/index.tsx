import { Box, Stack } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import type { Recruitment, Staff } from "@/src/components/features/Dashboard/types";
import { HeroSummary } from "./HeroSummary";
import { RecruitmentBoard } from "./RecruitmentBoard";
import { StaffRoster } from "./StaffRoster";

type Props = {
  shop: { name: string; shiftStartTime: string; shiftEndTime: string } | null;
  recruitments: Recruitment[];
  recruitmentStatus: PaginationStatus;
  loadMoreRecruitments: () => void;
  staffs: Staff[];
  staffStatus: PaginationStatus;
  loadMoreStaffs: () => void;
};

export const DashboardContent2 = ({
  shop,
  recruitments,
  recruitmentStatus,
  loadMoreRecruitments,
  staffs,
  staffStatus,
  loadMoreStaffs,
}: Props) => {
  return (
    <Box bg="gray.50" minH="100%" py={{ base: 6, lg: 10 }} px={{ base: 4, lg: 6 }}>
      <Stack maxW="1024px" w="full" mx="auto" gap={{ base: 8, lg: 12 }}>
        <HeroSummary
          shop={shop}
          recruitments={recruitments}
          onEditClick={() => {}}
          onSetupClick={() => {}}
          onOpenShiftBoard={() => {}}
          onCreateRecruitment={() => {}}
        />
        {shop && (
          <>
            <RecruitmentBoard
              recruitments={recruitments}
              status={recruitmentStatus}
              onCreateClick={() => {}}
              onOpenShiftBoard={() => {}}
              onLoadMore={loadMoreRecruitments}
            />
            <StaffRoster
              staffs={staffs}
              status={staffStatus}
              onAddClick={() => {}}
              onMenuClick={() => {}}
              onLoadMore={loadMoreStaffs}
            />
          </>
        )}
      </Stack>
    </Box>
  );
};
