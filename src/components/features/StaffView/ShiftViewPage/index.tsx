import { Box, Flex, Text } from "@chakra-ui/react";
import type { Id } from "@/convex/_generated/dataModel";
import { FooterInfo } from "../FooterInfo";
import { PeriodBar } from "../PeriodBar";

type Assignment = {
  staffId: Id<"staffs">;
  date: string;
  startTime: string;
  endTime: string;
};

type Staff = {
  _id: Id<"staffs">;
  name: string;
};

type Props = {
  periodLabel: string;
  staffs: Staff[];
  assignments: Assignment[];
};

export const ShiftViewPage = ({ periodLabel, staffs, assignments }: Props) => {
  return (
    <Flex direction="column" h="full" minH={0}>
      <PeriodBar periodLabel={periodLabel} />

      {/* ShiftTable プレースホルダー */}
      <Flex
        flex={1}
        mx={4}
        mb={4}
        align="center"
        justify="center"
        direction="column"
        gap={1}
        borderWidth={2}
        borderColor="border"
        borderRadius="lg"
        bg="bg.muted"
      >
        <Text fontSize="md" color="fg.subtle" fontWeight="medium">
          ShiftTable
        </Text>
        <Text fontSize="xs" color="fg.subtle">
          （{staffs.length}名 / {assignments.length}件）
        </Text>
      </Flex>

      <Box mt="auto">
        <FooterInfo />
      </Box>
    </Flex>
  );
};
