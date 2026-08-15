import { Box, Flex, HStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AUTHENTICATED_APP_CONTENT_HEIGHT,
  AuthenticatedAppShell,
} from "@/src/components/templates/AuthenticatedAppShell";
import { FocusedFlowHeader } from "@/src/components/templates/FocusedFlowHeader";
import { Button } from "@/src/components/ui/Button";
import { Toaster, toaster } from "@/src/components/ui/toaster";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPage } from "./index";

const mockData: ShiftBoardData = {
  shopId: "shop-1" as Id<"shops">,
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  recruitment: {
    _id: "recruitment-1" as Id<"recruitments">,
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    deadline: "2026-01-17",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: Date.UTC(2099, 0, 16, 8),
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [
    { _id: "s1" as Id<"staffs">, name: "鈴木太郎", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s2" as Id<"staffs">, name: "佐藤花子", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s3" as Id<"staffs">, name: "田中次郎", isSubmitted: false, wasSubmittedAtDraft: false },
    { _id: "s4" as Id<"staffs">, name: "山田美咲", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s5" as Id<"staffs">, name: "高橋翔太", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s6" as Id<"staffs">, name: "渡辺優子", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s7" as Id<"staffs">, name: "伊藤健一", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s8" as Id<"staffs">, name: "中村真理", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s9" as Id<"staffs">, name: "小林大輔", isSubmitted: false, wasSubmittedAtDraft: false },
    { _id: "s10" as Id<"staffs">, name: "加藤美穂", isSubmitted: true, wasSubmittedAtDraft: false },
  ],
  requestedSlots: [
    { staffId: "s1" as Id<"staffs">, date: "2026-01-20", startTime: "09:00", endTime: "14:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-20", startTime: "15:00", endTime: "21:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "14:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "18:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-21", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "19:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-20", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-22", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-23", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-24", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-26", startTime: "14:00", endTime: "21:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "15:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-20", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-22", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-24", startTime: "09:00", endTime: "17:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-21", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-23", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-25", startTime: "12:00", endTime: "20:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "16:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "18:00" },
  ],
  requestedDates: [],
  shiftAssignments: [],
  positions: [{ _id: "position-1" as Id<"positions">, name: "シフト", color: "#3b82f6", isDefault: true }],
  timeRange: { start: 9, end: 22, unit: 30 },
};

const mockDataWithInitialWarnings: ShiftBoardData = {
  ...mockData,
  recruitment: {
    ...mockData.recruitment,
    draftSavedAt: Date.UTC(2026, 0, 18, 2),
  },
  shiftAssignments: [
    {
      staffId: "s1" as Id<"staffs">,
      date: "2026-01-20",
      startTime: "09:00",
      endTime: "22:00",
      positionId: "position-1" as Id<"positions">,
    },
    {
      staffId: "s3" as Id<"staffs">,
      date: "2026-01-20",
      startTime: "09:00",
      endTime: "13:00",
      positionId: "position-1" as Id<"positions">,
    },
  ],
};

const meta = {
  title: "Features/ShiftBoard/ShiftBoardPage",
  component: ShiftBoardPage,
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data: mockData,
    recruitmentId: "recruitment-1" as Id<"recruitments">,
  },
} satisfies Meta<typeof ShiftBoardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const demoLink = await canvas.findByRole("link", { name: "勤務時間の入力方法（別タブで開きます）" });

    await expect(demoLink).toHaveAttribute("href", "/demo/shiftboard");
    await expect(demoLink).toHaveAttribute("target", "_blank");
    await expect(demoLink).toHaveAttribute("rel", "noopener noreferrer");
  },
};

export const PCDateOnly: Story = {
  name: "PC Date Only",
  args: {
    data: {
      ...mockData,
      submissionPattern: { kind: "dateOnly" },
      requestedSlots: [],
    },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("link", { name: "勤務時間の入力方法（別タブで開きます）" }),
    ).not.toBeInTheDocument();
  },
};

export const PCShiftType: Story = {
  name: "PC Shift Type",
  args: {
    data: {
      ...mockData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 0 }],
      },
      requestedSlots: [],
    },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("link", { name: "勤務時間の入力方法（別タブで開きます）" }),
    ).not.toBeInTheDocument();
  },
};

export const PCWithInitialWarnings: Story = {
  name: "PC With Initial Warnings",
  args: {
    data: mockDataWithInitialWarnings,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByLabelText("確認事項2件")).toBeInTheDocument();
    await expect((await canvas.findAllByLabelText("確認事項1件")).length).toBeGreaterThanOrEqual(2);
  },
};

export const ConfirmedWithInitialWarningsHidden: Story = {
  name: "Confirmed With Initial Warnings Hidden",
  args: {
    data: {
      ...mockDataWithInitialWarnings,
      recruitment: {
        ...mockDataWithInitialWarnings.recruitment,
        status: "confirmed",
        confirmedAt: new Date("2026-03-28T23:15:00").getTime(),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect((await canvas.findAllByText(/確定済み/)).length).toBeGreaterThan(0);
    await expect(canvas.queryByLabelText(/確認事項/)).not.toBeInTheDocument();
  },
};

export const SP: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

const APP_ORGANIZATION_ID = "organization-1";

const renderAppShiftBoard = (args: ComponentProps<typeof ShiftBoardPage>) => (
  <AuthenticatedAppShell activeKey="shifts" activeOrganizationId={APP_ORGANIZATION_ID}>
    <Flex direction="column" h={AUTHENTICATED_APP_CONTENT_HEIGHT} minH={0}>
      <FocusedFlowHeader title="シフトを調整" backLabel="シフト一覧へ戻る" backAriaLabel="シフト一覧へ戻る" compact />
      <Box flex={1} minH={0}>
        <ManagerShopScopeProvider shopId="shop-1" expectedOrganizationId={APP_ORGANIZATION_ID}>
          <ShiftBoardPage {...args} layout="app" />
        </ManagerShopScopeProvider>
      </Box>
    </Flex>
  </AuthenticatedAppShell>
);

export const AppOrganizationScoped: Story = {
  name: "App Organization Scoped",
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  parameters: { vrt: { releaseFixedHeader: true } },
  render: renderAppShiftBoard,
};

export const AppOrganizationScopedDesktop: Story = {
  name: "App Organization Scoped Desktop",
  parameters: { vrt: { releaseFixedHeader: true } },
  render: renderAppShiftBoard,
};

export const SPDialogInteraction: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.queryByRole("link", { name: "勤務時間の入力方法（別タブで開きます）" }),
    ).not.toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: /鈴木太郎/ }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(canvasElement.ownerDocument.body).not.toHaveStyle({ pointerEvents: "none" });

    const overviewTab = await canvas.findByRole("tab", { name: /一覧/ });
    await userEvent.click(overviewTab);
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  },
};

