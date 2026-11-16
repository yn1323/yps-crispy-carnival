import { Box, chakra, Field, Flex, Grid, Menu, Portal, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuSearchX, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { Input } from "@/src/components/ui/FormControls";
import { PositionDot, SegmentedRadio, SetupCard, SetupSection } from "./parts";
import {
  filterStaffsByName,
  getStaffPositionLevel,
  getStaffPositionLevelLabel,
  getStaffPositionMarkOptions,
  getStaffPositionMarkSymbol,
  getStampedStaffPositionLevel,
  isStaffPositionMarkBlocked,
} from "./staffPositionLevels";
import type {
  ShiftSetupIntents,
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
  StaffPositionMark,
  StaffPositionMarkChange,
} from "./types";

/** 説明文。操作の仕方、印のない場合の扱い、シフト表での見え方の順に並べる。閲覧専用では、操作の仕方を出さない。 */
const DESCRIPTION = {
  howTo: "付ける印を選んでスタッフのポジションを押すと印が付き、もう一度押すと外れます。",
  noMark: "印のないポジションは標準です。",
};
const SINGLE_POSITION_DESCRIPTION = {
  howTo: "付ける印を選んでスタッフの熟練度を押すと印が付き、もう一度押すと外れます。",
  noMark: "印のないスタッフは標準です。",
};
const SHIFT_BOARD_NOTE = "新人と責任者の印は、シフト表にも出ます。";
const LAST_POSITION_REASON = "入れるポジションは1つ以上必要です";
/** ポジションが1件の店舗で、ポジションの名前の代わりに出す見出し。 */
const SINGLE_POSITION_LABEL = "熟練度";
/** PCで上端に留める、付ける印の行の高さ（px）。表の見出しの行は、この行のすぐ下に留める。 */
const MARK_BAR_HEIGHT_PX = 52;
const MENU_ITEM_PROPS = { cursor: "pointer", minH: { base: "44px", md: "36px" }, px: 3, py: 2 } as const;
const STICKY_TRANSITION = {
  transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
} as const;

/**
 * 印の配色。新人と責任者の色は、シフト表の印にそろえる。印は必ず文字でも出す。
 * `surface`は、スマートフォンでポジションの名前ごと囲むマスの地の色。
 */
const MARK_STYLES: Record<StaffPositionMark, { bg: string; color: string; surface: string }> = {
  newcomer: { bg: "orange.100", color: "orange.800", surface: "orange.50" },
  lead: { bg: "green.100", color: "green.800", surface: "green.50" },
  unavailable: { bg: "gray.200", color: "gray.700", surface: "gray.100" },
};

type MarkOption = ReturnType<typeof getStaffPositionMarkOptions>[number];
type BulkAction = StaffPositionMarkChange["action"];

type Intents = Pick<ShiftSetupIntents, "onChangeStaffPositionLevel" | "onChangeStaffPositionMarks">;

type Props = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  /** スタッフごとの、編集中の値を反映したポジションごとの値。キーはスタッフID。 */
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  /** 保存の応答を待っている間。値を操作できない状態にする。 */
  isSaving: boolean;
  /** 付ける印の行を留める位置。ページの見出しの行のすぐ下にする。 */
  headerStickyTop: string;
  intents: Intents;
};

/**
 * スタッフの、ポジションごとの熟練度。
 * 付ける印（新人、責任者、入れない）を選んでからマスを押すと、1回の操作で印が付く。
 * 同じ印のマスをもう一度押すと標準へ戻り、別の印のマスは選んでいる印に置き換わる。
 */
