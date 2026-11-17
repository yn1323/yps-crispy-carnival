import { Box, chakra, Flex, Grid, Stack, Text, useBreakpointValue, VisuallyHidden } from "@chakra-ui/react";
import { useRef, useState } from "react";
import { LuInfo, LuUser, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea, useDialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import { isPositionsUnsplit } from "@/src/domains/shift/operations";
import { PositionBadge, PositionDot, SetupCard, SetupLockedNote, SetupSection } from "./parts";
import { getNextStaffPositionLevel, getStaffPositionLevel, getStaffPositionLevelLabel } from "./staffPositionLevels";
import type {
  ShiftSetupIntents,
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
} from "./types";

/** セクションの見出しの下に出す説明。ほかのセクションと同じく、何を設定するかを先に伝える。 */
const SECTION_DESCRIPTION = "スタッフのスキルを設定します。スキルを押すことで切り替えられます。";
const SINGLE_POSITION_SECTION_DESCRIPTION = "スタッフの熟練度を設定します。スキルが足りない時間帯に警告を出します。";
const STICKY_TRANSITION = {
  transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
} as const;

/**
 * 値ごとのマスの配色。どの値も、淡い地に同じ色みの濃い文字を載せる。値は必ず言葉でも出す。
 * 見習いの橙とリーダーの緑は、シフト表の印にそろえる。一人前は青、担当外は灰色にする。
 * カーソルを載せたときと押している間は、地を1段ずつ濃くする。
 */
const LEVEL_STYLES: Record<StaffPositionLevel, { bg: string; hoverBg: string; activeBg: string; color: string }> = {
  standard: { bg: "blue.100", hoverBg: "blue.200", activeBg: "blue.300", color: "blue.800" },
  newcomer: { bg: "orange.100", hoverBg: "orange.200", activeBg: "orange.300", color: "orange.800" },
  lead: { bg: "green.100", hoverBg: "green.200", activeBg: "green.300", color: "green.800" },
  unavailable: { bg: "gray.200", hoverBg: "gray.300", activeBg: "gray.400", color: "gray.700" },
};

/** スキルの役割に並べる順。熟練度の低いほうから並べ、担当外を最後に置く。マスを押して切り替わる順とは別に決める。 */
const LEGEND_ORDER: readonly StaffPositionLevel[] = ["newcomer", "standard", "lead", "unavailable"];

/**
 * PCの表の、列の見出しとマスの文字の大きさ。ふだんは14pxで出す。
 * ポジションが多く、列が「リーダー」の4文字を収められない幅になったときだけ、12pxへ下げる。
 * 画面の幅ではなく、列自身の幅で切り替えるため、見出しとマスの親をコンテナにする。
 */
const TABLE_COLUMN_FONT_SWITCH = {
  containerType: "inline-size",
  "& > :is(button, span)": { fontSize: "0.75rem" },
  "@container (min-width: 4.25rem)": { "& > :is(button, span)": { fontSize: "0.875rem" } },
} as const;

/** スキルの役割に出す、4つのスキルの意味。 */
const LEVEL_DESCRIPTIONS: Record<StaffPositionLevel, string> = {
  newcomer: "ポジション担当開始時点。シフト作成時に見習いのみポジションがある場合、警告を表示します。",
  standard: "ポジションを一人で担当できる。",
  lead: "ポジションの担当に加え、突発的なできごとへの対応も任せられる。",
  unavailable: "そのポジション担当外。自動シフト作成時にそのポジションに割り当たることがない。",
};

type Intents = Pick<ShiftSetupIntents, "onChangeStaffPositionLevel">;

type Props = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  /** スタッフごとの、編集中の値を反映したポジションごとの値。キーはスタッフID。 */
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  /** 保存の応答を待っている間。値を操作できない状態にする。 */
  isSaving: boolean;
  /** 表の見出しの行を留める位置。ページの見出しの行のすぐ下にする。 */
  headerStickyTop: string;
  intents: Intents;
};

