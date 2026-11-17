import { Alert, Box, Flex, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TimelineHourLabels } from "@/src/components/shared/ShiftTimeline";
import { pixelToRawMinutes } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { Button } from "@/src/components/ui/Button";
import {
  alignStaffingSegmentRange,
  countSegmentsOutsideRange,
  DEFAULT_STAFFING_COUNT_LIMIT,
  getStaffingCountRange,
  moveStaffingCount,
  normalizeStaffingSegments,
  STAFFING_SEGMENT_UNIT_MINUTES,
  type StaffingSegment,
  type StaffingSegmentRange,
  setStaffingCount,
  splitRangeByStaffingCount,
  trimSegmentsToRange,
} from "@/src/domains/shift/staffingSegments";
import { BandRow } from "./BandRow";
import { CountForm } from "./CountForm";
import {
  buildBandTimeOptions,
  buildBandTimeRange,
  getBandMetrics,
  getSwipedRange,
  resolveBandHourWidth,
  type StaffingCountBandLayout,
  type StaffingCountBandPosition,
  toCellStartMinutes,
} from "./script";
import { useBandLayout } from "./useBandLayout";
import { useBandSwipe } from "./useBandSwipe";
import { useContainerWidth } from "./useContainerWidth";

export type { StaffingCountBandLayout, StaffingCountBandPosition } from "./script";

export type StaffingCountBandEditorProps = {
  /** 人数を入れるポジション。並び順は表示順。 */
  positions: readonly StaffingCountBandPosition[];
  /** 時間ごとの必要人数。同じポジションで重ならない区間で渡す。 */
  segments: readonly StaffingSegment[];
  /** 人数を変えたとき。正規化した区間（ポジションIDの順、開始の早い順）を渡す。 */
  onChange: (segments: StaffingSegment[]) => void;
  /** 人数を入れられる範囲（分）。店舗の受付時間にあたる。 */
  range: StaffingSegmentRange;
  /** 刻み（分）。未指定は30分。 */
  unitMinutes?: number;
  isReadOnly?: boolean;
  /** 1つの時間に入れられる人数の上限。未指定は50人。 */
  maxCount?: number;
  /**
   * 未指定なら画面幅で切り替える。
   * wideは、ポジション1件を1行にし、左に名前を置く。
   * narrowは、名前を帯の上に置き、帯を幅いっぱいに使う。人数を選ぶ欄は、いつも帯のすぐ下に出す。
   */
  layout?: StaffingCountBandLayout;
  /**
   * wideでの、人数を選ぶ欄の出し方。未指定は帯の近くの吹き出し。
   * この部品をDialogの中に置く場合は "inline" を渡し、帯のすぐ下にその場で出す。
   */
  formPresentation?: "popover" | "inline";
};

/** 人数を選ぶ欄を開いた範囲と、開いたきっかけ。 */
type FormTarget = {
  positionId: string;
  startMinutes: number;
  endMinutes: number;
  /** pickは「時間を選んで入れる」から開いた。閉じたあとのフォーカスを、押したボタンへ戻すために持つ。 */
  opener: "span" | "pick";
  /** 開くたびに変える番号。同じポジションで開き直したときも、欄へフォーカスを移し直す。 */
  token: number;
  /**
   * 人数の入った1つの区間を押して開いた場合に持つ、その区間の編集。
   * 時間を変えるたびに、開いたときの人数（base）の上で、元の区間（from）を新しい時間へ置き換える。
   * 開いたときの人数から作り直すので、伸ばしてから縮め直すと、重ねた隣の人数は元に戻る。
   * なぞって選んだ範囲と、「時間を選んで入れる」から開いた範囲では持たない（人数を選ぶまで入れない）。
   */
  edit: { base: StaffingSegment[]; from: StaffingSegmentRange; count: number } | null;
};

