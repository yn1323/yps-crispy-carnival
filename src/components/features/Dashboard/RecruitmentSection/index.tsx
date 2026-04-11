import { Box, Button, Flex, Heading, Stack } from "@chakra-ui/react";
import { LuCalendarPlus, LuClipboardList } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { RecruitmentCard } from "../RecruitmentCard";
import type { Recruitment } from "../types";

type Props = {
  recruitments: Recruitment[];
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

export const RecruitmentSection = ({ recruitments, onCreateClick, onOpenShiftBoard }: Props) => {
  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center">
        <Heading size={{ base: "md", lg: "lg" }}>シフト</Heading>
        <Button size="sm" colorPalette="teal" onClick={onCreateClick}>
          <LuCalendarPlus />
          シフト希望を集める
        </Button>
      </Flex>
      {recruitments.length === 0 ? (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
          <Empty
            icon={LuClipboardList}
            title="シフトがありません"
            description="新しいシフトを作成して、スタッフの希望を集めましょう"
            minH="160px"
          />
        </Box>
      ) : (
        <Stack gap={3}>
          {recruitments.map((recruitment) => (
            <RecruitmentCard key={recruitment._id} recruitment={recruitment} onOpenShiftBoard={onOpenShiftBoard} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