export function StaffProfilesSection({
  staffs,
  positions,
  profiles,
  canWrite,
  isSaving,
  headerStickyTop,
  intents,
}: Props) {
  const [nameQuery, setNameQuery] = useState("");
  const [selectedMark, setSelectedMark] = useState<StaffPositionMark>("newcomer");
  // 印を付けられなかったマスを押したときに出す理由。次の操作で消す。
  const [notice, setNotice] = useState<string | null>(null);
  const layout = useBreakpointValue<"narrow" | "wide">({ base: "narrow", md: "wide" }) ?? "wide";

  // ポジションが1件の店舗では、入れるポジションを選ぶ余地がないため、熟練度だけを選ぶ。
  const hasPositionChoice = positions.length > 1;
  const description = hasPositionChoice ? DESCRIPTION : SINGLE_POSITION_DESCRIPTION;
  const markOptions = getStaffPositionMarkOptions(positions);
  // ポジションが1件になって「入れない」を選べなくなったら、最初の印へ戻す。
  const mark = markOptions.find((option) => option.value === selectedMark) ?? markOptions[0];
  const visibleStaffs = filterStaffsByName(staffs, nameQuery);
  const isFiltered = visibleStaffs.length !== staffs.length;

  const stamp = (staff: ShiftSetupStaff, position: ShiftSetupPosition) => {
    const levels = profiles[staff._id] ?? {};
    if (isStaffPositionMarkBlocked(levels, position._id, mark.value, positions)) {
      setNotice(`${staff.name}さんが入れるポジションは1つ以上必要です`);
      return;
    }
    setNotice(null);
    intents.onChangeStaffPositionLevel(
      staff._id,
      position._id,
      getStampedStaffPositionLevel(getStaffPositionLevel(levels, position._id), mark.value),
    );
  };

  const bulk: BulkProps = {
    mark,
    // 名前で絞り込んでいる間は、表示しているスタッフだけを変える。
    scope: isFiltered
      ? `表示中の${visibleStaffs.length}人`
      : visibleStaffs.length === 1
        ? "1人"
        : `${visibleStaffs.length}人全員`,
    staffCount: visibleStaffs.length,
    countMarked: (positionId) =>
      visibleStaffs.filter((staff) => getStaffPositionLevel(profiles[staff._id] ?? {}, positionId) === mark.value)
        .length,
    onChange: (positionId, action) => {
      setNotice(null);
      intents.onChangeStaffPositionMarks({
        positionId,
        staffIds: visibleStaffs.map((staff) => staff._id),
        mark: mark.value,
        action,
      });
    },
  };

  const listProps: ListProps = {
    staffs: visibleStaffs,
    positions,
    profiles,
    canWrite,
    hasPositionChoice,
    mark,
    bulk,
    onStamp: stamp,
  };

  return (
    <SetupSection headingId="shift-setup-staffs-heading" title="スタッフ" step={3} isBusy={isSaving}>
      {staffs.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="シフト対象のスタッフがいません"
          titleAs="h3"
          description="店舗詳細でスタッフを所属させると、ここで熟練度を設定できます。"
          variant="section"
          py={8}
        />
      ) : (
        // 付ける印の行を画面の上端に留めるため、このカードでは角からはみ出す内容を切らない。
        <SetupCard clipsOverflow={false}>
          <Stack gap={3} px={{ base: 3, md: 5 }} pt={4} pb={3}>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              {canWrite && description.howTo}
              {description.noMark}
              {SHIFT_BOARD_NOTE}
            </Text>
            <Flex align="flex-end" columnGap={3} rowGap={1} wrap="wrap">
              <Field.Root w="full" maxW={{ md: "20rem" }}>
                <Field.Label>名前で絞り込む</Field.Label>
                <Input
                  type="search"
                  value={nameQuery}
                  placeholder="サンプル スタッフ"
                  bg="white"
                  onChange={(event) => setNameQuery(event.target.value)}
                />
              </Field.Root>
              {isFiltered && visibleStaffs.length > 0 && (
                <Text fontSize="sm" color="fg.muted" pb={{ md: 2 }}>
                  {staffs.length}人中{visibleStaffs.length}人を表示
                </Text>
              )}
            </Flex>
          </Stack>

          {visibleStaffs.length === 0 ? (
            <Empty
              icon={LuSearchX}
              title="条件に合うスタッフがいません"
              titleAs="h3"
              // カードの中に置くため、枠を重ねない。
              variant="plain"
              py={8}
              action={
                <Button
                  type="button"
                  variant="outline"
                  bg="white"
                  minH={{ base: "44px", md: "40px" }}
                  onClick={() => setNameQuery("")}
                >
                  絞り込みを解除
                </Button>
              }
            />
          ) : (
            <>
              <MarkBar
                options={markOptions}
                mark={mark.value}
                canWrite={canWrite}
                notice={notice}
                stickyTop={headerStickyTop}
                onChange={(value) => {
                  setSelectedMark(value);
                  setNotice(null);
                }}
              />
              {layout === "wide" ? (
                <StaffLevelTable
                  {...listProps}
                  headerStickyTop={`calc(${headerStickyTop} + ${MARK_BAR_HEIGHT_PX}px)`}
                />
              ) : (
                <StaffLevelList {...listProps} />
              )}
            </>
          )}
        </SetupCard>
      )}
    </SetupSection>
  );
}

