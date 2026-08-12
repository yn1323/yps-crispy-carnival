import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, screen, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { createDeferred } from "@/src/devtools/createDeferred";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { ShopDetailSkeleton, ShopDetailView } from ".";
import { ShopStaffMembershipDialog, type ShopStaffMembershipDialogController } from "./ShopStaffMembershipDialog";
import type {
  ShopDetailData,
  ShopDetailPerson,
  ShopStaffMembershipChangeInput,
  ShopStaffMembershipData,
  ShopStaffMembershipRemovalPreview,
} from "./types";

const shop: ShopDetailData = {
  id: "shop-shibuya",
  name: "スーパー美味しいカフェ新宿店",
  regularClosedDays: ["sun"],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  canUpdateSettings: true,
  canDelete: true,
};

const staffs: ShopDetailPerson[] = [
  {
    id: "person-manager",
    name: "田中 太郎",
    managerRole: "active",
    isLineConnected: true,
    shopNames: ["スーパー美味しいカフェ新宿店", "めっちゃおいしいカフェ渋谷店"],
    shopIds: ["shop-shibuya", "shop-shinjuku"],
  },
  {
    id: "person-staff",
    name: "佐藤 花子",
    managerRole: "none",
    isLineConnected: false,
    shopNames: ["スーパー美味しいカフェ新宿店"],
    shopIds: ["shop-shibuya"],
  },
];

const managerPersonId = "person-manager" as Id<"organizationPeople">;
const staffPersonId = "person-staff" as Id<"organizationPeople">;
const candidatePersonId = "person-candidate" as Id<"organizationPeople">;
const managerStaffId = "staff-manager" as Id<"staffs">;
const staffStaffId = "staff-staff" as Id<"staffs">;
const preservedStaffId = "staff-preserved" as Id<"staffs">;

const membershipData: ShopStaffMembershipData = {
  membershipFingerprint: "a".repeat(64),
  canWrite: true,
  writeDisabledReason: null,
  people: [
    {
      personId: managerPersonId,
      name: "田中 太郎",
      email: "taro.tanaka@example.com",
      isManager: true,
      otherShopNames: ["めっちゃおいしいカフェ渋谷店"],
      isSelected: true,
      staffId: managerStaffId,
      canChange: true,
      changeDisabledReason: null,
    },
    {
      personId: staffPersonId,
      name: "佐藤 花子",
      email: "hanako.sato@example.com",
      isManager: false,
      otherShopNames: [],
      isSelected: true,
      staffId: staffStaffId,
      canChange: true,
      changeDisabledReason: null,
    },
    {
      personId: candidatePersonId,
      name: "鈴木 次郎",
      email: "jiro.suzuki@example.com",
      isManager: false,
      otherShopNames: ["池袋店"],
      isSelected: false,
      staffId: null,
      canChange: true,
      changeDisabledReason: null,
    },
  ],
  preservedStaffs: [],
};

const readyRemovalPreview: ShopStaffMembershipRemovalPreview = {
  kind: "ready",
  removals: [
    {
      personId: managerPersonId,
      staffId: managerStaffId,
      assignmentCount: 2,
      fingerprint: "b".repeat(64),
    },
  ],
  totalAssignmentCount: 2,
};

const closedSettingsDialog = {
  isOpen: false,
  onOpenChange: () => {},
  open: () => {},
  close: () => {},
  isUpdating: false,
};

const meta = {
  title: "Features/ShopDetail",
  component: ShopDetailView,
  decorators: [
    (Story) => (
      <Box maxW="1024px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  parameters: { layout: "padded" },
  args: {
    shop,
    staffs,
    settingsDialog: closedSettingsDialog,
    isDeleting: false,
    onBack: () => {},
    onOpenUser: () => {},
    onUpdateSettings: () => {},
    onDelete: async () => true,
  },
} satisfies Meta<typeof ShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: () => <ShopDetailSkeleton />,
};

export const LoadingMobile: Story = {
  render: () => <ShopDetailSkeleton />,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const NoStaffs: Story = {
  args: { staffs: [] },
};

export const ReadOnly: Story = {
  args: {
    shop: {
      ...shop,
      canUpdateSettings: false,
      settingsDisabledReason: "現在の契約状態では、店舗情報を変更できません。",
      canDelete: false,
      deleteDisabledReason: "現在の契約状態では、この店舗を削除できません。",
    },
  },
};

export const LongText: Story = {
  args: {
    shop: {
      ...shop,
      name: "駅前商業施設フードコート内スーパー美味しいカフェ新宿中央東口店",
    },
    staffs: [
      {
        ...staffs[0],
        name: "とても長い氏名を持つ管理者ユーザー田中太郎",
      },
    ],
  },
};

export const DeletionUnavailable: Story = {
  args: {
    shop: {
      ...shop,
      canDelete: false,
      deleteDisabledReason: "最後の店舗は削除できません。",
    },
  },
};

export const SettingsDialog: Story = {
  args: {
    settingsDialog: { ...closedSettingsDialog, isOpen: true },
  },
};

export const SettingsDialogMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    settingsDialog: { ...closedSettingsDialog, isOpen: true },
  },
};

