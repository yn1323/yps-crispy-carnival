import { Badge, Box, chakra, Field, Flex, Grid, HStack, Stack, Text } from "@chakra-ui/react";
import { LuPlus, LuSparkles, LuUsers } from "react-icons/lu";
import { SHIFT_DAY_TEMPLATE_LIMIT } from "@/convex/constants";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { NativeSelect } from "@/src/components/ui/FormControls";
import { DayTemplateEditor } from "./DayTemplateEditor";
import {
  formatDayTemplateUsage,
  getDayTemplateLabel,
  getUnassignedWeekdays,
  needsDayTemplateReentry,
} from "./dayTemplateDrafts";
import { SetupSection } from "./parts";
import { WEEKDAY_OPTIONS } from "./script";
import type { DayTemplateDraft, ShiftSetupData, ShiftSetupEditorView, ShiftSetupIntents } from "./types";

const SECTION_DESCRIPTION =
  "1日分の必要人数を「型」として作り、使う曜日と祝日を選びます。シフト表で人数の過不足を確かめられます。";

/** スマートフォンで押しやすい高さを確保する、ページ上の主なボタンの高さ。 */
const MOBILE_TAP_HEIGHT = { base: "44px", md: "40px" };

type Props = {
  setup: ShiftSetupData;
  canWrite: boolean;
  dayTemplates: ShiftSetupEditorView["dayTemplates"];
  intents: ShiftSetupIntents;
  onOpenAssist: () => void;
  /** PCで「できあがる必要人数」を画面の下端に留めるときの、下端からの距離（px）。 */
  requiredCountBottomOffset: number;
};

export function DayTemplatesSection({
  setup,
  canWrite,
  dayTemplates,
  intents,
  onOpenAssist,
  requiredCountBottomOffset,
}: Props) {
  const { drafts, selectedRowKey, issueMessages, canAdd } = dayTemplates;
  const canUseAssist = setup.assistAvailable && canWrite;
  const selectedDraft = drafts.find((draft) => draft.rowKey === selectedRowKey);

  const assistButton = (variant: "ghost" | "outline") => (
    <Button
      type="button"
      variant={variant}
      colorPalette={variant === "ghost" ? "teal" : undefined}
      bg={variant === "outline" ? "white" : undefined}
      size={variant === "ghost" ? "sm" : "md"}
      minH={variant === "outline" ? MOBILE_TAP_HEIGHT : undefined}
      gap={1.5}
      fontWeight="semibold"
      flexShrink={0}
      onClick={onOpenAssist}
    >
      <LuSparkles aria-hidden />
      AIで下書きを作る
    </Button>
  );

  return (
    <SetupSection
      headingId="shift-setup-day-templates-heading"
      title="必要人数"
      description={SECTION_DESCRIPTION}
      action={drafts.length > 0 && canUseAssist ? assistButton("ghost") : undefined}
    >
      {!selectedDraft ? (
        <Empty
          icon={LuUsers}
          title="必要人数はまだ設定していません"
          titleAs="h3"
          description={
            canWrite ? "最初の型には営業日のすべての曜日が入ります。\n使う日と人数はあとから変えられます。" : undefined
          }
          variant="section"
          py={8}
          action={
            canWrite ? (
              <Flex gap={2} wrap="wrap" justify="center">
                <Button type="button" colorPalette="teal" minH={MOBILE_TAP_HEIGHT} onClick={intents.onAddDayTemplate}>
                  <LuPlus aria-hidden />
                  型を作る
                </Button>
                {canUseAssist && assistButton("outline")}
              </Flex>
            ) : undefined
          }
        />
      ) : (
        // 「できあがる必要人数」を画面の下端に留めるため、この枠と中の列ではoverflowを切らない。
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", lg: "220px minmax(0, 1fr)" }}
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
        >
          <DayTemplateSwitcher
            drafts={drafts}
            selectedRowKey={selectedDraft.rowKey}
            issueMessages={issueMessages}
            closedDays={setup.regularClosedDays}
            canWrite={canWrite}
            canAdd={canAdd}
            onSelect={intents.onSelectDayTemplate}
            onAdd={intents.onAddDayTemplate}
          />
          <DayTemplateEditor
            // 型を切り替えたら、開いていた確認とコピー元の選択を持ち越さない。
            key={selectedDraft.rowKey}
            draft={selectedDraft}
            drafts={drafts}
            setup={setup}
            canWrite={canWrite}
            issueMessage={issueMessages[selectedDraft.rowKey]}
            intents={intents}
            requiredCountBottomOffset={requiredCountBottomOffset}
          />
        </Grid>
      )}
    </SetupSection>
  );
}

