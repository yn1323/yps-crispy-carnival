import { Box, parseDate } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { createDeferred } from "@/src/devtools/createDeferred";
import { addDays, formatDateWithWeekday, todayJST } from "@/src/domains/shift/date";
import { CreateRecruitmentFormView } from "./CreateRecruitmentFormView";
import { CreateRecruitmentForm, type CreateRecruitmentSelectableShop } from "./index.tsx";
import { RecruitmentShopSelection } from "./RecruitmentShopSelection";
import { buildRecruitmentComparison, type CreateRecruitmentData, getHolidaySummary } from "./script";

const meta = {
  title: "Features/CreateRecruitmentForm",
  component: CreateRecruitmentForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateRecruitmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const STORY_TODAY = "2026-05-01";
const FIXED_SHOP = { shopId: "shop-main", shopName: "本店" };
const SELECTABLE_SHOPS: CreateRecruitmentSelectableShop[] = [
  { ...FIXED_SHOP, regularClosedDays: ["mon"] },
  { shopId: "shop-station", shopName: "駅前店", regularClosedDays: ["tue"] },
];
const LONG_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
const storyToday = () => dayjs(STORY_TODAY);

const editToday = todayJST();
const editInitialValues = {
  periodStart: addDays(editToday, 4),
  periodEnd: addDays(editToday, 8),
  deadline: addDays(editToday, 3),
  shopClosedDates: [addDays(editToday, 5)],
};

const EditFlowHarness = () => {
  const [saved, setSaved] = useState(false);
  return saved ? (
    <div role="status">変更を保存しました</div>
  ) : (
    <StepperDialog title="シフト募集を編集" isOpen onClose={() => {}} onOpenChange={() => {}}>
      <CreateRecruitmentForm
        mode="edit"
        defaultValues={editInitialValues}
        shopTarget={{ mode: "fixed", shop: FIXED_SHOP }}
        onSubmit={() => setSaved(true)}
        onCancel={() => {}}
      />
    </StepperDialog>
  );
};

export const EditRecruitmentFlow: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <EditFlowHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement, "シフト募集を編集");
    const canvas = within(root);
    await clickButton(root, "次へ");
    await clickDate(root, dayjs(editInitialValues.shopClosedDates[0]), false);
    await clickDate(root, dayjs(addDays(editToday, 6)));
    await clickButton(root, "次へ");
    await clickButton(root, "確認へ");
    await expect(canvas.getByText("対象スタッフ全員に変更を通知します")).toBeVisible();
    await expect(canvas.getAllByText("変更前").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("変更後").length).toBeGreaterThan(0);
    await expect(canvas.getByText(formatDateWithWeekday(editInitialValues.shopClosedDates[0]))).toBeVisible();
    await expect(canvas.getByText(formatDateWithWeekday(addDays(editToday, 6)))).toBeVisible();
    await expect(canvas.queryByText("提出状況")).not.toBeInTheDocument();
    await expect(canvas.queryByText("対象外になる日")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "変更を保存" }));
    await within(canvasElement).findByRole("status");
  },
};

const editConfirmationInitialValues = {
  periodStart: addDays(STORY_TODAY, 4),
  periodEnd: addDays(STORY_TODAY, 7),
  deadline: addDays(STORY_TODAY, 2),
  shopClosedDates: [addDays(STORY_TODAY, 5)],
};

