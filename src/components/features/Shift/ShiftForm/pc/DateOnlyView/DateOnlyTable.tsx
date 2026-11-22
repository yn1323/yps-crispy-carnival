import { Box, chakra, Flex, Menu, Portal, Text, VisuallyHidden } from "@chakra-ui/react";
import { useState } from "react";
import { LuChartGantt, LuChevronDown } from "react-icons/lu";
import { formatDateWithWeekday, getWeekdayLabel } from "@/src/domains/shift/date";
import type { PositionType, StaffType } from "@/src/domains/shift/types";
import { AssignmentPill, FoldedStaffGroupToggle, PositionStaffingCount } from "../../assignmentCellParts";
import { Avatar, StaffWarningIcon } from "../../components";
import { ShiftDateNoteCornerMark, ShiftStaffNoteIcon } from "../../dateNotes";
import {
  type DateOnlyCellPresentation,
  type DateOnlyNotePresentation,
  type DateOnlyStaffingPresentation,
  type DateOnlyWeekColumnPresentation,
  type DateOnlyWeekPresentation,
  type DateOnlyWeekRowPresentation,
  toDateOnlyWeekWarningMessages,
} from "../../dateOnlyPresentation";
import { ProvisionalBadge } from "../../detailParts";
import { DayTemplateMenuItems, useDayStaffingEditor } from "../../staffingParts";
import type { DayStaffingView, PositionStaffingCountPresentation } from "../../staffingPresentation";
import { getShiftWeekdayColor } from "../../weekdayPresentation";
import { PositionMenuCell } from "../PositionMenuCell";

const STAFF_COL_WIDTH = 200;
// 日付の列は、残りの横幅を7日で等分する。画面が狭いときも、この幅までは縮めず横に送る。
const DATE_COL_MIN_WIDTH = 88;
// 連絡事項の列は右端に置き、幅を決めておく。長い連絡事項は折り返す。
const NOTE_COL_WIDTH = 280;
// 割り当ての前後で行の高さを変えないよう、行の高さを決めておく。連絡事項が長い人の行だけ高くなる。
const ROW_HEIGHT = "40px";
// 期間外の日と定休日は、列ごと灰色にする。
const INACTIVE_COLUMN_BG = "gray.100";

type Props = {
  presentation: DateOnlyWeekPresentation;
  /** 日ごとの「配置/必要」。くわしく表示のときだけ渡す。 */
  staffing: DateOnlyStaffingPresentation | null;
  /** 日ごとの人数。その日のテンプレートのメニューに使う。 */
  staffingViews: ReadonlyMap<string, DayStaffingView>;
  isReadOnly: boolean;
  /** ポジションを塗り分ける表示かどうか。見出しの分数に色の丸を添える。 */
  usesPositionColors: boolean;
  /** 割り当て済みのピルを押したときに、ポジションのメニューを開くか。開かない表示では、押すたびに付け外しする。 */
  isPositionSelectable: boolean;
  positions: readonly PositionType[];
  /** 連絡事項の列を出すか。連絡事項が1件もない募集と、表示設定で隠した場合は出さない。 */
  showsNoteColumn: boolean;
  noteCountByDate: ReadonlyMap<string, number>;
  onAssign: (staff: StaffType, date: string) => void;
  onChangePosition: (staff: StaffType, date: string, positionId: string) => void;
  onRemove: (staff: StaffType, date: string) => void;
};