type SwitcherProps = {
  drafts: readonly DayTemplateDraft[];
  selectedRowKey: string;
  issueMessages: Readonly<Record<string, string>>;
  closedDays: ShiftSetupData["regularClosedDays"];
  canWrite: boolean;
  canAdd: boolean;
  onSelect: (rowKey: string) => void;
  onAdd: () => void;
};

/**
 * 編集する型を選ぶ。PCは名前と使う日を並べた一覧、スマートフォンはセレクトにする。
 * 型は20件まであるため、どちらも件数が増えても収まる形にしている。
 */
function DayTemplateSwitcher({
  drafts,
  selectedRowKey,
  issueMessages,
  closedDays,
  canWrite,
  canAdd,
  onSelect,
  onAdd,
}: SwitcherProps) {
  const closed = new Set(closedDays);
  const unassignedLabels = WEEKDAY_OPTIONS.filter(
    (day) => getUnassignedWeekdays(drafts).includes(day.value) && !closed.has(day.value),
  ).map((day) => day.label);

  return (
    <Stack
      gap={3}
      px={{ base: 3, md: 5, lg: 3 }}
      pt={{ base: 4, md: 5, lg: 3 }}
      pb={{ base: 0, lg: 3 }}
      borderRightWidth={{ lg: "1px" }}
      borderColor="blackAlpha.100"
      minW={0}
    >
      <Field.Root display={{ base: "flex", lg: "none" }}>
        <Field.Label>編集する型</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            value={selectedRowKey}
            bg="white"
            minH="44px"
            onChange={(event) => onSelect(event.target.value)}
          >
            {drafts.map((draft) => (
              <option key={draft.rowKey} value={draft.rowKey}>
                {getDayTemplateLabel(draft)}（{formatDayTemplateUsage(draft)}）
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Box as="ul" aria-label="型の一覧" listStyleType="none" display={{ base: "none", lg: "block" }}>
        {drafts.map((draft) => (
          <Box as="li" key={draft.rowKey} mb={1}>
            <DayTemplateListButton
              draft={draft}
              isSelected={draft.rowKey === selectedRowKey}
              hasIssue={issueMessages[draft.rowKey] !== undefined}
              onSelect={() => onSelect(draft.rowKey)}
            />
          </Box>
        ))}
      </Box>

      <Stack gap={1}>
        <Button
          type="button"
          variant="outline"
          bg="white"
          size="sm"
          minH={{ base: "44px", lg: "36px" }}
          disabled={!canWrite || !canAdd}
          onClick={onAdd}
        >
          <LuPlus aria-hidden />
          型を追加
        </Button>
        {!canAdd && (
          <Text fontSize="xs" color="fg.muted">
            型は{SHIFT_DAY_TEMPLATE_LIMIT}件まで作れます
          </Text>
        )}
      </Stack>

      {unassignedLabels.length > 0 && (
        <Text fontSize="xs" color="fg.muted" lineHeight="tall">
          {unassignedLabels.join("・")}曜日はまだどの型にも入っていません
        </Text>
      )}
    </Stack>
  );
}

type ListButtonProps = {
  draft: DayTemplateDraft;
  isSelected: boolean;
  hasIssue: boolean;
  onSelect: () => void;
};

function DayTemplateListButton({ draft, isSelected, hasIssue, onSelect }: ListButtonProps) {
  const label = getDayTemplateLabel(draft);
  const usage = formatDayTemplateUsage(draft);
  const status = hasIssue ? "要確認" : needsDayTemplateReentry(draft) ? "入れ直し" : undefined;

  return (
    <chakra.button
      type="button"
      aria-label={[label, usage, ...(status ? [status] : [])].join(" ")}
      aria-current={isSelected ? "true" : undefined}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      justifyContent="center"
      gap={0.5}
      w="full"
      minH="52px"
      px={3}
      py={2}
      textAlign="start"
      borderRadius="md"
      // 選んでいる型は、中立の地色と濃いtealの線で示す。押している間の地色とは分ける。
      borderLeftWidth="3px"
      borderLeftColor={isSelected ? "teal.600" : "transparent"}
      bg={isSelected ? "gray.100" : "white"}
      cursor="pointer"
      transitionProperty="background-color"
      transitionDuration="faster"
      _hover={isSelected ? undefined : { bg: "gray.50" }}
      _active={{ bg: "gray.200", transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
      onClick={onSelect}
    >
      <HStack gap={2} minW={0}>
        <Text
          as="span"
          flex={1}
          minW={0}
          fontSize="sm"
          fontWeight={isSelected ? "bold" : "semibold"}
          color="gray.900"
          truncate
        >
          {label}
        </Text>
        {status && (
          <Badge colorPalette="orange" size="sm" flexShrink={0}>
            {status}
          </Badge>
        )}
      </HStack>
      <Text as="span" fontSize="xs" color="fg.muted" truncate>
        {usage}
      </Text>
    </chakra.button>
  );
}
