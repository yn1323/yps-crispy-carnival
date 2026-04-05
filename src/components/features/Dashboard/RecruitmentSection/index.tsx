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
        <Heading size={{ base: "md", lg: "lg" }}>募集</Heading>
        <Button size="sm" colorPalette="teal" onClick={onCreateClick}>
          <LuCalendarPlus />
          新しい募集を作成
        </Button>
      </Flex>
      {recruitments.length === 0 ? (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
          <Empty
            icon={LuClipboardList}
            title="募集がありません"
            description="新しい募集を作成して、スタッフのシフトを集めましょう"
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
