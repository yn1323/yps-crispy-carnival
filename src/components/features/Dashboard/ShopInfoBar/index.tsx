import { HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import { LuSettings } from "react-icons/lu";
import { formatShiftTimeRange } from "../DashboardContent/formatShiftTimeRange";

type Props = {
  name: string;
  shiftStartTime: string;
  shiftEndTime: string;
  onEditClick: () => void;
};

export const ShopInfoBar = ({ name, shiftStartTime, shiftEndTime, onEditClick }: Props) => {
  return (
    <HStack justify="space-between" align="flex-start" w="full">
      <Stack gap={0}>
        <Text fontSize={{ base: "xl", lg: "2xl" }} fontWeight="bold" lineHeight="short">
          {name}
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="short">
          {formatShiftTimeRange(shiftStartTime, shiftEndTime)}
        </Text>
      </Stack>
      <IconButton aria-label="店舗設定を編集" variant="ghost" size="sm" onClick={onEditClick}>
        <LuSettings />
      </IconButton>
    </HStack>
  );
};