export const EditRecruitmentConfirmation: Story = {
  name: "編集内容の確認",
  args: {
    mode: "edit",
    defaultValues: {
      periodStart: addDays(STORY_TODAY, 4),
      periodEnd: addDays(STORY_TODAY, 8),
      deadline: addDays(STORY_TODAY, 3),
      shopClosedDates: [addDays(STORY_TODAY, 6)],
    },
  },
  render: function Render(args) {
    const values = args.defaultValues ?? editConfirmationInitialValues;
    const { register } = useForm<CreateRecruitmentData>({ defaultValues: values });
    const today = parseDate(STORY_TODAY);
    const periodStart = parseDate(values.periodStart);
    const periodEnd = parseDate(values.periodEnd);
    const deadline = parseDate(values.deadline);
    const periodLabel = `${formatDateWithWeekday(values.periodStart)} 〜 ${formatDateWithWeekday(values.periodEnd)}`;

    return (
      <StepperDialog title="シフト募集を編集" isOpen onClose={() => {}} onOpenChange={() => {}}>
        <CreateRecruitmentFormView
          currentStep="confirm"
          isEditing
          isPeriodOnly={false}
          hasShopStep={false}
          canContinueFromShop
          submitLoading={false}
          hiddenFields={{
            periodStart: register("periodStart"),
            periodEnd: register("periodEnd"),
            deadline: register("deadline"),
          }}
          period={{
            value: [periodStart, periodEnd],
            min: today.add({ days: 1 }),
            max: periodEnd,
            initialFocus: periodStart,
            label: periodLabel,
            dayCount: dayjs(values.periodEnd).diff(dayjs(values.periodStart), "day") + 1,
          }}
          holidays={{
            value: parseDate(values.shopClosedDates),
            min: periodStart,
            max: periodEnd,
            desktopMonths: 1,
            allPeriodDaysAreHolidays: false,
          }}
          deadline={{ value: [deadline], min: today, initialFocus: deadline, desktopMonths: 1 }}
          confirmation={{
            comparison: buildRecruitmentComparison(editConfirmationInitialValues, values),
            shopName: FIXED_SHOP.shopName,
            periodLabel,
            holidaySummary: getHolidaySummary(values.shopClosedDates),
            deadlineLabel: `${formatDateWithWeekday(values.deadline)} 23:59`,
            reminderDescription: "提出期限の前日17:00に、未提出のスタッフへ自動催促通知を送ります。",
          }}
          onSubmit={(event) => event.preventDefault()}
          onCancel={() => {}}
          onPeriodChange={() => {}}
          onHolidayChange={() => {}}
          onDeadlineChange={() => {}}
          onShopChange={() => {}}
          onGoToShop={() => {}}
          onGoToPeriodFromShop={() => {}}
          onGoToPeriod={() => {}}
          onGoToHolidays={() => {}}
          onGoToDeadline={() => {}}
          onGoToConfirm={() => {}}
        />
      </StepperDialog>
    );
  },
};

export const EditRecruitmentConfirmationDeadlineOnly: Story = {
  ...EditRecruitmentConfirmation,
  name: "編集内容の確認（提出期限だけ変更）",
  args: {
    ...EditRecruitmentConfirmation.args,
    defaultValues: { ...editConfirmationInitialValues, deadline: addDays(STORY_TODAY, 3) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(await getTestRoot(canvasElement, "シフト募集を編集"));
    await expect(canvas.getAllByText("変更なし")).toHaveLength(2);
    await expect(canvas.getAllByText("変更前")).toHaveLength(1);
    await expect(canvas.getAllByText("変更後")).toHaveLength(1);
    await expect(canvas.getByText("対象スタッフ全員に変更を通知します")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "変更を保存" })).toBeEnabled();
  },
};

