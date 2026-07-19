import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShopDetailSkeleton, ShopDetailView } from ".";
import type { ShopDetailData, ShopDetailPerson } from "./types";

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
    updatingSetting: null,
    isDeleting: false,
    onBack: () => {},
    onOpenUser: () => {},
    onUpdateSetting: () => {},
    onDelete: async () => true,
  },
} satisfies Meta<typeof ShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: () => <ShopDetailSkeleton />,
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

export const SubmissionPatternUpdateBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^日ごと 日ごと/ }));
    await userEvent.click(canvas.getByRole("button", { name: "希望シフトの集め方を更新" }));
    await expect(await canvas.findByLabelText("操作結果")).toHaveTextContent("submissionPattern:dateOnly");
  },
};

export const StaffNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "佐藤 花子のユーザー詳細を開く" }));
    await expect(await canvas.findByLabelText("操作結果")).toHaveTextContent("open:person-staff");
  },
};

export const InvalidShiftTypeBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^勤務区分 勤務区分/ }));
    await userEvent.click(canvas.getByRole("button", { name: "早番を削除" }));
    await userEvent.click(canvas.getByRole("button", { name: "遅番を削除" }));
    await expect(canvas.queryByText("勤務区分を1つ以上追加してください")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "希望シフトの集め方を更新" }));

    await expect(await canvas.findByText("勤務区分を1つ以上追加してください")).toBeVisible();
    await expect(canvas.getByLabelText("操作結果")).toBeEmptyDOMElement();
    await waitFor(() => expect(canvas.getByRole("button", { name: "勤務区分を追加" })).toHaveFocus());
  },
};

export const RegularClosedDaysUpdateBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "金曜日を定休日にする" }));
    await userEvent.click(canvas.getByRole("button", { name: "月曜日を定休日にする" }));
    await userEvent.click(canvas.getByRole("button", { name: "定休日を更新" }));

    await expect(await canvas.findByLabelText("操作結果")).toHaveTextContent("regularClosedDays:sun,mon,fri");
  },
};

export const DeleteConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", { name: "店舗を削除" });
    await waitFor(() =>
      expect(within(dialog).getByText("「スーパー美味しいカフェ新宿店」を削除しますか？")).toBeVisible(),
    );
    await expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "店舗を削除" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("alertdialog", { name: "店舗を削除" }),
      ).not.toBeInTheDocument(),
    );
  },
};

const permissionLossReason = "最新の権限では、この店舗を削除できません。";

function InteractionHarness() {
  const [result, setResult] = useState("");

  return (
    <>
      <output aria-label="操作結果">{result}</output>
      <ShopDetailView
        shop={shop}
        staffs={staffs}
        updatingSetting={null}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={(personId) => setResult(`open:${personId}`)}
        onUpdateSetting={(change) => {
          if (change.kind === "submissionPattern") {
            setResult(`submissionPattern:${change.submissionPattern.kind}`);
          }
          if (change.kind === "regularClosedDays") {
            setResult(`regularClosedDays:${change.regularClosedDays.join(",")}`);
          }
        }}
        onDelete={async () => false}
      />
    </>
  );
}

function PermissionLossHarness() {
  const [canDelete, setCanDelete] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setCanDelete(false)}>
        削除権限を失う
      </button>
      <ShopDetailView
        shop={{ ...shop, canDelete, deleteDisabledReason: canDelete ? undefined : permissionLossReason }}
        staffs={staffs}
        updatingSetting={null}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={() => {}}
        onUpdateSetting={() => {}}
        onDelete={async () => false}
      />
    </>
  );
}

export const DeletionPermissionLossBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PermissionLossHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const losePermissionButton = canvas.getByRole("button", { name: "削除権限を失う" });
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    await body.findByRole("alertdialog", { name: "店舗を削除" });

    losePermissionButton.click();

    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "店舗を削除" })).not.toBeInTheDocument());
    await expect(await canvas.findByText(permissionLossReason)).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
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