export const StaffAccordionOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: shop.name })).toBeInTheDocument();
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
  },
};

export const EmptyStaffAccordionOpen: Story = {
  args: { staffs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const emptyMessage = await canvas.findByText("この店舗に所属するスタッフはいません。");
    await waitFor(() => expect(emptyMessage).toBeVisible());
  },
};

export const SettingsDialogBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "店舗設定" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "店舗設定" })).not.toBeInTheDocument());
  },
};

export const SettingsBatchUpdateBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "店舗設定" });
    const form = within(dialog);

    const shopName = form.getByRole("textbox", { name: "お店の名前" });
    await userEvent.clear(shopName);
    await userEvent.type(shopName, "更新後の新宿店");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("希望シフトの集め方");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("シフト開始時間");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("現在の設定: 毎週 日");
    await userEvent.click(form.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => expect(canvas.getByLabelText("操作結果")).toHaveTextContent("update:更新後の新宿店|time|sun"));
  },
};

export const SettingsSubmitLockBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <SettingsSubmitLockHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "編集する" }));
    const dialogElement = await body.findByRole("dialog", { name: "店舗設定" });
    const dialog = within(dialogElement);

    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await dialog.findByText("希望シフトの集め方");
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await dialog.findByText("シフト開始時間");
    await userEvent.click(dialog.getByRole("button", { name: "次へ" }));
    await dialog.findByText("現在の設定: 毎週 日");

    const submit = dialog.getByRole("button", { name: "変更を保存" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await canvas.findByTestId("settings-submit-count")).toHaveTextContent("1");
    await expect(dialogElement).toHaveAttribute("aria-busy", "true");
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "戻る" })).toBeDisabled();
    await expect(dialog.queryByLabelText("閉じる")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    fireEvent.pointerDown(canvasElement.ownerDocument.body);
    fireEvent.click(canvasElement.ownerDocument.body);
    await expect(dialogElement).toBeVisible();

    fireEvent.click(canvas.getByTestId("release-settings-submission"));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "店舗設定" })).not.toBeInTheDocument());
  },
};

export const StaffNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
    await userEvent.click(staffButton);
    await expect(await canvas.findByLabelText("操作結果")).toHaveTextContent("open:person-staff");
  },
};

export const StaffMembershipDialog: Story = {
  render: () => <MembershipDialogHarness />,
};

export const StaffMembershipDialogMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <MembershipDialogHarness />,
};

export const StaffMembershipDialogReadOnly: Story = {
  render: () => (
    <MembershipDialogHarness
      data={{
        ...membershipData,
        canWrite: false,
        writeDisabledReason: "契約状態を確認できるまで、スタッフの所属を変更できません。",
      }}
    />
  ),
};

export const StaffMembershipTriggerBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "所属スタッフを変更する" })).toBeEnabled();
  },
};

export const StaffMembershipReadOnlyTriggerBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    shop: {
      ...shop,
      canUpdateSettings: false,
      settingsDisabledReason: "現在の契約状態では、店舗情報を変更できません。",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "所属スタッフを変更する" })).toBeDisabled();
  },
};

export const StaffMembershipTriggerReturnBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "所属スタッフを変更する" });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const StaffMembershipAdditionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipDialogHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    const candidate = content.getByRole("checkbox", {
      name: "鈴木 次郎を所属スタッフにする",
    });

    await expect(candidate).toHaveAccessibleDescription(/スタッフ。所属：池袋店。/);
    await expect(content.queryByText("jiro.suzuki@example.com")).not.toBeInTheDocument();
    await userEvent.click(candidate);
    await expect(content.getByText(/案内を予約します/)).toBeInTheDocument();
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await waitFor(() => {
      const inputs = JSON.parse(
        canvas.getByTestId("staff-membership-change-inputs").textContent ?? "[]",
      ) as Array<ShopStaffMembershipChangeInput>;
      expect(inputs).toHaveLength(1);
      expect(inputs[0]?.desiredActivePersonIds).toEqual([managerPersonId, staffPersonId, candidatePersonId]);
      expect(inputs[0]?.removalPreviews).toEqual([]);
    });
  },
};

export const StaffMembershipRemovalBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipDialogHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);

    await userEvent.click(
      content.getByRole("checkbox", {
        name: "田中 太郎を所属スタッフにする",
      }),
    );
    await expect(content.getByText("スタッフを外すと起きること")).toBeInTheDocument();
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await waitFor(() => {
      expect(canvas.getByTestId("staff-membership-preview-request-count")).toHaveTextContent("1");
      const inputs = JSON.parse(
        canvas.getByTestId("staff-membership-change-inputs").textContent ?? "[]",
      ) as Array<ShopStaffMembershipChangeInput>;
      expect(inputs).toHaveLength(1);
      expect(inputs[0]?.removalPreviews).toEqual(readyRemovalPreview.removals);
    });
    await expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
  },
};

export const StaffMembershipRemoveAllWarningBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => (
    <MembershipDialogHarness
      data={{
        ...membershipData,
        people: membershipData.people.filter((person) => person.personId === managerPersonId),
      }}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    await userEvent.click(
      content.getByRole("checkbox", {
        name: "田中 太郎を所属スタッフにする",
      }),
    );
    await expect(content.getByText("変更後、この店舗のスタッフは0名になります")).toBeInTheDocument();
  },
};

export const StaffMembershipPreservedStaffBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => (
    <MembershipDialogHarness
      data={{
        ...membershipData,
        people: membershipData.people.filter((person) => person.personId === managerPersonId),
        preservedStaffs: [
          {
            staffId: preservedStaffId,
            name: "移行中スタッフ",
            email: "legacy.staff@example.com",
            changeDisabledReason: "移行中のスタッフは、この画面では所属を変更できません。",
          },
        ],
      }}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    const preserved = content.getByRole("checkbox", {
      name: "移行中スタッフは所属スタッフです",
    });

    await expect(preserved).toBeChecked();
    await expect(preserved).toBeDisabled();
    await expect(preserved).toHaveAccessibleDescription("移行中のスタッフは、この画面では所属を変更できません。");
    await userEvent.click(
      content.getByRole("checkbox", {
        name: "田中 太郎を所属スタッフにする",
      }),
    );
    await expect(content.queryByText("変更後、この店舗のスタッフは0名になります")).not.toBeInTheDocument();
  },
};

export const StaffMembershipTooManyAssignmentsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipDialogHarness preview={{ kind: "tooMany", assignmentCountAtLeast: 501, limit: 500 }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    await userEvent.click(
      content.getByRole("checkbox", {
        name: "田中 太郎を所属スタッフにする",
      }),
    );
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await expect(content.getByText(/この画面では変更できません/)).toBeInTheDocument();
    await expect(content.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(canvas.getByTestId("staff-membership-change-inputs")).toHaveTextContent("[]");
  },
};

export const StaffMembershipInitialFocusBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipDialogHarness />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const firstEditableCheckbox = within(dialog).getByRole("checkbox", {
      name: "田中 太郎を所属スタッフにする",
    });
    await waitFor(() => expect(firstEditableCheckbox).toHaveFocus());
  },
};

export const StaffMembershipUnknownResultRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipUnknownResultHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    await userEvent.click(
      content.getByRole("checkbox", {
        name: "鈴木 次郎を所属スタッフにする",
      }),
    );
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await expect(await content.findByText(/前回の結果が不明な場合は、同じ内容で再試行できます/)).toBeInTheDocument();
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await waitFor(() => {
      const inputs = JSON.parse(
        canvas.getByTestId("staff-membership-retry-inputs").textContent ?? "[]",
      ) as Array<ShopStaffMembershipChangeInput>;
      expect(inputs).toHaveLength(2);
      expect(inputs[1]).toEqual(inputs[0]);
    });
  },
};

export const StaffMembershipRejectedResultBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipRejectedResultHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    const candidate = content.getByRole("checkbox", {
      name: "鈴木 次郎を所属スタッフにする",
    });

    await userEvent.click(candidate);
    await userEvent.click(content.getByRole("button", { name: "変更する" }));
    await expect(content.getByText("サーバーが変更を拒否しました。")).toBeInTheDocument();
    await expect(candidate).toBeEnabled();
    await userEvent.click(candidate);
    await expect(candidate).not.toBeChecked();
    await expect(canvas.getByTestId("staff-membership-rejected-inputs")).toHaveTextContent("requestId");
  },
};

export const StaffMembershipRemovalRejectedResultBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipRemovalRejectedResultHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole("dialog", { name: "所属スタッフを変更" });
    const content = within(dialog);
    await userEvent.click(
      content.getByRole("checkbox", {
        name: "田中 太郎を所属スタッフにする",
      }),
    );
    await userEvent.click(content.getByRole("button", { name: "変更する" }));

    await expect(content.getByText(/シフトの割り当てが変更されました/)).toBeInTheDocument();
    await expect(canvas.getByTestId("staff-membership-removal-rejected-inputs")).toHaveTextContent("requestId");

    await userEvent.click(content.getByRole("button", { name: "変更する" }));
    const inputs = JSON.parse(
      canvas.getByTestId("staff-membership-removal-rejected-inputs").textContent ?? "[]",
    ) as ShopStaffMembershipChangeInput[];
    await expect(inputs).toHaveLength(2);
  },
};

function InteractionHarness() {
  const [result, setResult] = useState("");
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  return (
    <>
      <output aria-label="操作結果">{result}</output>
      <ShopDetailView
        shop={shop}
        staffs={staffs}
        settingsDialog={{
          isOpen: isSettingsDialogOpen,
          onOpenChange: ({ open }) => setIsSettingsDialogOpen(open),
          open: () => setIsSettingsDialogOpen(true),
          close: () => setIsSettingsDialogOpen(false),
          isUpdating: false,
        }}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={(personId) => setResult(`open:${personId}`)}
        onUpdateSettings={(data) =>
          setResult(`update:${data.shopName}|${data.submissionPattern.kind}|${data.regularClosedDays.join(",")}`)
        }
        onDelete={async () => false}
      />
    </>
  );
}

function SettingsSubmitLockHarness() {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run: updateSettings, isRunning: isUpdating } = useSingleFlight(async () => {
    setSubmitCount((count) => count + 1);
    const submission = createDeferred();
    pendingSubmission.current = submission;
    await submission.promise;
    if (pendingSubmission.current === submission) pendingSubmission.current = null;
    setIsSettingsDialogOpen(false);
  });

  return (
    <>
      <output hidden data-testid="settings-submit-count">
        {submitCount}
      </output>
      <button
        type="button"
        hidden
        data-testid="release-settings-submission"
        onClick={() => pendingSubmission.current?.resolve()}
      >
        店舗設定の更新を完了する
      </button>
      <ShopDetailView
        shop={shop}
        staffs={staffs}
        settingsDialog={{
          isOpen: isSettingsDialogOpen,
          onOpenChange: ({ open }) => setIsSettingsDialogOpen(open),
          open: () => setIsSettingsDialogOpen(true),
          close: () => setIsSettingsDialogOpen(false),
          isUpdating,
        }}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={() => {}}
        onUpdateSettings={updateSettings}
        onDelete={async () => false}
      />
    </>
  );
}

function MembershipDialogHarness({
  data = membershipData,
  preview = readyRemovalPreview,
}: {
  data?: ShopStaffMembershipData | null;
  preview?: ShopStaffMembershipRemovalPreview | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewRequestCount, setPreviewRequestCount] = useState(0);
  const [inputs, setInputs] = useState<ShopStaffMembershipChangeInput[]>([]);
  const controller: ShopStaffMembershipDialogController = {
    data,
    removalPreview: previewRequested ? preview : undefined,
    isPreviewLoading: false,
    isChanging: false,
    requestRemovalPreview: () => {
      setPreviewRequested(true);
      setPreviewRequestCount((count) => count + 1);
      return true;
    },
    clearPreview: () => setPreviewRequested(false),
    clearError: () => {},
    submitChange: async (input) => {
      setInputs((current) => [...current, input]);
      setIsOpen(false);
      return "succeeded";
    },
  };

  return (
    <>
      <output hidden data-testid="staff-membership-change-inputs">
        {JSON.stringify(inputs)}
      </output>
      <output hidden data-testid="staff-membership-preview-request-count">
        {previewRequestCount}
      </output>
      {isOpen && (
        <ShopStaffMembershipDialog
          shopId={shop.id}
          shopName={shop.name}
          isOpen
          onOpenChange={({ open }) => setIsOpen(open)}
          onClose={() => setIsOpen(false)}
          controller={controller}
        />
      )}
    </>
  );
}

function MembershipUnknownResultHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const [data, setData] = useState(membershipData);
  const [inputs, setInputs] = useState<ShopStaffMembershipChangeInput[]>([]);
  const controller: ShopStaffMembershipDialogController = {
    data,
    removalPreview: undefined,
    isPreviewLoading: false,
    isChanging: false,
    requestRemovalPreview: () => false,
    clearPreview: () => {},
    clearError: () => {},
    submitChange: async (input) => {
      setInputs((current) => [...current, input]);
      setData((current) =>
        current.membershipFingerprint === "c".repeat(64)
          ? current
          : {
              ...current,
              membershipFingerprint: "c".repeat(64),
              people: current.people.map((person) =>
                person.personId === candidatePersonId ? { ...person, isSelected: true } : person,
              ),
            },
      );
      return "unknown";
    },
  };

  return (
    <>
      <output hidden data-testid="staff-membership-retry-inputs">
        {JSON.stringify(inputs)}
      </output>
      {isOpen && (
        <ShopStaffMembershipDialog
          shopId={shop.id}
          shopName={shop.name}
          isOpen
          onOpenChange={({ open }) => setIsOpen(open)}
          onClose={() => setIsOpen(false)}
          controller={controller}
        />
      )}
    </>
  );
}

function MembershipRejectedResultHarness() {
  const [inputs, setInputs] = useState<ShopStaffMembershipChangeInput[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const controller: ShopStaffMembershipDialogController = {
    data: membershipData,
    removalPreview: undefined,
    isPreviewLoading: false,
    isChanging: false,
    errorMessage,
    requestRemovalPreview: () => false,
    clearPreview: () => {},
    clearError: () => setErrorMessage(undefined),
    submitChange: async (input) => {
      setInputs((current) => [...current, input]);
      setErrorMessage("サーバーが変更を拒否しました。");
      return "rejected";
    },
  };

  return (
    <>
      <output hidden data-testid="staff-membership-rejected-inputs">
        {JSON.stringify(inputs)}
      </output>
      <ShopStaffMembershipDialog
        shopId={shop.id}
        shopName={shop.name}
        isOpen
        onOpenChange={() => {}}
        onClose={() => {}}
        controller={controller}
      />
    </>
  );
}

function MembershipRemovalRejectedResultHarness() {
  const [previewRequested, setPreviewRequested] = useState(false);
  const [inputs, setInputs] = useState<ShopStaffMembershipChangeInput[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const controller: ShopStaffMembershipDialogController = {
    data: membershipData,
    removalPreview: previewRequested ? readyRemovalPreview : undefined,
    isPreviewLoading: false,
    isChanging: false,
    errorMessage,
    requestRemovalPreview: () => {
      setPreviewRequested(true);
      setErrorMessage(undefined);
      return true;
    },
    clearPreview: () => setPreviewRequested(false),
    clearError: () => setErrorMessage(undefined),
    submitChange: async (input) => {
      setInputs((current) => [...current, input]);
      setErrorMessage("今日以降のシフトの割り当てが変更されました。");
      return "rejected";
    },
  };

  return (
    <>
      <output hidden data-testid="staff-membership-removal-rejected-inputs">
        {JSON.stringify(inputs)}
      </output>
      <ShopStaffMembershipDialog
        shopId={shop.id}
        shopName={shop.name}
        isOpen
        onOpenChange={() => {}}
        onClose={() => {}}
        controller={controller}
      />
    </>
  );
}

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileStaffAccordionOpen: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
  },
};

export const MobileShiftType: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    shop: {
      ...shop,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
        ],
      },
    },
  },
};