export const EditRecruitmentConfirmationUnchanged: Story = {
  ...EditRecruitmentConfirmation,
  name: "編集内容の確認（すべて変更なし）",
  args: { ...EditRecruitmentConfirmation.args, defaultValues: editConfirmationInitialValues },
  play: async ({ canvasElement }) => {
    const canvas = within(await getTestRoot(canvasElement, "シフト募集を編集"));
    await expect(canvas.getAllByText("変更なし")).toHaveLength(3);
    await expect(canvas.queryByText("変更前")).not.toBeInTheDocument();
    await expect(canvas.queryByText("変更後")).not.toBeInTheDocument();
    await expect(canvas.getByText("変更がないため、通知は送りません。")).toBeVisible();
    await expect(canvas.getByText("現在の自動催促の予定は変わりません。")).toBeVisible();
    await expect(canvas.queryByText("対象スタッフ全員に変更を通知します")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  },
};

const ShopSelectionHarness = () => {
  const [submittedShopName, setSubmittedShopName] = useState("");
  const [shops, setShops] = useState(SELECTABLE_SHOPS);

  return (
    <>
      <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
        <CreateRecruitmentForm
          today={STORY_TODAY}
          shopTarget={{ mode: "select", shops }}
          onSubmit={(_, selectedShop) => setSubmittedShopName(selectedShop?.shopName ?? "")}
          onCancel={() => {}}
        />
      </StepperDialog>
      <output hidden data-testid="submitted-shop-name">
        {submittedShopName}
      </output>
      <button
        type="button"
        hidden
        data-testid="remove-station-shop"
        onClick={() => setShops((current) => current.filter((shop) => shop.shopId !== "shop-station"))}
      >
        駅前店を候補から外す
      </button>
    </>
  );
};

const DoubleSubmitGuardHarness = () => {
  const [submitCount, setSubmitCount] = useState(0);
  const [closeCount, setCloseCount] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);

  return (
    <>
      <StepperDialog
        title="新しい募集をつくる"
        isOpen={isOpen}
        onOpenChange={({ open }) => setIsOpen(open)}
        onClose={() => {
          setCloseCount((current) => current + 1);
          setIsOpen(false);
        }}
        preventClose={isSubmitting}
      >
        <CreateRecruitmentForm
          key={sessionRevision}
          today={STORY_TODAY}
          onSubmit={async () => {
            setSubmitCount((current) => current + 1);
            const submission = createDeferred();
            pendingSubmission.current = submission;
            await submission.promise;
            if (pendingSubmission.current === submission) pendingSubmission.current = null;
            setIsOpen(false);
          }}
          onCancel={() => setIsOpen(false)}
          onSubmittingChange={setIsSubmitting}
        />
      </StepperDialog>
      <output hidden data-testid="submit-call-count">
        {submitCount}
      </output>
      <output hidden data-testid="create-close-count">
        {closeCount}
      </output>
      <output hidden data-testid="create-submitting-state">
        {String(isSubmitting)}
      </output>
      <button
        type="button"
        hidden
        data-testid="release-recruitment-submission"
        onClick={() => pendingSubmission.current?.resolve()}
      >
        募集作成処理を完了する
      </button>
      <button
        type="button"
        hidden
        data-testid="reopen-recruitment-dialog"
        onClick={() => {
          setSessionRevision((revision) => revision + 1);
          setIsOpen(true);
        }}
      >
        募集作成を再度開く
      </button>
    </>
  );
};

export const InDialog: Story = {
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm
        today={STORY_TODAY}
        shopTarget={{ mode: "fixed", shop: FIXED_SHOP }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    </StepperDialog>
  ),
};

export const MobileFullScreen: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm
        today={STORY_TODAY}
        shopTarget={{ mode: "fixed", shop: FIXED_SHOP }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    </StepperDialog>
  ),
};

export const ShopSelectionInDialog: Story = {
  render: () => <ShopSelectionHarness />,
};

export const ShopSelectionMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <ShopSelectionHarness />,
};

export const ShopSelectionSelected: Story = {
  render: () => (
    <Box maxW="760px">
      <RecruitmentShopSelection shops={SELECTABLE_SHOPS} selectedShopId={FIXED_SHOP.shopId} onChange={() => {}} />
    </Box>
  ),
};

