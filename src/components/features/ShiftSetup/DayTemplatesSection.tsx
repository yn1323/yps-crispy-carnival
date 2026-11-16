import { Badge, Box, chakra, Field, Flex, Grid, HStack, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useEffect, useRef } from "react";
import { LuPlus, LuSparkles, LuUsers } from "react-icons/lu";
import { SHIFT_DAY_TEMPLATE_LIMIT } from "@/convex/constants";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { NativeSelect } from "@/src/components/ui/FormControls";
import { DayTemplateEditor } from "./DayTemplateEditor";
import { formatDayTemplateUsage, getDayTemplateLabel, needsDayTemplateReentry } from "./dayTemplateDrafts";
import { SetupSection } from "./parts";
import type { DayTemplateDraft, ShiftSetupData, ShiftSetupEditorView, ShiftSetupIntents } from "./types";

/** スマートフォンで押しやすい高さを確保する、ページ上の主なボタンの高さ。 */
const MOBILE_TAP_HEIGHT = { base: "44px", md: "40px" };

type Props = {
  setup: ShiftSetupData;
  canWrite: boolean;
  /** 保存の応答を待っている間。型を操作できない状態にする。 */
  isSaving: boolean;
  dayTemplates: ShiftSetupEditorView["dayTemplates"];
  intents: ShiftSetupIntents;
  onOpenAssist: () => void;
};

export function DayTemplatesSection({ setup, canWrite, isSaving, dayTemplates, intents, onOpenAssist }: Props) {
  const { drafts, selectedRowKey, issueMessages, canAdd } = dayTemplates;
  const canUseAssist = setup.assistAvailable && canWrite;
  const selectedDraft = drafts.find((draft) => draft.rowKey === selectedRowKey);

  const nameInputRef = useRef<HTMLInputElement>(null);
  // 型を足す直前に編集していた型。undefinedは、足す操作をしていないことを表す。
  const selectedBeforeAddRef = useRef<string | null | undefined>(undefined);
  const addDayTemplate = () => {
    if (!canWrite || !canAdd) return;
    selectedBeforeAddRef.current = selectedRowKey;
    intents.onAddDayTemplate();
  };
  useEffect(() => {
    // 足した型へ切り替わったときだけ、名前の欄へ移る。
    if (selectedBeforeAddRef.current === undefined || selectedBeforeAddRef.current === selectedRowKey) return;
    selectedBeforeAddRef.current = undefined;
    const input = nameInputRef.current;
    if (!input) return;
    // 足した型の先頭が見える位置へ送り、名前をそのまま打ち替えられるようにする。
    input.scrollIntoView({ block: "nearest" });
    input.focus({ preventScroll: true });
  }, [selectedRowKey]);

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

  const addControl = selectedDraft && (
    <AddDayTemplateControl canWrite={canWrite} canAdd={canAdd} onAdd={addDayTemplate} />
  );

  return (
    <SetupSection
      headingId="shift-setup-day-templates-heading"
      title="必要人数"
      isBusy={isSaving}
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
                <Button type="button" colorPalette="teal" minH={MOBILE_TAP_HEIGHT} onClick={addDayTemplate}>
                  <LuPlus aria-hidden />
                  型を作る
                </Button>
                {canUseAssist && assistButton("outline")}
              </Flex>
            ) : undefined
          }
        />
      ) : (
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
            addControl={addControl}
            onSelect={intents.onSelectDayTemplate}
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
            nameInputRef={nameInputRef}
          />
          {/* スマートフォンでは、型の編集を終えたあとに次の型を足せるよう、入力の下に置く。 */}
          <Box
            display={{ lg: "none" }}
            px={{ base: 3, md: 5 }}
            py={{ base: 3, md: 4 }}
            borderTopWidth="1px"
            borderColor="gray.200"
          >
            {addControl}
          </Box>
        </Grid>
      )}
    </SetupSection>
  );
}

type SwitcherProps = {
  drafts: readonly DayTemplateDraft[];
  selectedRowKey: string;
  issueMessages: Readonly<Record<string, string>>;
  /** 型を足す操作。PCでは型の一覧の下に置く。 */
  addControl: ReactNode;
  onSelect: (rowKey: string) => void;
};

/**
 * 編集する型を選ぶ。PCは名前と使う日を並べた一覧、スマートフォンはセレクトにする。
 * 型は20件まであるため、どちらも件数が増えても収まる形にしている。
 */
function DayTemplateSwitcher({ drafts, selectedRowKey, issueMessages, addControl, onSelect }: SwitcherProps) {
  // 型が1つのときは選ぶ相手がないため、スマートフォンではセレクトを出さず、型の編集から始める。
  const hasChoices = drafts.length > 1;

  return (
    <Stack
      display={{ base: hasChoices ? "flex" : "none", lg: "flex" }}
      gap={3}
      px={{ base: 3, md: 5, lg: 3 }}
      pt={{ base: 4, md: 5, lg: 3 }}
      pb={{ base: 0, lg: 3 }}
      borderRightWidth={{ lg: "1px" }}
      borderColor="blackAlpha.100"
      minW={0}
    >
      {hasChoices && (
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
      )}

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

      <Box display={{ base: "none", lg: "block" }}>{addControl}</Box>
    </Stack>
  );
}

type AddControlProps = {
  canWrite: boolean;
  canAdd: boolean;
  onAdd: () => void;
};

/** 型を足すボタン。 */
function AddDayTemplateControl({ canWrite, canAdd, onAdd }: AddControlProps) {
  return (
    <Stack gap={3}>
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
