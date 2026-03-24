import { Flex, Icon, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { PeakBand, ShiftData } from "../../types";
import { calculateDayStaffingStatus } from "../../utils/staffingAlerts";

type PeakBandAlertProps = {
  shifts: ShiftData[];
  date: string;
  peakBands?: PeakBand[];
  minimumStaff?: number;
};

export const PeakBandAlert = ({ shifts, date, peakBands, minimumStaff }: PeakBandAlertProps) => {
  const status = useMemo(
    () => calculateDayStaffingStatus({ shifts, date, peakBands, minimumStaff }),
    [shifts, date, peakBands, minimumStaff],
  );

  // ピーク帯未設定なら何も表示しない
  if (status.peakBandStatuses.length === 0 && status.minimumStaffStatus === null) return null;

  return (
    <Flex
      bg={status.isFullySatisfied ? "green.50" : "orange.50"}
      borderBottom="1px solid"
      borderColor={status.isFullySatisfied ? "green.100" : "orange.100"}
      px={4}
      py={2}
      gap={4}
      align="center"
      flexWrap="wrap"
      flexShrink={0}
    >
      {/* ピーク帯ステータス */}
      {status.peakBandStatuses.map((band) => (
        <Flex key={`${band.startTime}-${band.endTime}`} align="center" gap={1.5}>
          {band.isSatisfied ? (
            <Icon as={LuCircleCheck} color="green.500" boxSize={4} />
          ) : (
            <Icon as={LuTriangleAlert} color="orange.500" boxSize={4} />
          )}
          <Text fontSize="sm" fontWeight="medium" color={band.isSatisfied ? "green.700" : "orange.700"}>
            {band.startTime}〜{band.endTime}
          </Text>
          {!band.isSatisfied && (
            <Text fontSize="sm" color="orange.600">
              あと{band.shortfall}人
            </Text>
          )}
        </Flex>
      ))}

      {/* 最低人員ステータス */}
      {status.minimumStaffStatus && (
        <Flex align="center" gap={1.5}>
          {status.minimumStaffStatus.isSatisfied ? (
            <Icon as={LuCircleCheck} color="green.500" boxSize={4} />
          ) : (
            <Icon as={LuTriangleAlert} color="orange.500" boxSize={4} />
          )}
          <Text
            fontSize="sm"
            fontWeight="medium"
            color={status.minimumStaffStatus.isSatisfied ? "green.700" : "orange.700"}
          >
            最低人員
          </Text>
          {!status.minimumStaffStatus.isSatisfied && (
            <Text fontSize="sm" color="orange.600">
              あと{status.minimumStaffStatus.requiredCount - status.minimumStaffStatus.actualMinCount}人
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  );
};