const isSameSegments = (left: readonly StaffingSegment[], right: readonly StaffingSegment[]): boolean =>
  JSON.stringify(normalizeStaffingSegments(left)) === JSON.stringify(normalizeStaffingSegments(right));

/** 人数を選ぶ欄で、最初にフォーカスを移す要素。いまの人数のボタンか入力欄があればそこ、なければ開始の選択にする。 */
const findInitialFocus = (container: HTMLElement | null): HTMLElement | null =>
  container?.querySelector<HTMLElement>("[data-current-count]") ?? container?.querySelector("select") ?? null;

/**
 * 時間指定の必要人数を、時間の帯に数字で入力する部品。
 * 帯の上を横になぞるか、区間を押すと、その範囲の人数を選ぶ欄が開く。選んだ人数は、前の人数を置き換える。
 * 人数の入った区間を押して開いた欄では、時間か人数を変えた時点で、すぐ onChange へ渡す。
 * 新しく選んだ範囲は、人数を選んだ時点で渡す。値は segments と onChange で受け渡し、保存はしない。
 */
export const StaffingCountBandEditor = ({
  positions,
  segments,
  onChange,
  range,
  unitMinutes = STAFFING_SEGMENT_UNIT_MINUTES,
  isReadOnly = false,
  maxCount = DEFAULT_STAFFING_COUNT_LIMIT,
  layout,
  formPresentation = "popover",
}: StaffingCountBandEditorProps) => {
  const resolvedLayout = useBandLayout(layout);
  const isInline = resolvedLayout === "narrow" || formPresentation === "inline";
  const metrics = useMemo(() => getBandMetrics(resolvedLayout), [resolvedLayout]);
  // 受付時間が刻みにそろっていない店舗でも、人数を入れられる範囲を刻みの上に保つ。
  const editableRange = useMemo(() => alignStaffingSegmentRange(range, unitMinutes), [range, unitMinutes]);
  const timeRange = useMemo(() => buildBandTimeRange(editableRange, unitMinutes), [editableRange, unitMinutes]);
  const timeOptions = useMemo(() => buildBandTimeOptions(editableRange, unitMinutes), [editableRange, unitMinutes]);
  const totalHours = timeRange.end - timeRange.start;

  // 部品の幅だけを測り、1時間の幅を決める。帯の中身では幅が変わらない要素を測るため、測り直しは続かない。
  const { measureRef, width: containerWidth } = useContainerWidth();
  const hourWidth = resolveBandHourWidth({ containerWidth, totalHours, metrics });
  const minContentWidth =
    metrics.labelColumnWidth + metrics.actionColumnWidth + totalHours * metrics.minHourWidth + metrics.axisPadding * 2;
  const isScrollable = containerWidth > 0 && minContentWidth > containerWidth;
  const stickyWidth = isScrollable ? `${containerWidth}px` : "100%";

  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const formRef = useRef<FormTarget | null>(null);
  const tokenRef = useRef(0);
  // その場に出す欄を閉じたあと、フォーカスを帯へ戻すか。
  const restoresFocusRef = useRef(false);
  // なぞって範囲を選んだ直後のclickでは、押した区間の欄を開かない。
  const suppressClickRef = useRef(false);
  // 区間の編集で、最後に onChange へ渡した値。使う側が別の値へ置き換えた（「元に戻す」など）ことを見分ける。
  const lastEmittedRef = useRef<readonly StaffingSegment[] | null>(null);

  const outsideCount = countSegmentsOutsideRange(segments, editableRange);

  const openForm = (target: Omit<FormTarget, "token">) => {
    tokenRef.current += 1;
    const next = { ...target, token: tokenRef.current };
    formRef.current = next;
    lastEmittedRef.current = null;
    setForm(next);
    setIsFormOpen(true);
  };

  const closeForm = (options: { restoresFocus: boolean }) => {
    restoresFocusRef.current = options.restoresFocus;
    setIsFormOpen(false);
  };

  /**
   * 欄の開始か終了を選び直したとき。
   * 区間の編集では、その区間をすぐ新しい時間へ置き換える。欄は開いたままにし、続けて直せるようにする。
   * 新しく選んだ範囲では、選んでいる範囲だけを変え、人数を選ぶまで値は変えない。
   */
  const changeFormRange = (next: { startMinutes: number; endMinutes: number }) => {
    if (!form) return;
    let edit = form.edit;
    if (edit) {
      // 欄を開いている間に、使う側が値を置き換えていたら、いまの値といまの範囲を元にし直す。
      if (!isSameSegments(segments, lastEmittedRef.current ?? edit.base)) {
        edit = {
          ...edit,
          base: normalizeStaffingSegments(segments),
          from: { startMinutes: form.startMinutes, endMinutes: form.endMinutes },
        };
      }
      const moved = moveStaffingCount({
        segments: edit.base,
        positionId: form.positionId,
        from: edit.from,
        to: next,
        count: edit.count,
      });
      lastEmittedRef.current = moved;
      onChange(moved);
    }
    const updated = { ...form, ...next, edit };
    formRef.current = updated;
    setForm(updated);
  };

  /**
   * 欄を閉じたあとのフォーカスの戻り先。
   * 「時間を選んで入れる」から開いた場合はそのボタン、区間から開いた場合は、選んだ範囲の開始を含む区間へ戻す。
   */
  const getFormFocusTarget = useCallback((): HTMLElement | null => {
    const root = rootRef.current;
    const target = formRef.current;
    if (!root || !target) return null;
    const pick =
      Array.from(root.querySelectorAll<HTMLElement>("[data-band-pick]")).find(
        (element) => element.getAttribute("data-band-pick") === target.positionId,
      ) ?? null;
    if (target.opener === "pick") return pick;
    const span = Array.from(root.querySelectorAll<HTMLElement>("[data-band-span]")).find(
      (element) =>
        element.getAttribute("data-band-span") === target.positionId &&
        Number(element.getAttribute("data-start")) <= target.startMinutes &&
        target.startMinutes < Number(element.getAttribute("data-end")),
    );
    return span ?? pick;
  }, []);

  // その場に出す欄は、閉じるとフォーカスの行き先がなくなるため、ここで戻す。吹き出しは finalFocusEl で戻す。
  const wasInlineFormOpenRef = useRef(false);
  useEffect(() => {
    if (!isInline) return;
    if (wasInlineFormOpenRef.current && !isFormOpen && restoresFocusRef.current) getFormFocusTarget()?.focus();
    wasInlineFormOpenRef.current = isFormOpen;
  }, [isInline, isFormOpen, getFormFocusTarget]);

  const { swipe, startSwipe } = useBandSwipe({
    toCellMinutes: (clientX, trackRect) =>
      toCellStartMinutes({
        rawMinutes: pixelToRawMinutes({
          x: clientX - trackRect.left,
          timeRange,
          hourWidth,
          axisPadding: metrics.axisPadding,
        }),
        range: editableRange,
        unitMinutes,
      }),
    onCommit: (finished) => {
      // pointerupに続くclickだけを止める。離した場所が別の要素でclickが来ない場合に備え、すぐ戻す。
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      openForm({
        positionId: finished.positionId,
        ...getSwipedRange({ ...finished, unitMinutes }),
        opener: "span",
        edit: null,
      });
    },
  });

  const handleTrackPointerDown = (positionId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    // 左ボタンと、1本目の指だけで始める。
    if (event.button !== 0 || !event.isPrimary) return;
    const track = event.currentTarget;
    // 帯の中で始まった操作だけを受け取る。
    if (!(event.target instanceof Node) || !track.contains(event.target)) return;
    const rawMinutes = pixelToRawMinutes({
      x: event.clientX - track.getBoundingClientRect().left,
      timeRange,
      hourWidth,
      axisPadding: metrics.axisPadding,
    });
    if (rawMinutes < editableRange.startMinutes || rawMinutes > editableRange.endMinutes) return;
    const cellMinutes = toCellStartMinutes({ rawMinutes, range: editableRange, unitMinutes });
    startSwipe(
      { positionId, anchorMinutes: cellMinutes, currentMinutes: cellMinutes, hasMoved: false },
      { pointerId: event.pointerId, track, startClientX: event.clientX },
    );
  };

  const applyCount = (count: number) => {
    if (!form) return;
    const current = getStaffingCountRange({ segments, ...form });
    // いまと同じ人数を選んだ場合は、値を変えずに閉じる。
    if (!current || current.min !== count || current.max !== count) {
      onChange(setStaffingCount({ segments, ...form, count }));
    }
    closeForm({ restoresFocus: true });
  };

  const formPosition = form ? positions.find((position) => position.id === form.positionId) : undefined;
  const renderForm = (options: { isTouchSize: boolean; closeStyle: "icon" | "button" }) =>
    form &&
    formPosition && (
      <CountForm
        position={formPosition}
        range={form}
        segments={segments}
        timeOptions={timeOptions}
        unitMinutes={unitMinutes}
        maxCount={maxCount}
        isTouchSize={options.isTouchSize}
        closeStyle={options.closeStyle}
        onRangeChange={changeFormRange}
        onSelectCount={applyCount}
        onClose={() => closeForm({ restoresFocus: true })}
      />
    );

  return (
    <Stack ref={rootRef} gap={3}>
      {outsideCount > 0 && (
        <Alert.Root status="warning" borderRadius="lg" alignItems="flex-start" flexWrap="wrap">
          <Alert.Indicator mt={1} />
          <Alert.Content minW={0}>
            <Alert.Title>受付時間の外に人数が入っています</Alert.Title>
            {!isReadOnly && <Alert.Description>受付時間に合わせると外の人数が消えます</Alert.Description>}
          </Alert.Content>
          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
              bg="white"
              size="sm"
              minH={{ base: "44px", md: "36px" }}
              // スマートフォンでは文の下へ折り返し、幅いっぱいに置く。
              w={{ base: "full", md: "auto" }}
              flexShrink={0}
              onClick={() => onChange(trimSegmentsToRange({ segments, range: editableRange, unitMinutes }))}
            >
              受付時間に合わせる
            </Button>
          )}
        </Alert.Root>
      )}
      {/* 人数を入れる行がないとき（閲覧専用、ポジションが1件もない）は、操作の説明を出さない。 */}
      {!isReadOnly && positions.length > 0 && (
        <Text fontSize="sm" fontWeight="semibold" color="gray.900">
          時間帯別必要人員
        </Text>
      )}
      <Popover.Root
        open={!isInline && !isReadOnly && isFormOpen && formPosition !== undefined}
        onOpenChange={(details) => {
          if (!details.open) setIsFormOpen(false);
        }}
        positioning={{ placement: "bottom-start", gutter: 6 }}
        initialFocusEl={() => findInitialFocus(popoverRef.current)}
        finalFocusEl={getFormFocusTarget}
        lazyMount
        unmountOnExit
      >
        <Box ref={measureRef} overflowX="auto">
          <Box
            w={isScrollable ? `${minContentWidth}px` : "100%"}
            borderBottomWidth="1px"
            borderColor="gray.200"
            bg="white"
          >
            {resolvedLayout === "wide" && (
              <Flex>
                {/* 帯を横にスクロールしたとき、時刻の見出しが左右の列へはみ出して見えないよう、列を白い地で留める。 */}
                <Box
                  w={`${metrics.labelColumnWidth}px`}
                  flexShrink={0}
                  position="sticky"
                  left={0}
                  zIndex={4}
                  bg="white"
                />
                <Box flex={1} minW={0}>
                  <TimelineHourLabels timeRange={timeRange} hourWidth={hourWidth} axisPadding={metrics.axisPadding} />
                </Box>
                <Box
                  w={`${metrics.actionColumnWidth}px`}
                  flexShrink={0}
                  position="sticky"
                  right={0}
                  zIndex={4}
                  bg="white"
                />
              </Flex>
            )}
            {positions.map((position) => {
              const isFormTarget = !isReadOnly && isFormOpen && form?.positionId === position.id;
              const activeSwipe = swipe?.positionId === position.id && swipe.hasMoved ? swipe : null;
              return (
                <BandRow
                  key={position.id}
                  position={position}
                  spans={splitRangeByStaffingCount({ segments, positionId: position.id, range: editableRange })}
                  timeRange={timeRange}
                  unitMinutes={unitMinutes}
                  hourWidth={hourWidth}
                  metrics={metrics}
                  layout={resolvedLayout}
                  stickyWidth={stickyWidth}
                  isReadOnly={isReadOnly}
                  swipedRange={activeSwipe && getSwipedRange({ ...activeSwipe, unitMinutes })}
                  selectedRange={isFormTarget && form ? form : null}
                  anchorsPopover={!isInline}
                  inlineForm={
                    isInline && isFormTarget && form ? (
                      <InlineFormPanel
                        key={form.token}
                        label={`${position.name}の必要人数を入れる`}
                        onEscape={() => closeForm({ restoresFocus: true })}
                      >
                        {renderForm({ isTouchSize: resolvedLayout === "narrow", closeStyle: "button" })}
                      </InlineFormPanel>
                    ) : null
                  }
                  onTrackPointerDown={(event) => handleTrackPointerDown(position.id, event)}
                  onOpenSpan={(span) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    const spanRange = { startMinutes: span.startMinutes, endMinutes: span.endMinutes };
                    openForm({
                      positionId: position.id,
                      ...spanRange,
                      opener: "span",
                      // 人数の入った区間は、その区間の編集として開く。空いた時間は、新しく選んだ範囲として開く。
                      edit:
                        span.count > 0
                          ? { base: normalizeStaffingSegments(segments), from: spanRange, count: span.count }
                          : null,
                    });
                  }}
                  onOpenPick={() => openForm({ positionId: position.id, ...editableRange, opener: "pick", edit: null })}
                />
              );
            })}
          </Box>
        </Box>
        <Portal>
          <Popover.Positioner>
            {/* 欄の名前はaria-labelで付ける。開くまで中身を作らないため、見出しとの結び付けに頼らない。 */}
            <Popover.Content
              ref={popoverRef}
              w="300px"
              p={3}
              aria-label={formPosition ? `${formPosition.name}の必要人数を入れる` : undefined}
            >
              {renderForm({ isTouchSize: false, closeStyle: "icon" })}
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </Stack>
  );
};

type InlineFormPanelProps = {
  label: string;
  onEscape: () => void;
  children: ReactNode;
};

/**
 * 帯のすぐ下に、その場で出す欄の枠。開いたら見える位置へ寄せ、欄の中へフォーカスを移す。
 * 欄の中でEscapeを押すと、欄だけを閉じる。この部品を置いたDialogは閉じない。
 */
const InlineFormPanel = ({ label, onEscape, children }: InlineFormPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.scrollIntoView({ block: "nearest" });
    findInitialFocus(panel)?.focus();

    // DialogはdocumentでEscapeを先に受け取り、既定の動作が止められていなければ閉じる。
    // それより先にwindowで受け取り、欄の中のEscapeは既定の動作を止めて、欄だけを閉じる。
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      if (!(event.target instanceof Node) || !panel.contains(event.target)) return;
      event.preventDefault();
      onEscapeRef.current();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return (
    <Box
      ref={panelRef}
      role="group"
      aria-label={label}
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="lg"
      bg="gray.50"
      p={3}
    >
      {children}
    </Box>
  );
};
