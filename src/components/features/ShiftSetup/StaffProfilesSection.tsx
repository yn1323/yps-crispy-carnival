import { Box, chakra, Field, Flex, Grid, Menu, Portal, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import { useId, useState } from "react";
import { LuBan, LuCheck, LuChevronDown, LuSearchX, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { Input } from "@/src/components/ui/FormControls";
import { PositionBadge, PositionDot, SegmentedRadio, SetupSection } from "./parts";
import {
  type BulkStaffPositionLevel,
  filterStaffsByName,
  getStaffPositionLevel,
  getStaffPositionLevelLabel,
  getStaffPositionLevelOptions,
  isLastAvailablePosition,
  summarizeStaffPositionLevels,
} from "./staffPositionLevels";
import type {
  ShiftSetupIntents,
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
} from "./types";

const DESCRIPTION = "ポジションごとに、入れるかどうかと熟練度を選べます。新人と責任者は、シフト表で印が付きます。";
const SINGLE_POSITION_DESCRIPTION = "スタッフごとに熟練度を選べます。新人と責任者は、シフト表で印が付きます。";
const LAST_POSITION_REASON = "入れるポジションは1つ以上必要です";
/** スマートフォンの一覧の行に出す、標準以外の値の数の上限。 */
const SUMMARY_LIMIT = 3;
const MENU_ITEM_PROPS = { cursor: "pointer", ps: 8, pe: 3, py: 2.5 } as const;

/**
 * 値の見せ方。初期値の標準は地を付けず、例外の値だけが目に入るようにする。
 * 新人と責任者の色は、シフト表の印にそろえる。値は必ず文字でも出す。
 */
const LEVEL_STYLES: Record<StaffPositionLevel, { bg: string; color: string }> = {
  standard: { bg: "transparent", color: "gray.600" },
  newcomer: { bg: "orange.100", color: "orange.800" },
  lead: { bg: "green.100", color: "green.800" },
  unavailable: { bg: "gray.100", color: "gray.600" },
};

type Intents = Pick<ShiftSetupIntents, "onChangeStaffPositionLevel" | "onSetPositionLevelForAllStaffs">;

type Props = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  /** スタッフごとの、編集中の値を反映したポジションごとの値。キーはスタッフID。 */
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  /** 保存の応答を待っている間。値を操作できない状態にする。 */
  isSaving: boolean;
  /** PCの表の見出しの行を留める位置。ページの見出しの行のすぐ下にする。 */
  headerStickyTop: string;
  intents: Intents;
};

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
  const layout = useBreakpointValue<"narrow" | "wide">({ base: "narrow", md: "wide" }) ?? "wide";
  // ポジションが1件の店舗では、入れるポジションを選ぶ余地がないため、熟練度だけを選ぶ。
  const hasPositionChoice = positions.length > 1;
  const visibleStaffs = filterStaffsByName(staffs, nameQuery);
  const listProps = { staffs: visibleStaffs, positions, profiles, canWrite, hasPositionChoice, intents };

  return (
    <SetupSection
      headingId="shift-setup-staffs-heading"
      title="スタッフ"
      isBusy={isSaving}
      description={hasPositionChoice ? DESCRIPTION : SINGLE_POSITION_DESCRIPTION}
    >
      {staffs.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="シフト対象のスタッフがいません"
          titleAs="h3"
          description="店舗詳細でスタッフを所属させると、ここで条件を選べます。"
          variant="section"
          py={8}
        />
      ) : (
        <Stack gap={3}>
          <Field.Root maxW={{ md: "20rem" }}>
            <Field.Label>名前で絞り込む</Field.Label>
            <Input
              type="search"
              value={nameQuery}
              placeholder="サンプル スタッフ"
              bg="white"
              onChange={(event) => setNameQuery(event.target.value)}
            />
          </Field.Root>

          {visibleStaffs.length === 0 ? (
            <Empty
              icon={LuSearchX}
              title="条件に合うスタッフがいません"
              titleAs="h3"
              variant="section"
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
          ) : layout === "wide" ? (
            <StaffLevelTable {...listProps} headerStickyTop={headerStickyTop} />
          ) : (
            <StaffLevelList {...listProps} />
          )}
        </Stack>
      )}
    </SetupSection>
  );
}

