import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { IssueDot, issueToneEmphasis, resolveIssueTone, StaffWarningIcon } from "../../components";
import { ShiftDateNoteBlock, ShiftStaffNoteIcon } from "../../dateNotes";
import { PositionMark } from "../../detailParts";
import { getSPCardPaddingXPx, SP_CARD_BORDER_PX } from "../../spTimelineScale";
import { detailModeAtom, paintsPositionColorAtom, usesPositionColorsAtom } from "../../stores";
import type { SPDailyCardViewModel, SPDailyDetailItem } from "./script";

const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)",
};
// 時刻で入れた休憩。休憩はポジションではないため、ポジションの色を隠し、勤務の間の空きと同じ灰色の斜線にする（PCの日別表示と同じ）。
const EXPLICIT_BREAK_STYLE = {
  backgroundColor: "#f9fafb",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(156,163,175,0.6), rgba(156,163,175,0.6) 3px, transparent 3px, transparent 6px)",
};
// その日の最初と最後の端だけを丸め、勤務と勤務、勤務と休憩の境目は角を付けない。
const WORK_BAR_RADIUS_PROPS = {
  isolated: { borderRadius: "sm" },
  start: { borderLeftRadius: "sm", borderRightRadius: "0" },
  middle: { borderRadius: "0" },
  end: { borderLeftRadius: "0", borderRightRadius: "sm" },
} as const;

/** 内訳の1項目。ポジションは色の丸と名前、休憩はバーと同じ斜線の四角と「休憩」を、時刻の前に置く。 */
const DetailItem = ({ item, showsTime }: { item: SPDailyDetailItem; showsTime: boolean }) => (
  <Flex align="center" gap="6px" minW={0}>
    {item.kind === "position" ? (
      <PositionMark segment={item} />
    ) : (
      <Flex as="span" align="center" gap="4px" textStyle="2xs" fontWeight={600} lineHeight={1.2}>
        <Box
          as="span"
          boxSize="8px"
          borderRadius="2px"
          borderWidth="1px"
          borderColor="gray.400"
          flexShrink={0}
          style={EXPLICIT_BREAK_STYLE}
          aria-hidden
        />
        休憩
      </Flex>
    )}
    {showsTime && (
      <Box textStyle="2xs" color="gray.600" fontVariantNumeric="tabular-nums" flexShrink={0}>
        {item.timeLabel}
      </Box>
    )}
  </Flex>
);

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
  onTap: () => void;
  hasError?: boolean;
  warningMessages?: string[];
  note?: string;
  noteDate: string;
};

export const SPDailyCard = ({
  staffId,
  staffName,
  viewModel,
  onTap,
  hasError = false,
  warningMessages = [],
  note,
  noteDate,
}: DailyCardProps) => {
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const paintsPositionColor = useAtomValue(paintsPositionColorAtom);
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
  const cardBorderPx = emphasis ? 2 : SP_CARD_BORDER_PX;
  const explicitBreakBars = detailMode ? viewModel.explicitBreakBars : [];
  // バーの下に、ポジションと休憩を左から右の順に、時刻つきの文字で出す。色だけに頼らないようにする。
  // ポジションを塗り分けない店舗では、休憩だけを出す。
  const detailItems = usesPositionColors
    ? viewModel.detailItems
    : viewModel.detailItems.filter((item) => item.kind === "break");
  const hasBreakItem = detailItems.some((item) => item.kind === "break");
  const showDetailLine = detailMode && viewModel.hasAssignment && detailItems.length > 0;

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
      borderWidth={`${cardBorderPx}px`}
      borderColor={emphasis?.border ?? "gray.200"}
      // バーの両端を充足の帯にそろえるため、枠線が太くなっても内側の余白で吸収する。
      px={`${getSPCardPaddingXPx(cardBorderPx)}px`}
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
        <Box textStyle="sm" fontWeight={600} color="gray.800" flex={1}>
          {staffName}
        </Box>
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
            {...WORK_BAR_RADIUS_PROPS[bar.edgeShape]}
            style={paintsPositionColor ? { background: bar.color } : undefined}
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
          {detailItems.map((item) => (
            // ポジションが1つだけで休憩もない日は、時刻を右上の勤務時間と重ねて出さない。
            <DetailItem key={item.key} item={item} showsTime={detailItems.length > 1 || hasBreakItem} />
          ))}
        </Flex>
      )}
      {note && <ShiftDateNoteBlock note={note} />}
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
  note,
  noteDate,
}: {
  staffId: string;
  staffName: string;
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
        <Box textStyle="sm" fontWeight={600} color="gray.600" flex={1}>
          {staffName}
        </Box>
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