export const DateOnlyTable = ({
  presentation,
  staffing,
  staffingViews,
  isReadOnly,
  usesPositionColors,
  isPositionSelectable,
  positions,
  showsNoteColumn,
  noteCountByDate,
  onAssign,
  onChangePosition,
  onRemove,
}: Props) => {
  const { columns, rows, foldedGroup } = presentation;
  const [isFoldedGroupOpen, setFoldedGroupOpen] = useState(false);
  const tableMinWidth = STAFF_COL_WIDTH + columns.length * DATE_COL_MIN_WIDTH + (showsNoteColumn ? NOTE_COL_WIDTH : 0);

  const renderCell = (row: DateOnlyWeekRowPresentation, cell: DateOnlyCellPresentation) => {
    if (isReadOnly) return <AssignmentPill cell={cell} size="week" isInteractive={false} showsNoticeTooltip />;
    if (!cell.assigned) {
      return (
        <AssignmentPill
          cell={cell}
          size="week"
          isInteractive
          showsNoticeTooltip
          onClick={() => onAssign(row.staff, cell.key)}
        />
      );
    }
    const remove = () => onRemove(row.staff, cell.key);
    // ポジションを選び分けない表示（シンプル表示、ポジションが1つ以下の店舗）では、押すたびに付け外しする。
    if (!isPositionSelectable) {
      return <AssignmentPill cell={cell} size="week" isInteractive showsNoticeTooltip onClick={remove} />;
    }
    return (
      <PositionMenuCell
        cell={cell}
        size="week"
        positions={positions}
        onChangePosition={(positionId) => onChangePosition(row.staff, cell.key, positionId)}
        onRemove={remove}
      />
    );
  };

  const renderRow = (row: DateOnlyWeekRowPresentation) => (
    <Box as="tr" key={row.key}>
      <StaffCell row={row} />
      {row.cells.map((cell) => (
        <Box
          as="td"
          key={cell.key}
          position="relative"
          h={ROW_HEIGHT}
          px="4px"
          py={0}
          borderBottomWidth="1px"
          borderColor="gray.100"
          bg={cell.status === "open" ? "white" : INACTIVE_COLUMN_BG}
        >
          {/* 期間外の日と定休日は、セルに何も描かない。 */}
          {cell.status === "open" && <Flex justify="center">{renderCell(row, cell)}</Flex>}
          {cell.status === "open" && cell.hasNote && <ShiftDateNoteCornerMark onFilled={false} />}
        </Box>
      ))}
      {showsNoteColumn && <NoteListCell notes={row.notes} />}
    </Box>
  );

  return (
    // 見出しの行を上端に留めるため、内側で切り取らない。
    <Box minW={`${tableMinWidth}px`} bg="white">
      <Box as="table" w="100%" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
        <Box as="colgroup">
          <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
          {columns.map((column) => (
            <Box as="col" key={column.key} />
          ))}
          {showsNoteColumn && <Box as="col" style={{ width: NOTE_COL_WIDTH }} />}
        </Box>
        <Box as="thead" position="sticky" top={0} zIndex={5}>
          <Box as="tr">
            <chakra.th
              position="sticky"
              left={0}
              zIndex={1}
              px={4}
              py={2}
              textAlign="left"
              verticalAlign="bottom"
              bg="white"
              borderBottomWidth="1px"
              borderColor="gray.200"
              textStyle="xs"
              fontWeight={600}
              color="gray.600"
            >
              スタッフ
            </chakra.th>
            {columns.map((column) => (
              <DateHeaderCell
                key={column.key}
                column={column}
                noteCount={noteCountByDate.get(column.key) ?? 0}
                counts={staffing?.countsByDate.get(column.key) ?? null}
                showsStaffing={staffing !== null}
                showsDot={usesPositionColors}
                staffingView={staffingViews.get(column.key)}
              />
            ))}
            {showsNoteColumn && (
              <chakra.th
                px={3}
                py={2}
                textAlign="left"
                verticalAlign="bottom"
                bg="white"
                borderBottomWidth="1px"
                borderColor="gray.200"
                textStyle="xs"
                fontWeight={600}
                color="gray.600"
              >
                連絡事項
              </chakra.th>
            )}
          </Box>
        </Box>
        <Box as="tbody">
          {rows.map(renderRow)}
          {foldedGroup && (
            <Box as="tr">
              <chakra.td
                colSpan={columns.length + 1 + (showsNoteColumn ? 1 : 0)}
                p={0}
                borderBottomWidth="1px"
                borderColor="gray.100"
              >
                {/* 横に送っても見出しが左に残るよう、表示している幅に留める。 */}
                <Box position="sticky" left={0} maxW="min(100%, 720px)">
                  <FoldedStaffGroupToggle
                    group={foldedGroup}
                    isOpen={isFoldedGroupOpen}
                    onToggle={() => setFoldedGroupOpen((current) => !current)}
                  />
                </Box>
              </chakra.td>
            </Box>
          )}
          {isFoldedGroupOpen && foldedGroup?.rows.map(renderRow)}
        </Box>
      </Box>
    </Box>
  );
};