export const FutureMonthsNavigation: Story = {
  globals: {
    viewport: { value: "desktop", isRotated: false },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const calendar = getCalendarRoot(root);
    const initialSize = getElementSize(calendar);
    const currentMonth = storyToday().startOf("month");
    const futurePeriodStart = currentMonth.add(1, "month").endOf("month");
    const futurePeriodEnd = currentMonth.add(3, "month").endOf("month");
    const previousTrigger = getCalendarNavigationButton(calendar, "desktop", "前の期間を表示");
    const nextTrigger = getCalendarNavigationButton(calendar, "desktop", "次の期間を表示");

    expect(getDesktopMonthLabels(calendar)).toEqual([
      currentMonth.format("YYYY年M月"),
      currentMonth.add(1, "month").format("YYYY年M月"),
    ]);
    expectFixedCalendarWeeks(calendar, 2);
    expectCaret(previousTrigger, "left", false);
    expectCaret(nextTrigger, "right", true);
    expectSingleNavigationPair(calendar);
    expect(previousTrigger).not.toBeVisible();
    expect(previousTrigger).toBeDisabled();
    expect(previousTrigger.offsetWidth).toBeGreaterThan(0);
    await expectMutedHover(nextTrigger, calendar);

    await userEvent.click(nextTrigger);
    await waitFor(() =>
      expect(getDesktopMonthLabels(calendar)).toEqual([
        currentMonth.add(2, "month").format("YYYY年M月"),
        currentMonth.add(3, "month").format("YYYY年M月"),
      ]),
    );
    expectElementSize(calendar, initialSize);
    expectFixedCalendarWeeks(calendar, 2);
    expect(previousTrigger).toBeEnabled();
    expect(nextTrigger).toBeDisabled();
    expect(nextTrigger).not.toBeVisible();
    expectCaret(previousTrigger, "left", true);
    expectCaret(nextTrigger, "right", false);
    expect(nextTrigger.offsetWidth).toBeGreaterThan(0);

    await userEvent.click(previousTrigger);
    await waitFor(() =>
      expect(getDesktopMonthLabels(calendar)).toEqual([
        currentMonth.format("YYYY年M月"),
        currentMonth.add(1, "month").format("YYYY年M月"),
      ]),
    );
    expectElementSize(calendar, initialSize);
    expectCaret(previousTrigger, "left", false);
    expectCaret(nextTrigger, "right", true);
    expect(previousTrigger).not.toBeVisible();

    await clickDate(root, futurePeriodStart);
    await userEvent.click(nextTrigger);
    await waitFor(() => expect(getDesktopMonthLabels(calendar).at(-1)).toBe(futurePeriodEnd.format("YYYY年M月")));
    await clickDate(root, futurePeriodEnd);
    await clickButton(root, "次へ");
    await within(root).findByText("募集期間は31日以内にしてください");
    expect(within(root).getByText("シフト期間を選択")).toBeTruthy();
  },
};

export const MobileFutureMonthsNavigation: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: MobileFullScreen.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const calendar = getCalendarRoot(root);
    const initialSize = getElementSize(calendar);
    const currentMonth = storyToday().startOf("month");
    const previousTrigger = getCalendarNavigationButton(calendar, "mobile", "前の期間を表示");
    const nextTrigger = getCalendarNavigationButton(calendar, "mobile", "次の期間を表示");

    expect(getMobileMonthLabel(calendar)).toBe(currentMonth.format("YYYY年M月"));
    expectFixedCalendarWeeks(calendar, 1);
    expectCaret(previousTrigger, "left", false);
    expectCaret(nextTrigger, "right", true);
    expectSingleNavigationPair(calendar);
    expect(previousTrigger).not.toBeVisible();
    expect(previousTrigger).toBeDisabled();
    expect(previousTrigger.offsetWidth).toBeGreaterThan(0);

    for (let monthOffset = 1; monthOffset <= 3; monthOffset += 1) {
      await userEvent.click(nextTrigger);
      await waitFor(() =>
        expect(getMobileMonthLabel(calendar)).toBe(currentMonth.add(monthOffset, "month").format("YYYY年M月")),
      );
      expectElementSize(calendar, initialSize);
      expectFixedCalendarWeeks(calendar, 1);
    }

    expect(previousTrigger).toBeEnabled();
    expect(nextTrigger).not.toBeVisible();
    expect(nextTrigger).toBeDisabled();
    expectCaret(previousTrigger, "left", true);
    expectCaret(nextTrigger, "right", false);
    expect(nextTrigger.offsetWidth).toBeGreaterThan(0);
  },
};

