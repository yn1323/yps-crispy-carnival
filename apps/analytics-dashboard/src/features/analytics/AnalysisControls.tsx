import { Box, Button, Field, Flex, Grid, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { AnalyticsSearchState } from "./useAnalyticsSearch";

const GRANULARITY_OPTIONS = [
  { label: "日次", value: "day" },
  { label: "週次", value: "week" },
  { label: "月次", value: "month" },
] as const;

const FILTERS = [
  {
    key: "dimension",
    label: "比較軸",
    options: [
      ["", "すべての比較軸"],
      ["registrationCohort", "登録cohort"],
      ["plan", "プラン"],
      ["organizationShopCount", "グループ店舗数"],
      ["shopStaffSize", "店舗スタッフ規模"],
      ["cadence", "通常周期"],
      ["lineUsage", "LINE利用"],
      ["submissionTrend", "最近の提出傾向"],
      ["adoptionAge", "導入cohort"],
    ],
  },
  {
    key: "plan",
    label: "プラン",
    options: [
      ["", "すべて"],
      ["trial", "trial"],
      ["free", "free"],
      ["pro", "pro"],
      ["business", "business"],
    ],
  },
  {
    key: "shopSize",
    label: "店舗規模",
    options: [
      ["", "すべて"],
      ["1-4", "1〜4人"],
      ["5-9", "5〜9人"],
      ["10-19", "10〜19人"],
      ["20-49", "20〜49人"],
      ["50+", "50人以上"],
    ],
  },
  {
    key: "cadence",
    label: "通常周期",
    options: [
      ["", "すべて"],
      ["weekly", "週次"],
      ["biweekly", "隔週"],
      ["monthly", "月次"],
      ["other", "その他"],
      ["insufficientData", "判定材料不足"],
    ],
  },
  {
    key: "lineUsage",
    label: "LINE利用",
    options: [
      ["", "すべて"],
      ["none", "0%"],
      ["low", "1〜49%"],
      ["medium", "50〜79%"],
      ["high", "80%以上"],
    ],
  },
  {
    key: "health",
    label: "health signal",
    options: [
      ["", "すべて"],
      ["needsAttention", "要確認signalあり"],
      ["hasUpcomingCycle", "次回シフトあり"],
      ["nextCycleMissing", "次回未作成"],
      ["cadenceDelayed", "通常周期からの遅れ"],
      ["notificationFailure", "通知失敗"],
      ["submissionDrop", "提出低下"],
      ["confirmationDelay", "確定遅れ"],
      ["longInactive", "長期無活動"],
      ["insufficientData", "判定材料不足"],
    ],
  },
  {
    key: "completeness",
    label: "完全性",
    options: [
      ["", "すべて"],
      ["complete", "完全"],
      ["partial", "一部集計"],
      ["unavailable", "算出不可"],
    ],
  },
] as const satisfies ReadonlyArray<{
  key: keyof AnalyticsSearchState;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
}>;

type AdvancedFilterKey = "organizationId" | "shopId" | "cohort" | (typeof FILTERS)[number]["key"];

const ALL_ADVANCED_FILTER_KEYS: AdvancedFilterKey[] = [
  "organizationId",
  "shopId",
  "cohort",
  ...FILTERS.map((filter) => filter.key),
];

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
}) {
  return (
    <Field.Root>
      <Field.Label fontSize="xs">{label}</Field.Label>
      <NativeSelect.Root size="sm">
        <NativeSelect.Field bg="white" onChange={(event) => onChange(event.currentTarget.value)} value={value}>
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue || "all"} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  );
}