/**
 * 日付の見出し。日付と曜日の下に、シンプル表示では人数、くわしく表示ではポジションごとの「配置/必要」とその日のテンプレートを出す。
 */
const DateHeaderCell = ({
  column,
  noteCount,
  counts,
  showsStaffing,
  showsDot,
  staffingView,
}: {
  column: DateOnlyWeekColumnPresentation;
  /** その日の連絡事項の件数。読み上げにだけ使う。 */
  noteCount: number;
  /** その日の「配置/必要」。定休日と期間外の日はnull。 */
  counts: PositionStaffingCountPresentation[] | null;
  /** くわしく表示かどうか。人数の代わりに「配置/必要」を出す。 */
  showsStaffing: boolean;
  showsDot: boolean;
  staffingView: DayStaffingView | undefined;
}) => {
  const { date, status } = column;
  const isOpen = status === "open";
  const label = (
    <Flex align="baseline" justify="center" gap="4px">
      <Box
        as="span"
        textStyle="sm"
        fontWeight={700}
        color={isOpen ? "gray.800" : "gray.500"}
        fontVariantNumeric="tabular-nums"
      >
        {Number(date.iso.slice(8))}
      </Box>
      <Box
        as="span"
        textStyle="xs"
        fontWeight={600}
        style={{ color: isOpen ? getShiftWeekdayColor(date.iso) : undefined }}
        color={isOpen ? undefined : "gray.500"}
      >
        {getWeekdayLabel(date.iso)}
      </Box>
      {noteCount > 0 && <VisuallyHidden>連絡事項{noteCount}件</VisuallyHidden>}
    </Flex>
  );
  return (
    <chakra.th
      data-date-header={date.iso}
      p={0}
      verticalAlign="top"
      bg={isOpen ? "white" : INACTIVE_COLUMN_BG}
      borderBottomWidth="1px"
      borderColor="gray.200"
      fontWeight={600}
      // 中身を見出しの行の高さいっぱいに広げ、テンプレートを下端にそろえるため、セルの高さを最小にしておく。
      // 表のセルは、中身より低い高さを指定しても中身に合わせて伸びる。
      h="1px"
    >
      <Flex direction="column" h="full">
        <Box px={1} pt={2} pb={1}>
          {label}
        </Box>
        <Flex direction="column" align="center" gap="2px" px={1} pb={2} flex={1}>
          {!isOpen ? (
            <Text textStyle="2xs" fontWeight={600} color="gray.500">
              {status === "closed" ? "定休日" : "期間外"}
            </Text>
          ) : showsStaffing ? (
            <>
              {/* ポジションは横に並べ、列の幅が足りないときだけ折り返す。
                  必要人数がなく、だれも入っていないポジションは並べず、残りを中央に寄せる。 */}
              <Flex align="center" justify="center" columnGap={2} rowGap="2px" flexWrap="wrap">
                {(counts ?? [])
                  .filter((count) => count.label !== null)
                  .map((count) => (
                    <PositionStaffingCount key={count.positionId} count={count} showsDot={showsDot} />
                  ))}
              </Flex>
              {/* ポジションの数が少ない日や、テンプレートのない日も、テンプレートを見出しの下端にそろえる。 */}
              {staffingView && (
                <Flex mt="auto" w="full" justify="center" data-day-template>
                  <DayTemplateTrigger date={date.iso} view={staffingView} />
                </Flex>
              )}
            </>
          ) : (
            <Text textStyle="xs" fontWeight={700} color="gray.700" fontVariantNumeric="tabular-nums">
              {column.countLabel}
            </Text>
          )}
        </Flex>
      </Flex>
    </chakra.th>
  );
};

/**
 * 「配置/必要」の下に小さく置く、その日のテンプレートの名前。押すと、その日のテンプレートを選ぶメニューが開く。
 * 閲覧専用と確定済みでは、名前だけを出す。その日だけの指定は、塗って見分ける。
 */