export const InteractiveBasicFlow: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const today = storyToday();
    const periodStart = today.add(3, "day");
    const periodEnd = today.add(5, "day");
    const deadline = periodStart.subtract(1, "day");

    expect(canvas.queryByText("対象店舗を選択")).not.toBeInTheDocument();
    await canvas.findByText("シフト期間を選択");
    expectDateDisabled(root, today, "期間カレンダーで今日以前は選択不可");
    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("対象店舗")).toBeTruthy();
    expect(canvas.getByText("本店")).toBeTruthy();
    expect(canvas.getByText("定休日")).toBeTruthy();
    expect(canvas.getByText("なし")).toBeTruthy();
    expect(canvas.getAllByText("提出期限").length).toBeGreaterThan(0);
    expect(canvas.getByText("通知方法")).toBeTruthy();
    expect(await canvas.findByText("メール・LINEで通知します")).toBeTruthy();
  },
};

export const InteractiveShopSelectionFlow: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <ShopSelectionHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const story = within(canvasElement);
    const periodStart = dayjs("2026-05-04");
    const periodEnd = dayjs("2026-05-06");
    const monday = periodStart;
    const tuesday = periodStart.add(1, "day");

    await canvas.findByText("対象店舗を選択");
    await expect(canvas.getByRole("button", { name: "次へ" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("radio", { name: "本店を選択" }));
    await expect(canvas.getByRole("radio", { name: "本店を選択" })).toBeChecked();
    await clickButton(root, "次へ");

    await canvas.findByText("シフト期間を選択");
    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await expect(getDateButton(root, monday)).toHaveAttribute("data-selected");
    await clickButton(root, "戻る");
    await canvas.findByText("シフト期間を選択");
    await clickButton(root, "戻る");

    await canvas.findByText("対象店舗を選択");
    await userEvent.click(canvas.getByRole("radio", { name: "駅前店を選択" }));
    await expect(canvas.getByRole("radio", { name: "駅前店を選択" })).toBeChecked();
    await clickButton(root, "次へ");
    await canvas.findByText("シフト期間を選択");
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await waitFor(() => expect(getDateButton(root, monday)).not.toHaveAttribute("data-selected"));
    await expect(getDateButton(root, tuesday)).toHaveAttribute("data-selected");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("対象店舗")).toBeTruthy();
    expect(canvas.getByText("駅前店")).toBeTruthy();
    expect(canvas.getByText(formatDatePreview(tuesday))).toBeTruthy();
    expect(canvas.queryByText(formatDatePreview(monday))).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "募集をつくる" }));
    await waitFor(() => expect(story.getByTestId("submitted-shop-name")).toHaveTextContent("駅前店"));
  },
};

export const InteractiveSelectedShopInvalidation: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <ShopSelectionHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const story = within(canvasElement);
    const periodStart = dayjs("2026-05-04");

    await userEvent.click(await canvas.findByRole("radio", { name: "駅前店を選択" }));
    await clickButton(root, "次へ");
    await clickDate(root, periodStart);
    await clickDate(root, periodStart.add(2, "day"));
    await clickButton(root, "次へ");
    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");
    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");
    await canvas.findByText("内容を確認");
    expect(canvas.getByText("駅前店")).toBeTruthy();

    fireEvent.click(story.getByTestId("remove-station-shop"));

    await canvas.findByText("対象店舗を選択");
    expect(canvas.queryByText("内容を確認")).not.toBeInTheDocument();
    expect(canvas.queryByRole("radio", { name: "駅前店を選択" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "次へ" })).toBeDisabled();
  },
};

export const InteractiveHolidayEdgeCases: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(3, "day");
    const holidays = [0, 1, 2, 3, 4].map((offset) => periodStart.add(offset, "day"));
    const periodEnd = holidays.at(-1);
    if (!periodEnd) throw new Error("テスト用の期間終了日を作成できませんでした");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    for (const holiday of holidays) {
      await clickDate(root, holiday);
    }
    await clickButton(root, "次へ");

    await canvas.findByText("シフト期間のすべてをお休みにはできません");
    await clickDate(root, periodEnd, false);
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("4日")).toBeTruthy();
    expect(await canvas.findByText(/ほか1日/)).toBeTruthy();
  },
};