/**
 * スタッフの、ポジションごとの熟練度。
 * マスを押すたびに、一人前、見習い、リーダー、担当外の順に値が切り替わる。
 * スタッフに残った最後の「担当できるポジション」では、担当外を飛ばして一人前へ戻る。
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
  // 押したあとの値。マスの読み上げ名が変わっても読み上げられないことがあるため、別に知らせる。
  const [announcement, setAnnouncement] = useState("");
  const layout = useBreakpointValue<"narrow" | "wide">({ base: "narrow", md: "wide" }) ?? "wide";
  const legendDialog = useDialog();
  const legendButtonRef = useRef<HTMLButtonElement>(null);

  // 熟練度はポジションごとに持つため、ポジションを追加するまでは中身を見せない。
  const isLocked = isPositionsUnsplit(positions);
  const hasLevels = !isLocked && staffs.length > 0;

  const cycle = (staff: ShiftSetupStaff, position: ShiftSetupPosition) => {
    const next = getNextStaffPositionLevel(profiles[staff._id] ?? {}, position._id, positions);
    intents.onChangeStaffPositionLevel(staff._id, position._id, next);
    setAnnouncement(`${staff.name} ${position.name} ${getStaffPositionLevelLabel(next)}`);
  };

  const listProps: ListProps = { staffs, positions, profiles, canWrite, onCycle: cycle };

  return (
    <SetupSection
      headingId="shift-setup-staffs-heading"
      title="スタッフのスキル"
      step={3}
      // ポジションが1件の店舗では、担当できるポジションを選ぶ余地がないため、熟練度だけを選ぶ。
      description={positions.length > 1 ? SECTION_DESCRIPTION : SINGLE_POSITION_SECTION_DESCRIPTION}
      isBusy={isSaving}
      action={
        hasLevels ? (
          <Button
            ref={legendButtonRef}
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1.5}
            minH={{ base: "44px", md: "36px" }}
            // 幅320pxでも見出しが折り返さないよう、スマートフォンでは余白を詰める。
            px={{ base: 1.5, md: 3 }}
            mr={{ base: -1.5, md: 0 }}
            fontWeight="semibold"
            flexShrink={0}
            onClick={legendDialog.open}
          >
            {/* 幅360px未満では、アイコンを出すと見出しが2行に折り返すため、文字だけにする。 */}
            <Box as="span" display="contents" css={{ "@media (max-width: 359px)": { display: "none" } }}>
              <LuInfo aria-hidden />
            </Box>
            スキルの役割
          </Button>
        ) : undefined
      }
    >
      {isLocked ? (
        <SetupLockedNote>ポジションを追加すると、熟練度を設定できます</SetupLockedNote>
      ) : staffs.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="シフト対象のスタッフがいません"
          titleAs="h3"
          description="店舗詳細でスタッフを所属させると、ここで熟練度を設定できます。"
          variant="section"
          py={8}
        />
      ) : (
        // 表の見出しの行を画面の上端に留めるため、このカードでは角からはみ出す内容を切らない。
        <SetupCard clipsOverflow={false}>
          {layout === "wide" ? (
            <StaffLevelTable {...listProps} headerStickyTop={headerStickyTop} />
          ) : (
            <StaffLevelList {...listProps} />
          )}
          <VisuallyHidden role="status">{announcement}</VisuallyHidden>
        </SetupCard>
      )}

      <SkillLegendDialog
        isOpen={legendDialog.isOpen && hasLevels}
        onOpenChange={legendDialog.onOpenChange}
        finalFocusEl={() => legendButtonRef.current}
      />
    </SetupSection>
  );
}

// ---- スキルの役割 ----

type SkillLegendDialogProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  finalFocusEl: () => HTMLElement | null;
};