// ---- 付ける印の選択 ----

/** マスに出す印。標準は印を持たないため、薄い線だけを出す。読み上げ名はマスの側で持つ。 */
function LevelMark({ level }: { level: StaffPositionLevel }) {
  if (level === "standard") {
    return <Box as="span" flexShrink={0} w="10px" h="2px" borderRadius="full" bg="gray.300" aria-hidden />;
  }
  const { bg, color } = MARK_STYLES[level];
  return (
    <chakra.span
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      minW="24px"
      h="24px"
      borderRadius="md"
      fontSize="sm"
      fontWeight="bold"
      lineHeight="1"
      bg={bg}
      color={color}
      aria-hidden
    >
      {getStaffPositionMarkSymbol(level)}
    </chakra.span>
  );
}

type MarkBarProps = {
  options: readonly MarkOption[];
  mark: StaffPositionMark;
  canWrite: boolean;
  notice: string | null;
  stickyTop: string;
  onChange: (mark: StaffPositionMark) => void;
};

/**
 * 付ける印を選ぶ行。スクロールしても選んでいる印を見失わないよう、画面の上端に留める。
 * 印と名前を並べて出すため、表の凡例も兼ねる。閲覧専用では、凡例だけを出す。
 */
function MarkBar({ options, mark, canWrite, notice, stickyTop, onChange }: MarkBarProps) {
  return (
    <Flex
      data-sticky-row=""
      position="sticky"
      top={stickyTop}
      zIndex={2}
      direction={{ base: "column", md: "row" }}
      align={{ md: "center" }}
      columnGap={3}
      minH={{ md: `${MARK_BAR_HEIGHT_PX}px` }}
      maxH={{ md: `${MARK_BAR_HEIGHT_PX}px` }}
      px={{ base: 3, md: 5 }}
      py={{ base: 2, md: 0 }}
      bg="white"
      borderTopWidth="1px"
      borderBottomWidth={{ base: "1px", md: 0 }}
      borderColor="blackAlpha.100"
      css={STICKY_TRANSITION}
    >
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted" flexShrink={0} mb={{ base: 1.5, md: 0 }}>
        {canWrite ? "付ける印" : "印の意味"}
      </Text>
      {canWrite ? (
        <SegmentedRadio
          name="shift-setup-staff-mark"
          label="付ける印"
          value={mark}
          options={options.map((option) => ({
            value: option.value,
            label: option.label,
            prefix: <LevelMark level={option.value} />,
          }))}
          onChange={onChange}
        />
      ) : (
        <Flex as="ul" listStyleType="none" wrap="wrap" columnGap={4} rowGap={1}>
          {options.map((option) => (
            <Flex as="li" key={option.value} align="center" gap={1.5} fontSize="sm" color="gray.800">
              <LevelMark level={option.value} />
              {option.label}
            </Flex>
          ))}
        </Flex>
      )}
      {/* 印を付けられなかった理由。読み上げられるよう、空の間も置いておく。 */}
      <Text
        role="status"
        flex={{ md: 1 }}
        minW={0}
        fontSize="xs"
        fontWeight="semibold"
        lineHeight="1.4"
        color="orange.800"
        lineClamp={2}
        mt={{ base: notice ? 1.5 : 0, md: 0 }}
      >
        {notice}
      </Text>
    </Flex>
  );
}

// ---- マス ----

type LevelCellProps = {
  /** 読み上げに使う、スタッフとポジションの名前。 */
  label: string;
  level: StaffPositionLevel;
  /** 選んでいる印を付けられないマス。押すと、理由を出す。 */
  isBlocked: boolean;
  readOnly: boolean;
  /** マスの中に出す、ポジションの名前と色。PCの表では列の見出しが示すため、渡さない。 */
  caption?: { name: string; color?: string };
  onPress: () => void;
};