export const InteractiveDefaultRegularClosedDays: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm today={STORY_TODAY} regularClosedDays={["mon"]} onSubmit={() => {}} onCancel={() => {}} />
    </StepperDialog>
  ),
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = nextWeekday(storyToday().add(3, "day"), 1);
    const periodEnd = periodStart.add(2, "day");
    const deadline = periodStart.subtract(1, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("1日")).toBeTruthy();
    expect(await canvas.findByText(formatDatePreview(periodStart))).toBeTruthy();
  },
};

export const InteractiveDeadlineRestriction: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(5, "day");
    const periodEnd = storyToday().add(7, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    expectDateDisabled(root, periodStart, "提出期限カレンダーで開始日当日は選択不可");
    await clickButton(root, "確認へ");
    await canvas.findByText("提出期限を選択してください");

    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");
    await canvas.findByText("内容を確認");
  },
};

export const InteractiveNextMonthOnlyFlow: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const nextMonth = storyToday().add(1, "month").startOf("month");
    const followingMonth = nextMonth.add(1, "month");
    const periodStart = nextMonth.add(14, "day");
    const periodEnd = nextMonth.add(24, "day");
    const deadline = periodStart.subtract(1, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    expect(getDesktopMonthLabels(getCalendarRoot(root))).toEqual([nextMonth.format("YYYY年M月")]);

    await clickButton(root, "戻る");
    await canvas.findByText("シフト期間を選択");
    await waitFor(() =>
      expect(getDesktopMonthLabels(getCalendarRoot(root))).toEqual([
        nextMonth.format("YYYY年M月"),
        followingMonth.format("YYYY年M月"),
      ]),
    );

    await clickButton(root, "次へ");
    await canvas.findByText("定休日を選択(任意)");
    expect(getDesktopMonthLabels(getCalendarRoot(root))).toEqual([nextMonth.format("YYYY年M月")]);
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("なし")).toBeTruthy();
    expect(await canvas.findByText(formatDateRangePreview(periodStart, periodEnd))).toBeTruthy();
    expect(await canvas.findByText(formatDeadlinePreview(deadline))).toBeTruthy();
  },
};

export const InteractiveMobileBasicFlow: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: MobileFullScreen.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(2, "day");
    const periodEnd = storyToday().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("なし")).toBeTruthy();
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <DoubleSubmitGuardHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const body = within(canvasElement.ownerDocument.body);
    const story = within(canvasElement);
    const periodStart = storyToday().add(2, "day");
    const periodEnd = storyToday().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");

    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    const submitButton = canvas.getByRole("button", { name: "募集をつくる" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => expect(story.getByTestId("submit-call-count")).toHaveTextContent("1"));
    await waitFor(() => expect(root).toHaveAttribute("aria-busy", "true"));
    await expect(canvas.getByRole("button", { name: "戻る" })).toBeDisabled();
    await expect(submitButton).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await expect(root).toBeVisible();
    await expect(story.getByTestId("create-close-count")).toHaveTextContent("0");

    fireEvent.click(story.getByTestId("release-recruitment-submission"));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "新しい募集をつくる" })).not.toBeInTheDocument());
    await waitFor(() => expect(story.getByTestId("create-submitting-state")).toHaveTextContent("false"));

    fireEvent.click(story.getByTestId("reopen-recruitment-dialog"));
    const reopenedRoot = await getTestRoot(canvasElement);
    const reopenedCanvas = within(reopenedRoot);
    await expect(reopenedRoot).not.toHaveAttribute("aria-busy");
    await expect(reopenedCanvas.getByRole("button", { name: "キャンセル" })).toBeEnabled();
    await expect(reopenedCanvas.getByRole("button", { name: "次へ" })).toBeEnabled();
  },
};