/** 4つのスキルを、マスと同じ見た目の見本と、その意味で説明する。読むだけのDialog。 */
function SkillLegendDialog({ isOpen, onOpenChange, finalFocusEl }: SkillLegendDialogProps) {
  return (
    <Dialog
      title="スキルの役割"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      finalFocusEl={finalFocusEl}
      maxW="lg"
      // 「閉じる」を、ほかのDialogの主ボタンと同じ塗りで出す。既定の「閉じる」は枠だけのため、操作の行を渡す。
      footer={
        <DialogActionArea
          layout="standard"
          endAction={
            <Button type="button" colorPalette="teal" onClick={() => onOpenChange({ open: false })}>
              閉じる
            </Button>
          }
        />
      }
    >
      <Stack as="dl" gap={3} m={0}>
        {LEGEND_ORDER.map((level) => (
          <Flex key={level} align="flex-start" gap={3}>
            <Box as="dt" flexShrink={0}>
              <LevelSample level={level} />
            </Box>
            <Text as="dd" m={0} pt={1} fontSize="sm" lineHeight="tall" color="gray.800">
              {LEVEL_DESCRIPTIONS[level]}
            </Text>
          </Flex>
        ))}
      </Stack>
    </Dialog>
  );
}

/** マスと同じ見た目の見本。押せない。 */
function LevelSample({ level }: { level: StaffPositionLevel }) {
  const { bg, color } = LEVEL_STYLES[level];
  return (
    <chakra.span
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      w="5rem"
      minH="32px"
      borderRadius="md"
      bg={bg}
      color={color}
      fontSize="sm"
      fontWeight="semibold"
      lineHeight="1"
    >
      {getStaffPositionLevelLabel(level)}
    </chakra.span>
  );
}

// ---- マス ----

type LevelCellProps = {
  /** 読み上げに使う、スタッフとポジションの名前。 */
  label: string;
  level: StaffPositionLevel;
  readOnly: boolean;
  /** マスの中に出す、ポジションの名前と色。PCの表では列の見出しが示すため、渡さない。 */
  caption?: { name: string; color: string };
  onPress: () => void;
};

/** スタッフとポジションの組み合わせ1つ。押すたびに、値が順に切り替わる。値は言葉で出し、地の色でも見分けられるようにする。 */
function LevelCell({ label, level, readOnly, caption, onPress }: LevelCellProps) {
  const { bg, hoverBg, activeBg, color } = LEVEL_STYLES[level];
  const levelLabel = getStaffPositionLevelLabel(level);

  return (
    <Box h="full" css={caption ? undefined : TABLE_COLUMN_FONT_SWITCH}>
      <chakra.button
        type="button"
        aria-label={`${label} ${levelLabel}`}
        disabled={readOnly}
        display="flex"
        flexDirection={caption ? "column" : "row"}
        alignItems={caption ? "stretch" : "center"}
        justifyContent="center"
        gap={1}
        w="full"
        // スマートフォンでは、同じ行のマスの高さをそろえる。
        h="full"
        minH={caption ? "52px" : "36px"}
        px={caption ? 2.5 : 0}
        py={caption ? 1.5 : 0}
        borderRadius="md"
        bg={bg}
        color={color}
        fontSize="sm"
        fontWeight="semibold"
        lineHeight="1.3"
        textAlign="start"
        whiteSpace="nowrap"
        cursor={readOnly ? "default" : "pointer"}
        transitionProperty="background-color"
        transitionDuration="faster"
        _active={readOnly ? undefined : { bg: activeBg, transitionDuration: "0ms" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "1px" }}
        css={
          readOnly
            ? undefined
            : // 指で押したあとに色が残らないよう、カーソルを載せられる端末だけで色を変える。
              { "@media (hover: hover)": { "&:hover:not(:active)": { bg: hoverBg } } }
        }
        onClick={onPress}
      >
        {caption && (
          <Flex as="span" align="center" gap={1.5} minW={0}>
            <PositionDot color={caption.color} size="8px" />
            {/* 長い名前は1行で省略する。全文は、マスの読み上げ名に入っている。 */}
            <chakra.span minW={0} fontSize="xs" fontWeight="medium" color="gray.700" truncate title={caption.name}>
              {caption.name}
            </chakra.span>
          </Flex>
        )}
        <span aria-hidden>{levelLabel}</span>
      </chakra.button>
    </Box>
  );
}

// ---- 一覧 ----

type ListProps = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  profiles: Readonly<Record<string, StaffPositionLevels>>;
  canWrite: boolean;
  onCycle: (staff: ShiftSetupStaff, position: ShiftSetupPosition) => void;
};