type ListProps = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  hasPositionChoice: boolean;
  intents: Intents;
};

// ---- PC: スタッフを行、ポジションを列にした表 ----

/** PCの表。ポジションの色は列の見出しだけに使い、各マスはいまの値を文字で示す。 */
function StaffLevelTable({
  staffs,
  positions,
  profiles,
  canWrite,
  hasPositionChoice,
  headerStickyTop,
  intents,
}: ListProps & { headerStickyTop: string }) {
  // 列は左へ寄せ、余った幅は右に空ける。
  const columns = `minmax(7rem, 16rem) repeat(${positions.length}, minmax(4rem, 8rem))`;
  const options = getStaffPositionLevelOptions(positions);
  const rowProps = {
    role: "row",
    templateColumns: columns,
    justifyContent: "start",
    alignItems: "center",
    columnGap: 2,
    px: 5,
  } as const;

  return (
    // 見出しの行を画面の上端に留めるため、この枠ではoverflowを切らない。
    <Box role="table" aria-label="スタッフ" borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white">
      <Grid
        {...rowProps}
        position="sticky"
        top={headerStickyTop}
        zIndex={1}
        py={2}
        bg="gray.50"
        borderBottomWidth="1px"
        borderColor="blackAlpha.100"
        borderTopRadius="xl"
        css={{
          transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }}
      >
        <Text role="columnheader" fontSize="xs" fontWeight="semibold" color="fg.muted">
          名前
        </Text>
        {positions.map((position) => (
          <Box key={position._id} role="columnheader" minW={0}>
            {!hasPositionChoice ? (
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
                熟練度
              </Text>
            ) : canWrite ? (
              <BulkLevelMenu position={position} onSelect={intents.onSetPositionLevelForAllStaffs} />
            ) : (
              <PositionBadge name={position.name} color={position.color} truncate />
            )}
          </Box>
        ))}
      </Grid>

      {staffs.map((staff, index) => {
        const levels = profiles[staff._id] ?? {};
        return (
          <Grid
            key={staff._id}
            {...rowProps}
            aria-label={staff.name}
            minH="44px"
            py={1.5}
            borderTopWidth={index === 0 ? 0 : "1px"}
            borderColor="blackAlpha.100"
          >
            <Text role="rowheader" fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
              {staff.name}
            </Text>
            {positions.map((position) => (
              <Box key={position._id} role="cell" minW={0}>
                <LevelMenu
                  label={`${staff.name} ${position.name}`}
                  level={getStaffPositionLevel(levels, position._id)}
                  options={options}
                  isLastAvailable={isLastAvailablePosition(levels, position._id, positions)}
                  disabled={!canWrite}
                  onChange={(level) => intents.onChangeStaffPositionLevel(staff._id, position._id, level)}
                />
              </Box>
            ))}
          </Grid>
        );
      })}
    </Box>
  );
}

type LevelMenuProps = {
  /** 読み上げに使う、スタッフとポジションの名前。 */
  label: string;
  level: StaffPositionLevel;
  options: ReadonlyArray<{ value: StaffPositionLevel; label: string }>;
  /** 最後に残った「入れるポジション」は「入れない」にできない。 */
  isLastAvailable: boolean;
  disabled: boolean;
  onChange: (level: StaffPositionLevel) => void;
};

