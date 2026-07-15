import { Box, Flex } from "@chakra-ui/react";
import { IssueDot, issueToneEmphasis, resolveIssueTone, StaffWarningIcon } from "../../components";
import type { SPDailyCardViewModel } from "./script";

const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)",
};

export const SectionHeader = ({ label, count, hint }: { label: string; count: number; hint?: string }) => (
  <Flex align="baseline" gap={2} mb={2} px={1}>
    <Box textStyle="caption" fontWeight={700} color="gray.600" letterSpacing="0.04em">
      {label}
    </Box>
    <Box textStyle="caption" color="gray.400" fontWeight={600}>
      {count}
    </Box>
    {hint && (
      <Box textStyle="2xs" color="gray.400" ml="auto">
        {hint}
      </Box>
    )}
  </Flex>
);

const Avatar = ({ name, size = 28 }: { name: string; size?: number }) => (
  <Box
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#f4f4f5",
      color: "#52525b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(size * 0.42),
      fontWeight: 600,
      flexShrink: 0,
    }}
  >
    {name.slice(0, 1)}
  </Box>
);

type DailyCardProps = {
  staffId: string;
  staffName: string;
  viewModel: SPDailyCardViewModel;
  showRestLabel: boolean;
  onTap: () => void;
  hasError?: boolean;
  warningMessages?: string[];
};

export const SPDailyCard = ({
  staffId,
  staffName,
  viewModel,
  showRestLabel,
  onTap,
  hasError = false,
  warningMessages = [],
}: DailyCardProps) => {
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`${staffName}の勤務を編集`}
      onClick={onTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTap();
        }
      }}
      data-tour={`shift-row-${staffId}`}
      w="100%"
      textAlign="left"
      bg={emphasis?.bg ?? "white"}
      borderRadius="lg"
      borderWidth={emphasis ? "2px" : "1px"}
      borderColor={emphasis?.border ?? (viewModel.showRequestMismatch ? "orange.200" : "gray.200")}
      px={3}
      py="10px"
      cursor="pointer"
      _active={{ bg: "gray.50" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Flex align="center" gap={2} mb={2}>
        {tone && <IssueDot tone={tone} />}
        <Avatar name={staffName} size={28} />
        <Box textStyle="sm" fontWeight={600} color="gray.800" flex={1}>
          {staffName}
        </Box>
        <StaffWarningIcon messages={warningMessages} />
        {viewModel.showRequestMismatch && (
          <Box
            textStyle="2xs"
            fontWeight={700}
            px={2}
            py="1px"
            style={{ color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 999 }}
          >
            希望あり
          </Box>
        )}
        {viewModel.assignedTimeLabel && (
          <Box textStyle="caption" fontWeight={700} color="teal.700" fontVariantNumeric="tabular-nums">
            {viewModel.assignedTimeLabel}
          </Box>
        )}
        {showRestLabel && (
          <Box textStyle="2xs" color="gray.400">
            休み
          </Box>
        )}
      </Flex>
      <Box position="relative" h="22px" bg="gray.50" borderRadius="md">
        {viewModel.requestedBars.map((bar) => (
          <Box
            key={bar.key}
            position="absolute"
            top={0}
            bottom={0}
            left={`${bar.leftPercentage}%`}
            w={`${bar.widthPercentage}%`}
            border="1.5px dashed #a1a1aa"
            borderRadius="md"
          />
        ))}
        {viewModel.workBars.map((bar) => (
          <Box
            key={bar.key}
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${bar.leftPercentage}%`}
            w={`${bar.widthPercentage}%`}
            bg="teal.500"
            borderRadius="sm"
          />
        ))}
        {viewModel.breakBars.map((bar) => (
          <Box
            key={bar.key}
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${bar.leftPercentage}%`}
            w={`${bar.widthPercentage}%`}
            opacity={0.6}
            style={STRIPE_STYLE}
          />
        ))}
      </Box>
    </Box>
  );
};

export const SPOffCard = ({
  staffId,
  staffName,
  label,
  labelTone,
  onTap,
  isReadOnly,
  hasError = false,
  warningMessages = [],
}: {
  staffId: string;
  staffName: string;
  label: string;
  labelTone: "warning" | "muted";
  onTap: () => void;
  isReadOnly: boolean;
  hasError?: boolean;
  warningMessages?: string[];
}) => {
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
  return (
    <Box
      role={isReadOnly ? undefined : "button"}
      tabIndex={isReadOnly ? undefined : 0}
      aria-label={isReadOnly ? undefined : `${staffName}の勤務を追加`}
      onClick={isReadOnly ? undefined : onTap}
      onKeyDown={
        isReadOnly
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTap();
              }
            }
      }
      data-tour={`shift-row-${staffId}`}
      w="100%"
      display="flex"
      alignItems="center"
      gap="10px"
      p="10px 12px"
      bg={emphasis?.bg ?? "white"}
      borderWidth={emphasis ? "2px" : "1px"}
      borderColor={emphasis?.border ?? "gray.200"}
      borderRadius="md"
      cursor={isReadOnly ? "default" : "pointer"}
      textAlign="left"
      _active={isReadOnly ? undefined : { bg: "gray.50" }}
      _focusVisible={isReadOnly ? undefined : { outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {tone && <IssueDot tone={tone} />}
      <Avatar name={staffName} size={24} />
      <Box textStyle="sm" fontWeight={600} color="gray.600" flex={1}>
        {staffName}
      </Box>
      <StaffWarningIcon messages={warningMessages} />
      <Box textStyle="2xs" fontWeight={600} style={{ color: labelTone === "warning" ? "#b45309" : "#a1a1aa" }}>
        {label}
      </Box>
      {!isReadOnly && (
        <Box fontSize="lg" color="gray.400" lineHeight={1} ml="4px">
          ＋
        </Box>
      )}
    </Box>
  );
};