/** マス1つに渡す値を、スタッフとポジションから組み立てる。 */
function buildCellProps(
  { profiles, canWrite, onCycle }: ListProps,
  staff: ShiftSetupStaff,
  position: ShiftSetupPosition,
) {
  return {
    label: `${staff.name} ${position.name}`,
    level: getStaffPositionLevel(profiles[staff._id] ?? {}, position._id),
    readOnly: !canWrite,
    onPress: () => onCycle(staff, position),
  };
}

/** PC: スタッフを行、ポジションを列にした表。列の見出しは、「1. ポジション」と同じバッジで出す。 */
function StaffLevelTable(props: ListProps & { headerStickyTop: string }) {
  const { staffs, positions, headerStickyTop } = props;
  // ポジションが10件でも、1024pxの幅に収める。列は左へ寄せ、余った幅は右に空ける。
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
        // 見出しの行の高さは、ポジションの数と名前の長さによらず1行分にする。
        h="48px"
        // ページの地（gray.50）と見分けられるよう、1段濃い地にする。
        bg="gray.100"
        borderBottomWidth="1px"
        borderColor="gray.200"
        // カードは角からはみ出す内容を切らないため、角に触れる見出しの行の側で角を丸める。
        borderTopRadius="calc(var(--chakra-radii-xl) - 1px)"
        css={STICKY_TRANSITION}
      >
        <Text role="columnheader" fontSize="xs" fontWeight="semibold" color="gray.700">
          名前
        </Text>
        {positions.map((position) => (
          <Flex key={position._id} role="columnheader" justify="center" minW={0} css={TABLE_COLUMN_FONT_SWITCH}>
            {/* 列の幅に収まらない名前は1行で省略し、全文をtitleに出す。 */}
            <PositionBadge name={position.name} color={position.color} truncate compact />
          </Flex>
        ))}
      </Grid>

      {staffs.map((staff, index) => (
        <Grid
          key={staff._id}
          {...rowProps}
          aria-label={staff.name}
          minH="58px"
          py={2}
          borderTopWidth={index === 0 ? 0 : "1px"}
          borderColor="gray.200"
          borderBottomRadius={index === staffs.length - 1 ? "xl" : undefined}
          _hover={{ bg: "gray.50" }}
        >
          <Flex role="rowheader" align="center" gap={2.5} minW={0} pr={2}>
            <StaffAvatar />
            <StaffName name={staff.name} />
          </Flex>
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

/** スマートフォン: スタッフごとに、ポジションのマスを並べる。PCの表と同じく、マスを押すたびに値が切り替わる。 */
function StaffLevelList(props: ListProps) {
  const { staffs, positions } = props;

  return (
    <Box>
      {staffs.map((staff, index) => (
        <Box
          key={staff._id}
          role="group"
          aria-label={staff.name}
          px={3}
          py={4}
          borderTopWidth={index === 0 ? 0 : "1px"}
          borderColor="gray.200"
        >
          {positions.length > 1 ? (
            <Stack gap={3}>
              <Flex align="center" gap={2.5} minW={0}>
                <StaffAvatar />
                <StaffName name={staff.name} />
              </Flex>
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
            <Flex align="center" gap={2.5}>
              <StaffAvatar />
              <StaffName name={staff.name} />
              <Box flexShrink={0} w="8.5rem">
                <LevelCell
                  {...buildCellProps(props, staff, positions[0])}
                  caption={{ name: positions[0].name, color: positions[0].color }}
                />
              </Box>
            </Flex>
          )}
        </Box>
      ))}
    </Box>
  );
}

/** 名前の左に置く、人のアイコン。ほかの画面のスタッフの丸い印と同じ配色にする。装飾なので読み上げない。 */
function StaffAvatar() {
  return (
    <Flex
      boxSize="28px"
      borderRadius="full"
      bg="teal.50"
      color="teal.700"
      align="center"
      justify="center"
      flexShrink={0}
      aria-hidden
    >
      <LuUser size={16} />
    </Flex>
  );
}

function StaffName({ name }: { name: string }) {
  return (
    <Text flex={1} minW={0} fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
      {name}
    </Text>
  );
}