/** 表の1マス。いまの値を示すボタンを押すと、値を選ぶメニューが開く。 */
function LevelMenu({ label, level, options, isLastAvailable, disabled, onChange }: LevelMenuProps) {
  const levelLabel = getStaffPositionLevelLabel(level);
  const canBeUnavailable = options.some((option) => option.value === "unavailable");

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 4 }} lazyMount unmountOnExit>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${label} ${levelLabel}`}
          disabled={disabled}
          display="flex"
          alignItems="center"
          gap={1}
          w="full"
          h="32px"
          px={2}
          borderWidth="1px"
          borderColor="transparent"
          borderRadius="md"
          fontSize="sm"
          fontWeight="semibold"
          cursor={disabled ? "not-allowed" : "pointer"}
          transitionProperty="border-color"
          transitionDuration="faster"
          _hover={{ borderColor: "gray.400" }}
          _expanded={{ borderColor: "gray.500" }}
          _disabled={{ opacity: 0.64 }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
          {...LEVEL_STYLES[level]}
        >
          {level === "unavailable" && (
            <Box as="span" flexShrink={0} aria-hidden>
              <LuBan />
            </Box>
          )}
          <chakra.span flex={1} minW={0} textAlign="start" truncate>
            {levelLabel}
          </chakra.span>
          <Box as="span" flexShrink={0} fontSize="xs" aria-hidden>
            <LuChevronDown />
          </Box>
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="11rem">
            <Menu.RadioItemGroup value={level} onValueChange={({ value }) => onChange(value as StaffPositionLevel)}>
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  disabled={option.value === "unavailable" && isLastAvailable}
                  {...MENU_ITEM_PROPS}
                >
                  <Menu.ItemIndicator color="teal.600">
                    <LuCheck aria-hidden />
                  </Menu.ItemIndicator>
                  <Menu.ItemText fontSize="sm" fontWeight="medium">
                    {option.label}
                  </Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
            {canBeUnavailable && isLastAvailable && (
              <Text px={3} py={2} fontSize="xs" color="fg.muted" lineHeight="tall">
                {LAST_POSITION_REASON}
              </Text>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

type BulkLevelMenuProps = {
  position: ShiftSetupPosition;
  onSelect: (positionId: ShiftSetupPosition["_id"], level: BulkStaffPositionLevel) => void;
};

/** ポジションのバッジ。押すと、そのポジションの値を全員まとめて変えるメニューが開く。 */
function BulkLevelMenu({ position, onSelect }: BulkLevelMenuProps) {
  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 4 }} lazyMount unmountOnExit>
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label={`${position.name}をまとめて設定`}
          title={position.name}
          position="relative"
          display="inline-flex"
          alignItems="center"
          gap={1}
          maxW="full"
          minH="28px"
          ps={3}
          pe={2}
          borderRadius="full"
          color="white"
          fontSize="sm"
          fontWeight="semibold"
          lineHeight="1.3"
          cursor="pointer"
          transitionProperty="filter"
          transitionDuration="faster"
          _hover={{ filter: "brightness(0.92)" }}
          _active={{ filter: "brightness(0.85)", transitionDuration: "0ms" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
          // 見た目は小さく保ち、スマートフォンで押せる範囲だけを高さ44pxまで広げる。
          _after={{ content: '""', position: "absolute", insetX: 0, insetY: { base: "-8px", md: 0 } }}
          style={{ background: position.color }}
        >
          <chakra.span minW={0} truncate>
            {position.name}
          </chakra.span>
          <Box as="span" flexShrink={0} fontSize="xs" aria-hidden>
            <LuChevronDown />
          </Box>
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="13rem">
            <Menu.Item value="standard" cursor="pointer" py={2.5} onClick={() => onSelect(position._id, "standard")}>
              <Menu.ItemText fontSize="sm" fontWeight="medium">
                全員を標準にする
              </Menu.ItemText>
            </Menu.Item>
            <Menu.Item
              value="unavailable"
              cursor="pointer"
              py={2.5}
              onClick={() => onSelect(position._id, "unavailable")}
            >
              <Menu.ItemText fontSize="sm" fontWeight="medium">
                全員を入れないにする
              </Menu.ItemText>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

// ---- スマートフォン: スタッフごとの行を、その場で開いて選ぶ ----

function StaffLevelList({ staffs, positions, profiles, canWrite, hasPositionChoice, intents }: ListProps) {
  const [openStaffIds, setOpenStaffIds] = useState<ReadonlySet<string>>(new Set());
  const toggle = (staffId: string) =>
    setOpenStaffIds((current) => {
      const next = new Set(current);
      if (!next.delete(staffId)) next.add(staffId);
      return next;
    });

  return (
    <Stack gap={2}>
      {canWrite && hasPositionChoice && (
        <Stack role="group" aria-label="まとめて設定" gap={1.5}>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
            まとめて設定
          </Text>
          <Flex wrap="wrap" columnGap={2} rowGap={4} pb={2}>
            {positions.map((position) => (
              <BulkLevelMenu key={position._id} position={position} onSelect={intents.onSetPositionLevelForAllStaffs} />
            ))}
          </Flex>
        </Stack>
      )}
      {staffs.map((staff) => (
        <StaffLevelCard
          key={staff._id}
          staff={staff}
          positions={positions}
          levels={profiles[staff._id] ?? {}}
          canWrite={canWrite}
          hasPositionChoice={hasPositionChoice}
          isOpen={openStaffIds.has(staff._id)}
          onToggle={() => toggle(staff._id)}
          onChange={(positionId, level) => intents.onChangeStaffPositionLevel(staff._id, positionId, level)}
        />
      ))}
    </Stack>
  );
}

type CardProps = {
  staff: ShiftSetupStaff;
  positions: readonly ShiftSetupPosition[];
  levels: StaffPositionLevels;
  canWrite: boolean;
  hasPositionChoice: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (positionId: ShiftSetupPosition["_id"], level: StaffPositionLevel) => void;
};

/** スタッフ1人の行。閉じている間は標準以外の値だけを示し、押すとその場で開いて値を選べる。 */
function StaffLevelCard({
  staff,
  positions,
  levels,
  canWrite,
  hasPositionChoice,
  isOpen,
  onToggle,
  onChange,
}: CardProps) {
  const panelId = useId();
  const options = getStaffPositionLevelOptions(positions);
  const summary = summarizeStaffPositionLevels(levels, positions, SUMMARY_LIMIT);

  return (
    <Box
      role="group"
      aria-label={staff.name}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
    >
      <chakra.button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        display="flex"
        alignItems="center"
        gap={2}
        w="full"
        minH="56px"
        px={3}
        py={2}
        textAlign="start"
        borderRadius="xl"
        cursor="pointer"
        transitionProperty="background-color"
        transitionDuration="faster"
        _active={{ bg: "gray.100", transitionDuration: "0ms" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
        onClick={onToggle}
      >
        <Stack gap={1} flex={1} minW={0}>
          <Text as="span" fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
            {staff.name}
          </Text>
          <Flex as="span" wrap="wrap" gap={1}>
            {summary.items.length === 0 ? (
              <Text as="span" fontSize="xs" color="fg.muted">
                {hasPositionChoice ? "すべて標準" : "標準"}
              </Text>
            ) : (
              summary.items.map(({ position, level }) => (
                <chakra.span
                  key={position._id}
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  maxW="full"
                  px={1.5}
                  py={0.5}
                  borderRadius="md"
                  fontSize="xs"
                  fontWeight="semibold"
                  {...LEVEL_STYLES[level]}
                >
                  {hasPositionChoice && (
                    <>
                      <PositionDot color={position.color} size="8px" />
                      <chakra.span minW={0} truncate>
                        {position.name}
                      </chakra.span>
                    </>
                  )}
                  <chakra.span flexShrink={0}>{getStaffPositionLevelLabel(level)}</chakra.span>
                </chakra.span>
              ))
            )}
            {summary.restCount > 0 && (
              <Text as="span" fontSize="xs" color="fg.muted" alignSelf="center">
                ほか{summary.restCount}件
              </Text>
            )}
          </Flex>
        </Stack>
        <Box
          as="span"
          flexShrink={0}
          color="gray.500"
          transform={isOpen ? "rotate(180deg)" : undefined}
          transition="transform 0.15s"
          aria-hidden
        >
          <LuChevronDown />
        </Box>
      </chakra.button>

      {isOpen && (
        <Stack id={panelId} gap={4} px={3} pt={3} pb={4} borderTopWidth="1px" borderColor="blackAlpha.100">
          {positions.map((position) => {
            const isLastAvailable = hasPositionChoice && isLastAvailablePosition(levels, position._id, positions);
            return (
              <Stack key={position._id} gap={1.5}>
                {hasPositionChoice ? (
                  <Box>
                    <PositionBadge name={position.name} color={position.color} />
                  </Box>
                ) : (
                  <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
                    熟練度
                  </Text>
                )}
                <SegmentedRadio
                  name={`shift-setup-level-${staff._id}-${position._id}`}
                  label={hasPositionChoice ? position.name : "熟練度"}
                  value={getStaffPositionLevel(levels, position._id)}
                  options={options}
                  disabled={!canWrite}
                  disabledValues={isLastAvailable ? ["unavailable"] : []}
                  onChange={(level) => onChange(position._id, level)}
                />
                {isLastAvailable && canWrite && (
                  <Text fontSize="xs" color="fg.muted">
                    {LAST_POSITION_REASON}
                  </Text>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
