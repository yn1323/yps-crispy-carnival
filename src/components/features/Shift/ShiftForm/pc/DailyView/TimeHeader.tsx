import { Box, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { TimeRange } from "@/src/domains/shift/types";
import { TIME_AXIS_PADDING_PX } from "../../constants";
import { hourWidthAtom } from "../../stores";

type TimeHeaderProps = {
  timeRange: TimeRange;
};

export const TimeHeader = ({ timeRange }: TimeHeaderProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);

  const timeLabels: { hour: number; x: number }[] = [];
  for (let hour = timeRange.start; hour <= timeRange.end; hour++) {
    const x = TIME_AXIS_PADDING_PX + (hour - timeRange.start) * hourWidth;
    timeLabels.push({ hour, x });
  }

  return (
    <Box position="relative" height="28px" bg="white" w="100%">
      {timeLabels.map(({ hour, x }) => (
        <Text
          key={hour}
          position="absolute"
          left={`${x}px`}
          top="50%"
          transform="translate(-50%, -50%)"
          textStyle="2xs"
          color="gray.500"
          whiteSpace="nowrap"
          fontVariantNumeric="tabular-nums"
        >
          {hour >= 24 ? `翌${hour - 24}:00` : `${hour}:00`}
        </Text>
      ))}
    </Box>
  );
};