export const Submitting: Story = {
  name: "募集作成中",
  render: () => <DoubleSubmitGuardHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(2, "day");
    const periodEnd = storyToday().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");
    await canvas.findByText("定休日を選択(任意)");
    await clickButton(root, "次へ");
    await canvas.findByText("提出期限を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");
    await canvas.findByText("内容を確認");
    await userEvent.click(canvas.getByRole("button", { name: "募集をつくる" }));
    await waitFor(() => expect(root).toHaveAttribute("aria-busy", "true"));
  },
};

async function getTestRoot(canvasElement: HTMLElement, title = "新しい募集をつくる"): Promise<HTMLElement> {
  const body = within(canvasElement.ownerDocument.body);

  // 前のStoryの閉じかけたPortalを固定参照せず、現在表示中のDialogを待つ。
  return waitFor(
    () => {
      const dialog = body.getByRole("dialog", { name: title });
      expect(dialog).toBeVisible();
      return dialog;
    },
    { timeout: 5_000 },
  );
}

function getCalendarRoot(root: HTMLElement): HTMLElement {
  const calendar = root.querySelector<HTMLElement>('[data-scope="date-picker"][data-part="root"]');
  expect(calendar).toBeTruthy();
  return calendar as HTMLElement;
}

function getCalendarNavigationButton(
  calendar: HTMLElement,
  viewport: "desktop" | "mobile",
  label: "前の期間を表示" | "次の期間を表示",
): HTMLButtonElement {
  const button = calendar.querySelector<HTMLButtonElement>(
    `[data-calendar-navigation="${viewport}"] button[aria-label="${label}"]`,
  );
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getDesktopMonthLabels(calendar: HTMLElement): string[] {
  return Array.from(
    calendar.querySelectorAll<HTMLElement>('[data-calendar-navigation="desktop"] [data-calendar-month-title]'),
  ).map((title) => title.textContent?.trim() ?? "");
}

function getMobileMonthLabel(calendar: HTMLElement): string {
  const title = calendar.querySelector<HTMLElement>('[data-calendar-navigation="mobile"] [data-calendar-month-title]');
  expect(title).toBeTruthy();
  return title?.textContent?.trim() ?? "";
}

function expectCaret(button: HTMLButtonElement, direction: "left" | "right", isVisible: boolean) {
  expect(button.textContent?.trim()).toBe("");
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  const caret = button.querySelector(`[data-calendar-caret="${direction}"]`);
  expect(caret).toBeTruthy();
  if (isVisible) {
    expect(caret).toBeVisible();
  } else {
    expect(caret).not.toBeVisible();
  }
}

async function expectMutedHover(button: HTMLButtonElement, calendar: HTMLElement) {
  const colorProbe = document.createElement("div");
  colorProbe.style.backgroundColor = "var(--chakra-colors-bg-muted)";
  calendar.append(colorProbe);
  const mutedBackground = getComputedStyle(colorProbe).backgroundColor;
  colorProbe.remove();

  button.setAttribute("data-hover", "");
  await waitFor(() => {
    expect(getComputedStyle(button).backgroundColor).toBe(mutedBackground);
    expect(getComputedStyle(button).cursor).toBe("pointer");
  });
  button.removeAttribute("data-hover");
}

function expectSingleNavigationPair(calendar: HTMLElement) {
  expect(calendar.querySelectorAll('[data-part="prev-trigger"]')).toHaveLength(1);
  expect(calendar.querySelectorAll('[data-part="next-trigger"]')).toHaveLength(1);
}

function expectFixedCalendarWeeks(calendar: HTMLElement, monthCount: number) {
  const weekCounts = Array.from(calendar.querySelectorAll("table tbody")).map(
    (tableBody) => tableBody.querySelectorAll("tr").length,
  );
  expect(weekCounts).toEqual(Array.from({ length: monthCount }, () => 6));
}

type ElementSize = {
  width: number;
  height: number;
};

function getElementSize(element: HTMLElement): ElementSize {
  return { width: element.offsetWidth, height: element.offsetHeight };
}

function expectElementSize(element: HTMLElement, expected: ElementSize) {
  const current = getElementSize(element);
  expect(current).toEqual(expected);
}

function getDateButton(root: HTMLElement, date: dayjs.Dayjs): HTMLButtonElement {
  const iso = date.format("YYYY-MM-DD");
  const day = date.format("D");
  const monthLabel = date.format("YYYY年M月");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-part="table-cell-trigger"]')).filter(
    (button) => button.textContent?.trim() === day,
  );

  const ariaMatch = buttons.find((button) => button.getAttribute("aria-label") === `Choose ${formatAriaDate(date)}`);
  if (ariaMatch) return ariaMatch;

  const exactMatch = buttons.find((button) =>
    Array.from(button.attributes).some((attribute) => attribute.value.includes(iso)),
  );
  if (exactMatch) return exactMatch;

  const monthMatch = buttons.find((button) =>
    button.closest("table")?.parentElement?.textContent?.includes(monthLabel),
  );
  if (monthMatch) return monthMatch;

  if (buttons.length === 1) return buttons[0];
  expect(buttons, `${iso} の日付ボタン候補`).not.toHaveLength(0);
  throw new Error(`${iso} の日付ボタンが見つかりませんでした`);
}