/** スタッフとポジションの組み合わせ1つ。押すと、選んでいる印が付く。 */
function LevelCell({ label, level, isBlocked, readOnly, caption, onPress }: LevelCellProps) {
  // 閲覧専用では、押せない理由を出す場面がない。
  const isBlockedNow = isBlocked && !readOnly;
  const isInteractive = !readOnly && !isBlocked;
  const surface = caption && level !== "standard" ? MARK_STYLES[level].surface : caption ? "white" : "transparent";

  return (
    <chakra.button
      type="button"
      aria-label={`${label} ${getStaffPositionLevelLabel(level)}`}
      aria-disabled={isBlockedNow ? true : undefined}
      title={isBlockedNow ? LAST_POSITION_REASON : undefined}
      disabled={readOnly}
      display="flex"
      alignItems="center"
      justifyContent={caption ? "space-between" : "center"}
      gap={1.5}
      w="full"
      minH={caption ? "44px" : "36px"}
      px={caption ? 2 : 0}
      py={caption ? 1 : 0}
      // 印を付けられないマスは、押す前に分かるよう点線で囲む。
      borderWidth="1px"
      borderStyle={isBlockedNow ? "dashed" : "solid"}
      borderColor={isBlockedNow ? "gray.400" : caption ? "gray.200" : "transparent"}
      borderRadius="md"
      bg={surface}
      textAlign="start"
      cursor={readOnly ? "default" : isBlockedNow ? "not-allowed" : "pointer"}
      transitionProperty="background-color"
      transitionDuration="faster"
      _active={isInteractive ? { bg: "gray.200", transitionDuration: "0ms" } : undefined}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "1px" }}
      css={
        isInteractive
          ? // 指で押したあとに色が残らないよう、カーソルを載せられる端末だけで色を変える。
            { "@media (hover: hover)": { "&:hover:not(:active)": { bg: "gray.100" } } }
          : undefined
      }
      onClick={onPress}
    >
      {caption && (
        <>
          {caption.color && <PositionDot color={caption.color} size="8px" />}
          <chakra.span
            flex={1}
            minW={0}
            fontSize="xs"
            fontWeight="semibold"
            lineHeight="1.3"
            color={level === "unavailable" ? "gray.600" : "gray.800"}
            overflowWrap="anywhere"
          >
            {caption.name}
          </chakra.span>
        </>
      )}
      <Box as="span" display="inline-flex" alignItems="center" opacity={isBlockedNow ? 0.4 : 1}>
        <LevelMark level={level} />
      </Box>
    </chakra.button>
  );
}

// ---- まとめて付ける、外す ----

type BulkProps = {
  /** 選んでいる印。 */
  mark: MarkOption;
  /** 対象のスタッフを示す言葉。名前で絞り込んでいる間は「表示中の3人」になる。 */
  scope: string;
  /** 対象のスタッフの人数。 */
  staffCount: number;
  /** 対象のスタッフのうち、そのポジションに選んでいる印が付いている人数を返す。 */
  countMarked: (positionId: ShiftSetupPosition["_id"]) => number;
  onChange: (positionId: ShiftSetupPosition["_id"], action: BulkAction) => void;
};

const formatBulkAction = (bulk: BulkProps, action: BulkAction) =>
  action === "apply"
    ? `${bulk.scope}に「${bulk.mark.label}」を付ける`
    : `${bulk.scope}から「${bulk.mark.label}」を外す`;

/** 変わるスタッフがいない操作は選べない。 */
const canRunBulkAction = (bulk: BulkProps, positionId: ShiftSetupPosition["_id"], action: BulkAction) =>
  action === "apply" ? bulk.countMarked(positionId) < bulk.staffCount : bulk.countMarked(positionId) > 0;

/**
 * PCの表の、ポジションの列の見出し。押すと、その列の印をまとめて変えるメニューが開く。
 * 名前は省略せず、列の幅に収まらない分は折り返す。
 */
