import { Alert, Box, Button, Field, Flex, Grid, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { type AnalyticsMetadata, analyticsWarningMessage, isPeriodWarning } from "./DataStatus";
import { type AnalyticsSearchState, comparisonPeriodFor } from "./useAnalyticsSearch";

const GRANULARITY_OPTIONS = [
  { label: "日次", value: "day" },
  { label: "週次", value: "week" },
  { label: "月次", value: "month" },
] as const;

const USAGE_FILTER = {
  key: "usage",
  label: "利用の可能性",
  options: [
    ["", "すべて"],
    ["candidate", "利用候補（高い・あり）"],
    ["high", "可能性が高い"],
    ["possible", "可能性あり"],
    ["unknown", "状態不明"],
  ],
} as const;

const FILTERS = [
  USAGE_FILTER,
  {
    key: "dimension",
    label: "比較する切り口",
    options: [
      ["", "すべて"],
      ["registrationCohort", "登録時期"],
      ["plan", "プラン"],
      ["organizationShopCount", "組織店舗数"],
      ["shopStaffSize", "店舗スタッフ規模"],
      ["cadence", "通常周期"],
      ["lineUsage", "LINE利用"],
      ["submissionTrend", "最近の提出傾向"],
      ["adoptionAge", "導入時期"],
    ],
  },
  {
    key: "plan",
    label: "プラン",
    options: [
      ["", "すべて"],
      ["trial", "Trial"],
      ["free", "Free"],
      ["standard", "Standard"],
      ["pro", "Pro"],
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
      ["insufficientData", "まだ判定できない"],
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
    label: "要確認状態",
    options: [
      ["", "すべて"],
      ["needsAttention", "要確認あり"],
      ["hasUpcomingCycle", "次回シフトあり"],
      ["nextCycleMissing", "次回未作成"],
      ["cadenceDelayed", "通常周期からの遅れ"],
      ["notificationFailure", "通知失敗"],
      ["submissionDrop", "提出低下"],
      ["confirmationDelay", "確定遅れ"],
      ["longInactive", "長期無活動"],
      ["insufficientData", "まだ判定できない"],
    ],
  },
  {
    key: "completeness",
    label: "集計状態",
    options: [
      ["", "すべて"],
      ["complete", "集計済み"],
      ["partial", "一部のみ集計"],
      ["unavailable", "算出できない"],
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
  ...FILTERS.filter((filter) => filter.key !== "usage").map((filter) => filter.key),
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

function activeFilterCount(search: AnalyticsSearchState, advancedFilterKeys: AdvancedFilterKey[], hasSort: boolean) {
  const count = advancedFilterKeys.filter((key) => Boolean(search[key])).length;
  return count + (hasSort && search.sort ? 1 : 0);
}

function conditionSummary(
  search: AnalyticsSearchState,
  showComparison: boolean,
  showGranularity: boolean,
  filters: number,
) {
  const granularity = GRANULARITY_OPTIONS.find((option) => option.value === search.granularity)?.label;
  const values = [`${search.from} 〜 ${search.to}`];
  if (showGranularity && granularity) values.push(granularity);
  if (showComparison && search.compareFrom && search.compareTo) values.push("前期間と比較");
  if (filters > 0) values.push(`絞り込み ${filters}件`);
  return values.join(" · ");
}

export function AnalysisControls({
  advancedFilterKeys = ALL_ADVANCED_FILTER_KEYS,
  dataStartDate,
  helperText = "期間と絞り込みはURLに保存されます。",
  search,
  showComparison = true,
  showGranularity = true,
  sortOptions,
  update,
  warnings = [],
}: {
  advancedFilterKeys?: AdvancedFilterKey[];
  dataStartDate?: string | null;
  helperText?: string;
  search: AnalyticsSearchState;
  showComparison?: boolean;
  showGranularity?: boolean;
  sortOptions?: Array<{ label: string; value: string }>;
  update: (patch: Partial<AnalyticsSearchState>, replace?: boolean) => void;
  warnings?: AnalyticsMetadata["warnings"];
}) {
  const [draft, setDraft] = useState(search);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => setDraft(search), [search]);

  const enabledFilters = new Set(advancedFilterKeys);
  const filters = activeFilterCount(search, advancedFilterKeys, Boolean(sortOptions?.length));
  const hasAdvancedControls = advancedFilterKeys.length > 0 || Boolean(sortOptions?.length);
  const suggestedComparison = comparisonPeriodFor(draft.from, draft.to, dataStartDate);
  const periodWarnings = warnings.filter(isPeriodWarning).map(analyticsWarningMessage);

  const resetFilters = () => {
    const patch: Partial<AnalyticsSearchState> = {};
    for (const key of advancedFilterKeys) patch[key] = undefined;
    if (sortOptions?.length) {
      patch.direction = undefined;
      patch.sort = undefined;
    }
    setDraft((current) => ({ ...current, ...patch, direction: sortOptions?.length ? "desc" : current.direction }));
    update(patch);
  };

  const updateDraft = (patch: Partial<AnalyticsSearchState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const apply = () => {
    update({ ...draft, cursor: undefined, segmentCursor: undefined });
    setIsOpen(false);
  };

  return (
    <Stack
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      gap={isOpen || periodWarnings.length > 0 ? 4 : 0}
      p={4}
    >
      <Flex
        align={{ base: "start", sm: "center" }}
        direction={{ base: "column", sm: "row" }}
        gap={3}
        justify="space-between"
      >
        <Box>
          <Text fontSize="sm" fontWeight="bold">
            表示条件
          </Text>
          <Text color="gray.600" fontSize="sm" mt={1}>
            {conditionSummary(search, showComparison, showGranularity, filters)}
          </Text>
        </Box>
        <Button onClick={() => setIsOpen((current) => !current)} size="sm" variant="outline">
          {isOpen ? "閉じる" : "条件を変更"}
        </Button>
      </Flex>

      {periodWarnings.length > 0 ? (
        <Alert.Root borderRadius="md" status="warning" variant="subtle">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>選択期間の注意</Alert.Title>
            <Alert.Description>
              <Box as="ul" listStylePosition="inside">
                {periodWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </Box>
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      {isOpen ? (
        <Box
          as="form"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <Stack gap={4}>
            <Text color="gray.500" fontSize="xs">
              {helperText}
            </Text>
            <Grid
              gap={3}
              templateColumns={{
                base: "1fr",
                sm: "repeat(2, 1fr)",
                lg: showGranularity ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
              }}
            >
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
              {showGranularity ? (
                <SelectField
                  label="集計単位"
                  onChange={(value) => updateDraft({ granularity: value as AnalyticsSearchState["granularity"] })}
                  options={GRANULARITY_OPTIONS.map((option) => [option.value, option.label] as const)}
                  value={draft.granularity}
                />
              ) : null}
            </Grid>

            {showComparison ? (
              <Box borderTop="1px solid" borderColor="gray.100" pt={4}>
                {draft.compareFrom && draft.compareTo ? (
                  <Stack gap={3}>
                    <Flex align="center" justify="space-between">
                      <Text fontSize="sm" fontWeight="bold">
                        比較期間
                      </Text>
                      <Button
                        onClick={() => updateDraft({ compareFrom: undefined, compareTo: undefined })}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        比較を外す
                      </Button>
                    </Flex>
                    <Grid gap={3} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }}>
                      <Field.Root>
                        <Field.Label fontSize="xs">比較期間の開始</Field.Label>
                        <Input
                          onChange={(event) => updateDraft({ compareFrom: event.currentTarget.value || undefined })}
                          size="sm"
                          type="date"
                          value={draft.compareFrom}
                        />
                      </Field.Root>
                      <Field.Root>
                        <Field.Label fontSize="xs">比較期間の終了</Field.Label>
                        <Input
                          onChange={(event) => updateDraft({ compareTo: event.currentTarget.value || undefined })}
                          size="sm"
                          type="date"
                          value={draft.compareTo}
                        />
                      </Field.Root>
                    </Grid>
                  </Stack>
                ) : suggestedComparison ? (
                  <Flex
                    align={{ base: "start", sm: "center" }}
                    direction={{ base: "column", sm: "row" }}
                    gap={3}
                    justify="space-between"
                  >
                    <Text color="gray.600" fontSize="sm">
                      直前の同じ長さの期間と比較できます。
                    </Text>
                    <Button onClick={() => updateDraft(suggestedComparison)} size="sm" type="button" variant="outline">
                      前期間を追加
                    </Button>
                  </Flex>
                ) : (
                  <Text color="gray.500" fontSize="sm">
                    比較できる過去データがまだありません。
                  </Text>
                )}
              </Box>
            ) : null}

            {hasAdvancedControls ? (
              <Box borderTop="1px solid" borderColor="gray.100" pt={4}>
                <Text fontSize="sm" fontWeight="bold">
                  絞り込みと並び順
                </Text>
                <Grid gap={3} mt={3} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}>
                  {enabledFilters.has("usage") ? (
                    <SelectField
                      label={USAGE_FILTER.label}
                      onChange={(value) =>
                        updateDraft({ usage: (value || undefined) as AnalyticsSearchState["usage"] })
                      }
                      options={USAGE_FILTER.options}
                      value={draft.usage ?? ""}
                    />
                  ) : null}
                  {enabledFilters.has("organizationId") ? (
                    <Field.Root>
                      <Field.Label fontSize="xs">組織ID</Field.Label>
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
                      <Field.Label fontSize="xs">登録時期</Field.Label>
                      <Input
                        onChange={(event) => updateDraft({ cohort: event.currentTarget.value || undefined })}
                        placeholder="YYYY-MM"
                        size="sm"
                        value={draft.cohort ?? ""}
                      />
                    </Field.Root>
                  ) : null}
                  {FILTERS.filter((filter) => filter.key !== "usage" && enabledFilters.has(filter.key)).map(
                    (filter) => (
                      <SelectField
                        key={filter.key}
                        label={filter.label}
                        onChange={(value) => updateDraft({ [filter.key]: value || undefined })}
                        options={filter.options}
                        value={String(draft[filter.key] ?? "")}
                      />
                    ),
                  )}
                  {sortOptions?.length ? (
                    <SelectField
                      label="並び順"
                      onChange={(value) => updateDraft({ sort: value || undefined })}
                      options={[["", "標準"], ...sortOptions.map((option) => [option.value, option.label] as const)]}
                      value={draft.sort ?? ""}
                    />
                  ) : null}
                  {sortOptions?.length ? (
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

            <Flex
              align={{ base: "stretch", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={3}
              justify="end"
            >
              {hasAdvancedControls ? (
                <Button onClick={resetFilters} size="sm" type="button" variant="ghost">
                  {sortOptions?.length ? "絞り込みと並び順を解除" : "絞り込みを解除"}
                </Button>
              ) : null}
              <Button colorPalette="blue" size="sm" type="submit">
                この条件を適用
              </Button>
            </Flex>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