async function clickDate(root: HTMLElement, date: dayjs.Dayjs, selected = true) {
  await ensureMonthVisible(root, date);
  const button = getDateButton(root, date);
  expect(isDateDisabled(button), `${date.format("YYYY-MM-DD")} は選択可能であること`).toBe(false);
  await userEvent.click(button);
  await waitFor(() => expect(button.hasAttribute("data-selected")).toBe(selected));
}

function expectDateDisabled(root: HTMLElement, date: dayjs.Dayjs, context: string) {
  const button = getDateButton(root, date);
  expect(isDateDisabled(button), `${context}: ${date.format("YYYY-MM-DD")}`).toBe(true);
}

function isDateDisabled(button: HTMLButtonElement): boolean {
  return (
    button.disabled ||
    button.getAttribute("aria-disabled") === "true" ||
    button.hasAttribute("data-disabled") ||
    !!button.closest("[data-disabled]")
  );
}

async function ensureMonthVisible(root: HTMLElement, date: dayjs.Dayjs) {
  const monthLabel = date.format("YYYY年M月");
  for (let i = 0; i < 4; i += 1) {
    if (root.textContent?.includes(monthLabel)) return;
    const nextButton = root.querySelector<HTMLButtonElement>('[data-part="next-trigger"]');
    if (!nextButton || isDateDisabled(nextButton)) break;
    const previousCalendarText = root.textContent;
    await userEvent.click(nextButton);
    await waitFor(() => expect(root.textContent).not.toBe(previousCalendarText));
  }
  throw new Error(`${monthLabel} がカレンダーに表示されませんでした`);
}

async function clickButton(root: HTMLElement, text: string) {
  const button = within(root).getByRole("button", { name: text });
  expect(button).toBeTruthy();
  await userEvent.click(button);
}

function formatDateRangePreview(start: dayjs.Dayjs, end: dayjs.Dayjs): string {
  return `${formatDatePreview(start)} 〜 ${formatDatePreview(end)}`;
}

function formatDatePreview(date: dayjs.Dayjs): string {
  return `${date.format("M/D")}(${getWeekdayLabel(date)})`;
}

function formatDeadlinePreview(date: dayjs.Dayjs): string {
  return `${formatDatePreview(date)} 23:59`;
}

function getWeekdayLabel(date: dayjs.Dayjs): string {
  return ["日", "月", "火", "水", "木", "金", "土"][date.day()] ?? "";
}

function formatAriaDate(date: dayjs.Dayjs): string {
  return `${date.year()}年${date.month() + 1}月${date.date()}日${LONG_WEEKDAYS[date.day()]}`;
}

function nextWeekday(from: dayjs.Dayjs, weekday: number): dayjs.Dayjs {
  const offset = (weekday - from.day() + 7) % 7;
  return from.add(offset, "day");
}