function PositionColumnHeader({ position, bulk }: { position: ShiftSetupPosition; bulk?: BulkProps }) {
  const nameCharacters = Array.from(position.name);
  const nameHead = nameCharacters.slice(0, -1).join("");
  const nameTail = nameCharacters.at(-1) ?? "";
  const content = (
    <>
      <Box as="span" display="block" w="full" h="3px" borderRadius="full" style={{ background: position.color }} />
      <chakra.span
        display="block"
        w="full"
        fontSize="xs"
        fontWeight="semibold"
        lineHeight="1.3"
        color="gray.800"
        textAlign="center"
        overflowWrap="anywhere"
      >
        {bulk ? (
          <>
            {nameHead}
            {/* 矢印だけが次の行へ送られないよう、名前の最後の1文字とつなげる。 */}
            <chakra.span whiteSpace="nowrap">
              {nameTail}
              <Box as="span" display="inline-block" ms={0.5} color="gray.600" verticalAlign="-2px" aria-hidden>
                <LuChevronDown size={12} />
              </Box>
            </chakra.span>
          </>
        ) : (
          position.name
        )}
      </chakra.span>
    </>
  );
  const frame = { display: "flex", flexDirection: "column", alignItems: "center", gap: 1, w: "full", px: 0.5 } as const;

  if (!bulk) return <Box {...frame}>{content}</Box>;

  return (
    <Menu.Root
      positioning={{ placement: "bottom-start", gutter: 4 }}
      lazyMount
      unmountOnExit
      onSelect={({ value }) => bulk.onChange(position._id, value as BulkAction)}
    >
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${position.name}の印をまとめて変える`}
          {...frame}
          pb={1}
          borderRadius="md"
          cursor="pointer"
          transitionProperty="background-color"
          transitionDuration="faster"
          _hover={{ bg: "gray.200" }}
          _active={{ bg: "gray.300", transitionDuration: "0ms" }}
          _expanded={{ bg: "gray.200" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
        >
          {content}
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="15rem">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel display="flex" alignItems="center" gap={1.5} overflowWrap="anywhere">
                <PositionDot color={position.color} size="10px" />
                {position.name}
              </Menu.ItemGroupLabel>
              {(["apply", "remove"] as const).map((action) => (
                <Menu.Item
                  key={action}
                  value={action}
                  disabled={!canRunBulkAction(bulk, position._id, action)}
                  {...MENU_ITEM_PROPS}
                >
                  <Menu.ItemText fontSize="sm" fontWeight="medium">
                    {formatBulkAction(bulk, action)}
                  </Menu.ItemText>
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

type BulkPositionsMenuProps = {
  action: BulkAction;
  triggerLabel: string;
  positions: readonly ShiftSetupPosition[];
  bulk: BulkProps;
};

/** スマートフォンの、まとめて変えるボタン。押すと、印を付ける（外す）ポジションを選ぶメニューが開く。 */
function BulkPositionsMenu({ action, triggerLabel, positions, bulk }: BulkPositionsMenuProps) {
  return (
    <Menu.Root
      positioning={{ placement: "bottom-start", gutter: 4 }}
      lazyMount
      unmountOnExit
      onSelect={({ value }) => {
        const position = positions.find((candidate) => candidate._id === value);
        if (position) bulk.onChange(position._id, action);
      }}
    >
      <Menu.Trigger asChild>
        <Button type="button" variant="outline" bg="white" size="sm" flex={1} minH="44px" gap={1} px={2}>
          {triggerLabel}
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="15rem">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>{formatBulkAction(bulk, action)}</Menu.ItemGroupLabel>
              {positions.map((position) => (
                <Menu.Item
                  key={position._id}
                  value={position._id}
                  disabled={!canRunBulkAction(bulk, position._id, action)}
                  {...MENU_ITEM_PROPS}
                >
                  <PositionDot color={position.color} size="10px" />
                  <Menu.ItemText fontSize="sm" fontWeight="medium" overflowWrap="anywhere">
                    {position.name}
                  </Menu.ItemText>
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

// ---- 一覧 ----

type ListProps = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  hasPositionChoice: boolean;
  mark: MarkOption;
  bulk: BulkProps;
  onStamp: (staff: ShiftSetupStaff, position: ShiftSetupPosition) => void;
};

/** マス1つに渡す値を、スタッフとポジションから組み立てる。 */
function buildCellProps(
  { positions, profiles, canWrite, hasPositionChoice, mark, onStamp }: ListProps,
  staff: ShiftSetupStaff,
  position: ShiftSetupPosition,
) {
  const levels = profiles[staff._id] ?? {};
  return {
    label: `${staff.name} ${hasPositionChoice ? position.name : SINGLE_POSITION_LABEL}`,
    level: getStaffPositionLevel(levels, position._id),
    isBlocked: isStaffPositionMarkBlocked(levels, position._id, mark.value, positions),
    readOnly: !canWrite,
    onPress: () => onStamp(staff, position),
  };
}

/**
 * PC: スタッフを行、ポジションを列にした表。
 * 標準のマスには印を出さず、標準以外の値だけが目に入るようにする。
 */
function StaffLevelTable(props: ListProps & { headerStickyTop: string }) {
  const { staffs, positions, canWrite, hasPositionChoice, bulk, headerStickyTop } = props;
  // ポジションが10件でも、名前を折り返して1024pxの幅に収める。列は左へ寄せ、余った幅は右に空ける。
  const columns = `minmax(6.5rem, 14rem) repeat(${positions.length}, minmax(3rem, 7.5rem))`;
  const rowProps = {
    role: "row",
    templateColumns: columns,
    justifyContent: "start",
    alignItems: "center",
    columnGap: 1,
    px: 5,
  } as const;

  return (
    <Box role="table" aria-label="スタッフ">
      <Grid
        {...rowProps}
        data-sticky-row=""
        position="sticky"
        top={headerStickyTop}
        zIndex={1}
        py={1.5}
        bg="gray.50"
        borderYWidth="1px"
        borderColor="blackAlpha.100"
        css={STICKY_TRANSITION}
      >
        <Text role="columnheader" fontSize="xs" fontWeight="semibold" color="fg.muted">
          名前
        </Text>
        {positions.map((position) => (
          <Box key={position._id} role="columnheader" minW={0}>
            {hasPositionChoice ? (
              <PositionColumnHeader position={position} bulk={canWrite ? bulk : undefined} />
            ) : (
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textAlign="center">
                {SINGLE_POSITION_LABEL}
              </Text>
            )}
          </Box>
        ))}
      </Grid>

      {staffs.map((staff, index) => (
        <Grid
          key={staff._id}
          {...rowProps}
          aria-label={staff.name}
          minH="44px"
          py={1}
          borderTopWidth={index === 0 ? 0 : "1px"}
          borderColor="blackAlpha.100"
          borderBottomRadius={index === staffs.length - 1 ? "xl" : undefined}
          _hover={{ bg: "gray.50" }}
        >
          <Text role="rowheader" fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
            {staff.name}
          </Text>
          {positions.map((position) => (
            <Box key={position._id} role="cell" minW={0}>
              <LevelCell {...buildCellProps(props, staff, position)} />
            </Box>
          ))}
        </Grid>
      ))}
    </Box>
  );
}

/**
 * スマートフォン: スタッフごとに、ポジションのマスを並べる。
 * PCの表と同じく、付ける印を選んでからマスを押す。
 */
function StaffLevelList(props: ListProps) {
  const { staffs, positions, canWrite, hasPositionChoice, bulk } = props;

  return (
    <Box>
      {canWrite && hasPositionChoice && (
        <Flex
          role="group"
          aria-label="印をまとめて変える"
          gap={2}
          px={3}
          py={2}
          borderBottomWidth="1px"
          borderColor="blackAlpha.100"
        >
          <BulkPositionsMenu action="apply" triggerLabel="まとめて付ける" positions={positions} bulk={bulk} />
          <BulkPositionsMenu action="remove" triggerLabel="まとめて外す" positions={positions} bulk={bulk} />
        </Flex>
      )}
      {staffs.map((staff, index) => (
        <Box
          key={staff._id}
          role="group"
          aria-label={staff.name}
          px={3}
          py={3}
          borderTopWidth={index === 0 ? 0 : "1px"}
          borderColor="blackAlpha.100"
        >
          {hasPositionChoice ? (
            <Stack gap={2}>
              <StaffName name={staff.name} />
              <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={1.5}>
                {positions.map((position) => (
                  <LevelCell
                    key={position._id}
                    {...buildCellProps(props, staff, position)}
                    caption={{ name: position.name, color: position.color }}
                  />
                ))}
              </Grid>
            </Stack>
          ) : (
            <Flex align="center" gap={3}>
              <StaffName name={staff.name} />
              <Box flexShrink={0} w="7rem">
                <LevelCell {...buildCellProps(props, staff, positions[0])} caption={{ name: SINGLE_POSITION_LABEL }} />
              </Box>
            </Flex>
          )}
        </Box>
      ))}
    </Box>
  );
}

function StaffName({ name }: { name: string }) {
  return (
    <Text flex={1} minW={0} fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
      {name}
    </Text>
  );
}