export const Confirmed: Story = {
  args: {
    data: {
      ...mockData,
      recruitment: {
        ...mockData.recruitment,
        status: "confirmed",
        confirmedAt: new Date("2026-03-28T23:15:00").getTime(),
      },
    },
  },
};

export const ReadOnly: Story = {
  args: {
    data: {
      ...mockData,
      canWriteBusinessData: false,
      businessWriteBlockReason: "restricted",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByLabelText("下書き保存")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /シフトを確定|もう一度通知/ })).not.toBeInTheDocument();
  },
};

const dynamicCapabilityData: ShiftBoardData = {
  ...mockData,
  recruitment: {
    ...mockData.recruitment,
    periodStart: "2099-01-20",
    periodEnd: "2099-01-26",
    deadline: "2099-01-17",
  },
  submissionPattern: { kind: "dateOnly" },
  staffs: mockData.staffs.slice(0, 2),
  requestedSlots: [],
  requestedDates: [],
  shiftAssignments: [],
};

export const AppConfirmDialogMobile: Story = {
  name: "App Confirm Dialog Mobile",
  args: {
    data: dynamicCapabilityData,
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: { vrt: { releaseFixedHeader: true } },
  render: renderAppShiftBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("button", { name: "確定" }));

    await expect(
      await screen.findByRole("dialog", { name: "このシフトをスタッフに通知しますか？" }),
    ).toBeInTheDocument();
  },
};

const DynamicCapabilityHarness = () => {
  const [data, setData] = useState(dynamicCapabilityData);

  return (
    <>
      <HStack position="fixed" top={2} right={2} zIndex="tooltip" gap={2}>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setData((current) => ({
              ...current,
              shiftAssignments: [
                {
                  staffId: "s2" as Id<"staffs">,
                  date: "2099-01-20",
                  startTime: "09:00",
                  endTime: "22:00",
                  positionId: "position-1" as Id<"positions">,
                },
              ],
            }))
          }
        >
          サーバーデータを更新
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setData((current) => ({
              ...current,
              canWriteBusinessData: false,
              businessWriteBlockReason: "restricted",
            }))
          }
        >
          閲覧のみに切り替える
        </Button>
      </HStack>
      <ShiftBoardPage data={data} recruitmentId={"recruitment-1" as Id<"recruitments">} />
    </>
  );
};

export const DynamicReadOnlyTransition: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <DynamicCapabilityHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    const userDraftCell = await canvas.findByRole("button", { name: /鈴木太郎 1\/20.*勤務なし/ });
    await userEvent.click(userDraftCell);
    await expect(await canvas.findByRole("button", { name: /鈴木太郎 1\/20.*勤務あり/ })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "サーバーデータを更新" }));
    await expect(canvas.getByRole("button", { name: /鈴木太郎 1\/20.*勤務あり/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /佐藤花子 1\/20.*勤務なし/ })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "シフトを確定して通知" }));
    await expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // modal表示中の外部状態更新を再現するため、DOM eventを直接発火する。
    canvas.getByRole("button", { name: "閲覧のみに切り替える", hidden: true }).click();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: /鈴木太郎 1\/20.*勤務なし/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(await canvas.findByRole("button", { name: /佐藤花子 1\/20.*勤務あり/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(canvas.queryByLabelText("下書き保存")).not.toBeInTheDocument();
  },
};

export const DynamicReadOnlyClearsNavigationBlocker: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <DynamicCapabilityHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("button", { name: /鈴木太郎 1\/20.*勤務なし/ }));
    await userEvent.click(canvas.getByRole("link", { name: "戻る" }));
    await expect(await screen.findByRole("alertdialog", { name: "保存していない変更があります" })).toBeInTheDocument();

    canvas.getByRole("button", { name: "閲覧のみに切り替える", hidden: true }).click();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: /鈴木太郎 1\/20.*勤務なし/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const PastDraftSaveBlocked: Story = {
  name: "Past Draft Save Blocked",
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    toaster.dismiss();
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByLabelText("下書き保存"));

    await expect(await within(document.body).findByText("過去のシフトは保存できません")).toBeInTheDocument();
    toaster.dismiss();
  },
};

export const PastResendBlocked: Story = {
  name: "Past Resend Blocked",
  args: {
    data: {
      ...mockData,
      recruitment: {
        ...mockData.recruitment,
        status: "confirmed",
        confirmedAt: new Date("2026-03-28T23:15:00").getTime(),
      },
    },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    toaster.dismiss();
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: "もう一度通知" }));

    await expect(await within(document.body).findByText("過去のシフトはスタッフに通知できません")).toBeInTheDocument();
    expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    toaster.dismiss();
  },
};
