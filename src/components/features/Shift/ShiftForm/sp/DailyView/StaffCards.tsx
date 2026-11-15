import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { IssueDot, issueToneEmphasis, resolveIssueTone, StaffWarningIcon } from "../../components";
import { ShiftDateNoteBlock, ShiftStaffNoteIcon } from "../../dateNotes";
import { BreakMark, PositionMark, StaffMeta } from "../../detailParts";
import { detailModeAtom, usesPositionColorsAtom } from "../../stores";
import type { SPDailyCardViewModel } from "./script";

const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)",
};
// 時刻で入れた休憩。ポジションの色の上でも見えるよう、白の斜線を重ねる（PCの日別表示と同じ）。
const EXPLICIT_BREAK_STYLE = {
  backgroundColor: "rgba(255,255,255,0.55)",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(55,65,81,0.55), rgba(55,65,81,0.55) 2px, transparent 2px, transparent 6px)",
};
// 仮の勤務は、点線の枠で確定前の候補であることを示す。
const PROVISIONAL_BAR_PROPS = { outline: "1.5px dashed rgba(255,255,255,0.9)", outlineOffset: "-3px" };

/** スタッフ名。くわしく表示のときだけ、名前の下に熟練度・仮・合計の印を添える。 */
const StaffNameBlock = ({
  staff,
  shift,
  children,
}: {
  staff: StaffType | undefined;
  shift: ShiftData | undefined;
  /** シンプル表示と同じ見た目の名前。 */
  children: (layout: { flex?: number }) => ReactNode;
}) => {
  const detailMode = useAtomValue(detailModeAtom);
  if (!detailMode || !staff) return children({ flex: 1 });
  return (
    <Flex direction="column" gap="2px" flex={1} minW={0}>
      {children({})}
      <StaffMeta staff={staff} shift={shift} />
    </Flex>
  );
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
  /** くわしく表示で印を出すためのスタッフと、その日の勤務。 */
  staff?: StaffType;
  shift?: ShiftData;
  viewModel: SPDailyCardViewModel;
  onTap: () => void;
  hasError?: boolean;
  warningMessages?: string[];
  note?: string;
  noteDate: string;
};

export const SPDailyCard = ({
  staffId,
  staffName,
  staff,
  shift,
  viewModel,
  onTap,
  hasError = false,
  warningMessages = [],
  note,
  noteDate,
}: DailyCardProps) => {
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
  const explicitBreakBars = detailMode ? viewModel.explicitBreakBars : [];
  // バーの下に、ポジションの名前と休憩の時刻を文字で出す。色だけに頼らないようにする。
  const showDetailLine = detailMode && viewModel.hasAssignment && (usesPositionColors || explicitBreakBars.length > 0);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`${staffName}の勤務を${viewModel.hasAssignment ? "編集" : "追加"}`}
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
      borderColor={emphasis?.border ?? "gray.200"}
      px={3}
      py="10px"
      cursor="pointer"
      transitionProperty="colors"
      transitionDuration="faster"
      _active={{ bg: tone ? "red.100" : "gray.100", transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Flex align="center" gap={2} mb={2}>
        {tone && <IssueDot tone={tone} />}
        <Avatar name={staffName} size={28} />
        <StaffNameBlock staff={staff} shift={shift}>
          {(layout) => (
            <Box textStyle="sm" fontWeight={600} color="gray.800" {...layout}>
              {staffName}
            </Box>
          )}
        </StaffNameBlock>
        <StaffWarningIcon messages={warningMessages} openOn="tap" />
        <ShiftStaffNoteIcon notes={note ? [{ date: noteDate, note }] : []} openOn="tap" />
        {viewModel.assignedTimeLabel && (
          <Box textStyle="caption" fontWeight={700} color="teal.700" fontVariantNumeric="tabular-nums">
            {viewModel.assignedTimeLabel}
          </Box>
        )}
        {!viewModel.hasAssignment && (
          <Box textStyle="2xs" fontWeight={600} color="gray.400">
            勤務なし
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
            display="flex"
            alignItems="center"
            px="6px"
            overflow="hidden"
          >
            {bar.label && (
              <Text
                textStyle="2xs"
                fontWeight={600}
                color="gray.500"
                whiteSpace="nowrap"
                fontVariantNumeric="tabular-nums"
                truncate
              >
                {bar.label}
              </Text>
            )}
          </Box>
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
            style={usesPositionColors ? { background: bar.color } : undefined}
            {...(detailMode && shift?.isProvisional ? PROVISIONAL_BAR_PROPS : undefined)}
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
        {explicitBreakBars.map((bar) => (
          <Box
            key={bar.key}
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${bar.leftPercentage}%`}
            w={`${bar.widthPercentage}%`}
            style={EXPLICIT_BREAK_STYLE}
          />
        ))}
      </Box>
      {showDetailLine && (
        <Flex mt="6px" columnGap={3} rowGap="2px" flexWrap="wrap" align="center" color="gray.700">
          {usesPositionColors &&
            viewModel.workBars.map((bar) => (
              <Flex key={bar.key} align="center" gap="6px" minW={0}>
                <PositionMark segment={bar} />
                {viewModel.workBars.length > 1 && (
                  <Box textStyle="2xs" color="gray.600" fontVariantNumeric="tabular-nums" flexShrink={0}>
                    {bar.timeLabel}
                  </Box>
                )}
              </Flex>
            ))}
          <BreakMark shift={shift} />
        </Flex>
      )}
      {note && <ShiftDateNoteBlock note={note} />}
    </Box>
  );
};

export const SPOffCard = ({
  staffId,
  staffName,
  staff,
  label,
  labelTone,
  onTap,
  isReadOnly,
  hasError = false,
  warningMessages = [],
  note,
  noteDate,
}: {
  staffId: string;
  staffName: string;
  /** くわしく表示で印を出すためのスタッフ。 */
  staff?: StaffType;
  label: string;
  labelTone: "warning" | "muted";
  onTap: () => void;
  isReadOnly: boolean;
  hasError?: boolean;
  warningMessages?: string[];
  note?: string;
  noteDate: string;
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
      p="10px 12px"
      bg={emphasis?.bg ?? "white"}
      borderWidth={emphasis ? "2px" : "1px"}
      borderColor={emphasis?.border ?? "gray.200"}
      borderRadius="md"
      cursor={isReadOnly ? "default" : "pointer"}
      textAlign="left"
      transitionProperty="colors"
      transitionDuration="faster"
      _active={isReadOnly ? undefined : { bg: tone ? "red.100" : "gray.100", transitionDuration: "0ms" }}
      _focusVisible={isReadOnly ? undefined : { outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Flex align="center" gap="10px">
        {tone && <IssueDot tone={tone} />}
        <Avatar name={staffName} size={24} />
        <StaffNameBlock staff={staff} shift={undefined}>
          {(layout) => (
            <Box textStyle="sm" fontWeight={600} color="gray.600" {...layout}>
              {staffName}
            </Box>
          )}
        </StaffNameBlock>
        <StaffWarningIcon messages={warningMessages} openOn="tap" />
        <ShiftStaffNoteIcon notes={note ? [{ date: noteDate, note }] : []} openOn="tap" />
        <Box textStyle="2xs" fontWeight={600} style={{ color: labelTone === "warning" ? "#b45309" : "#a1a1aa" }}>
          {label}
        </Box>
        {!isReadOnly && (
          <Box fontSize="lg" color="gray.400" lineHeight={1} ml="4px">
            ＋
          </Box>
        )}
      </Flex>
      {note && <ShiftDateNoteBlock note={note} />}
    </Box>
  );
};