const DayTemplateTrigger = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const editor = useDayStaffingEditor();
  const name = (
    <Box
      as="span"
      truncate
      title={view.template.label}
      px={view.template.isDateSpecific ? "4px" : 0}
      borderRadius="sm"
      bg={view.template.isDateSpecific ? "gray.700" : undefined}
      color={view.template.isDateSpecific ? "white" : "gray.600"}
    >
      {view.template.label}
    </Box>
  );
  if (!editor) {
    return (
      <Flex as="span" maxW="100%" minW={0} textStyle="2xs" fontWeight={600}>
        <chakra.span srOnly>この日のテンプレート: </chakra.span>
        {name}
      </Flex>
    );
  }
  // その日だけ別のテンプレートを当てた日は、色だけに頼らず、読み上げる名前でも伝える。
  const templateLabel = `${view.template.label}${view.template.isDateSpecific && !view.template.isCustom ? "（この日だけ）" : ""}`;
  return (
    <Menu.Root positioning={{ placement: "bottom", gutter: 4 }}>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${formatDateWithWeekday(date)}のテンプレート: ${templateLabel}`}
          // 列の幅いっぱいに広げ、アイコンを左、名前を中央、開く印を右の端に置く。
          display="grid"
          gridTemplateColumns="auto minmax(0, 1fr) auto"
          alignItems="center"
          gap="2px"
          w="100%"
          minW={0}
          minH="24px"
          px="4px"
          borderRadius="sm"
          textStyle="2xs"
          fontWeight={600}
          color="gray.600"
          // 押せる場所だと分かるよう、ふだんから薄い地を付ける。
          bg="blackAlpha.50"
          cursor="pointer"
          transitionProperty="background"
          transitionDuration="faster"
          _hover={{ bg: "blackAlpha.100" }}
          _active={{ bg: "blackAlpha.200", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
        >
          {/* ほかの画面のテンプレートと同じ時間帯の横棒のアイコンで、必要人数のテンプレートだと分かるようにする。 */}
          <Box as="span" display="flex" color="gray.500">
            <LuChartGantt size={12} aria-hidden />
          </Box>
          <Flex as="span" justify="center" minW={0}>
            {name}
          </Flex>
          <Box as="span" display="flex">
            <LuChevronDown size={12} aria-hidden />
          </Box>
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(260px, calc(100vw - 24px))">
            <DayTemplateMenuItems date={date} view={view} />
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

const StaffCell = ({ row }: { row: DateOnlyWeekRowPresentation }) => (
  <Box
    as="td"
    position="sticky"
    left={0}
    zIndex={2}
    h={ROW_HEIGHT}
    px={4}
    py={0}
    bg="white"
    borderBottomWidth="1px"
    borderColor="gray.100"
  >
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={row.staff} size={24} />
      <Text textStyle="sm" fontWeight={500} color={row.isNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
        {row.staffName}
      </Text>
      {/* 仮の勤務は、名前の横の「仮」だけで示す。点線は希望の輪に使うためである。 */}
      {row.isProvisional && <ProvisionalBadge />}
      {row.isUnsubmitted && (
        <Text textStyle="2xs" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
          未提出
        </Text>
      )}
      {/* セルの右上の点と同じ確認事項を、名前の右でもまとめて知らせる。 */}
      <StaffWarningIcon messages={toDateOnlyWeekWarningMessages(row)} />
      {/* 連絡事項の列を表示設定で隠したときだけ、名前の横のアイコンで知らせる。 */}
      <ShiftStaffNoteIcon notes={row.notes} showDates />
    </Flex>
  </Box>
);

/** 表示中の週の連絡事項。1件ごとに改行し、先頭に日付を太字で付ける。行数は制限せず、全文を出す。 */
const NoteListCell = ({ notes }: { notes: DateOnlyNotePresentation[] }) => (
  <Box as="td" px={3} py={notes.length > 0 ? 2 : 0} borderBottomWidth="1px" borderColor="gray.100" bg="white">
    {notes.length > 0 && (
      <Box as="ul" listStyleType="none">
        {notes.map(({ date, dateLabel, note }) => (
          <Flex as="li" key={date} gap={2} align="baseline" minW={0}>
            <Text
              as="span"
              textStyle="sm"
              fontWeight={700}
              color="gray.800"
              fontVariantNumeric="tabular-nums"
              flexShrink={0}
            >
              {dateLabel}
            </Text>
            <Text
              as="span"
              textStyle="sm"
              lineHeight={1.6}
              color="gray.700"
              minW={0}
              overflowWrap="anywhere"
              data-clarity-mask="true"
            >
              {note}
            </Text>
          </Flex>
        ))}
      </Box>
    )}
  </Box>
);