export function AnalysisControls({
  advancedFilterKeys = ALL_ADVANCED_FILTER_KEYS,
  helperText = "期間・比較・粒度・絞り込みはURLに保存されます。",
  search,
  sortOptions,
  update,
}: {
  advancedFilterKeys?: AdvancedFilterKey[];
  helperText?: string;
  search: AnalyticsSearchState;
  sortOptions?: Array<{ label: string; value: string }>;
  update: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
}) {
  const [draft, setDraft] = useState(search);

  useEffect(() => setDraft(search), [search]);

  const enabledFilters = new Set(advancedFilterKeys);
  const hasAdvancedControls = advancedFilterKeys.length > 0 || (sortOptions?.length ?? 0) > 0;
  const resetFilters = () => {
    const patch: Partial<AnalyticsSearchState> = {
      cadence: undefined,
      cohort: undefined,
      completeness: undefined,
      dimension: undefined,
      direction: undefined,
      health: undefined,
      lineUsage: undefined,
      organizationId: undefined,
      plan: undefined,
      shopId: undefined,
      shopSize: undefined,
      sort: undefined,
    };
    setDraft({ ...search, ...patch, direction: "desc" });
    update(patch);
  };

  const updateDraft = (patch: Partial<AnalyticsSearchState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const apply = () => {
    update({ ...draft, cursor: undefined, segmentCursor: undefined });
  };

  return (
    <Stack
      as="form"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      gap={4}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      p={{ base: 4, md: 5 }}
    >
      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={3}
        justify="space-between"
      >
        <Box>
          <Text fontSize="sm" fontWeight="bold">
            分析条件
          </Text>
          <Text color="gray.500" fontSize="xs" mt={1}>
            {helperText}
          </Text>
        </Box>
        <Button onClick={resetFilters} size="xs" type="button" variant="ghost">
          絞り込みを解除
        </Button>
      </Flex>

      <Grid gap={3} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }}>
        <Field.Root>
          <Field.Label fontSize="xs">期間の開始</Field.Label>
          <Input
            onChange={(event) => updateDraft({ from: event.currentTarget.value })}
            size="sm"
            type="date"
            value={draft.from}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">期間の終了</Field.Label>
          <Input
            onChange={(event) => updateDraft({ to: event.currentTarget.value })}
            size="sm"
            type="date"
            value={draft.to}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">比較期間の開始</Field.Label>
          <Input
            onChange={(event) => updateDraft({ compareFrom: event.currentTarget.value })}
            size="sm"
            type="date"
            value={draft.compareFrom}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">比較期間の終了</Field.Label>
          <Input
            onChange={(event) => updateDraft({ compareTo: event.currentTarget.value })}
            size="sm"
            type="date"
            value={draft.compareTo}
          />
        </Field.Root>
        <SelectField
          label="集計粒度"
          onChange={(value) => updateDraft({ granularity: value as AnalyticsSearchState["granularity"] })}
          options={GRANULARITY_OPTIONS.map((option) => [option.value, option.label] as const)}
          value={draft.granularity}
        />
      </Grid>

      {hasAdvancedControls ? (
        <Box as="details">
          <Text as="summary" color="blue.600" cursor="pointer" fontSize="sm" fontWeight="bold">
            詳細な絞り込み
          </Text>
          <Grid gap={3} mt={4} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}>
            {enabledFilters.has("organizationId") ? (
              <Field.Root>
                <Field.Label fontSize="xs">グループID</Field.Label>
                <Input
                  onChange={(event) =>
                    updateDraft({ organizationId: event.currentTarget.value || undefined, shopId: undefined })
                  }
                  placeholder="すべて"
                  size="sm"
                  value={draft.organizationId ?? ""}
                />
              </Field.Root>
            ) : null}
            {enabledFilters.has("shopId") ? (
              <Field.Root>
                <Field.Label fontSize="xs">店舗ID</Field.Label>
                <Input
                  onChange={(event) =>
                    updateDraft({ organizationId: undefined, shopId: event.currentTarget.value || undefined })
                  }
                  placeholder="すべて"
                  size="sm"
                  value={draft.shopId ?? ""}
                />
              </Field.Root>
            ) : null}
            {enabledFilters.has("cohort") ? (
              <Field.Root>
                <Field.Label fontSize="xs">登録cohort</Field.Label>
                <Input
                  onChange={(event) => updateDraft({ cohort: event.currentTarget.value || undefined })}
                  placeholder="YYYY-MM"
                  size="sm"
                  value={draft.cohort ?? ""}
                />
              </Field.Root>
            ) : null}
            {FILTERS.filter((filter) => enabledFilters.has(filter.key)).map((filter) => (
              <SelectField
                key={filter.key}
                label={filter.label}
                onChange={(value) => updateDraft({ [filter.key]: value || undefined })}
                options={filter.options}
                value={String(draft[filter.key] ?? "")}
              />
            ))}
            {sortOptions && sortOptions.length > 0 ? (
              <SelectField
                label="並び順"
                onChange={(value) => updateDraft({ sort: value || undefined })}
                options={[["", "標準"], ...sortOptions.map((option) => [option.value, option.label] as const)]}
                value={draft.sort ?? ""}
              />
            ) : null}
            {sortOptions && sortOptions.length > 0 ? (
              <SelectField
                label="並び方向"
                onChange={(value) => updateDraft({ direction: value === "asc" ? "asc" : "desc" })}
                options={[
                  ["desc", "降順"],
                  ["asc", "昇順"],
                ]}
                value={draft.direction}
              />
            ) : null}
          </Grid>
        </Box>
      ) : null}
      <Flex align={{ base: "stretch", sm: "center" }} direction={{ base: "column", sm: "row" }} gap={3} justify="end">
        <Text color="gray.500" fontSize="xs">
          変更は「この条件を適用」で反映されます。
        </Text>
        <Button colorPalette="blue" size="sm" type="submit">
          この条件を適用
        </Button>
      </Flex>
    </Stack>
  );
}
