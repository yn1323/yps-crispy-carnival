import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { StaffOrderEditorView, type StaffOrderPerson } from ".";

const people = [
  {
    personId: "person-manager",
    name: "山田 花子",
    email: "hanako.yamada@example.com",
    shopNames: ["本店", "駅前店"],
  },
  {
    personId: "person-staff-a",
    name: "佐藤 太郎",
    email: "taro.sato@example.com",
    shopNames: ["本店"],
  },
  {
    personId: "person-staff-b",
    name: "鈴木 美咲",
    email: null,
    shopNames: [],
  },
] as unknown as StaffOrderPerson[];
const noop = () => {};

const meta = {
  title: "Features/StaffOrderEditor",
  component: StaffOrderEditorView,
  parameters: { layout: "padded" },
  args: {
    people,
    canWrite: true,
    isDirty: false,
    isSaving: false,
    hasServerConflict: false,
    onOrderChange: noop,
    onReloadLatest: noop,
    onSave: noop,
  },
  decorators: [
    (Story) => (
      <Stack maxW="760px" mx="auto">
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof StaffOrderEditorView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile320: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    people: [
      {
        ...people[0],
        name: "東日本エリア統括マネージャー 山田花子",
        email: "very-long-email-address-for-mobile@example.com",
      },
      ...people.slice(1),
    ],
    filteredShopName: "本店",
  },
};

export const ReadOnly: Story = {
  args: {
    canWrite: false,
    writeDisabledReason: "閲覧のみの管理者は、スタッフの並び順を変更できません。",
  },
};

export const SinglePersonUnavailable: Story = {
  args: {
    people: people.slice(0, 1),
    canWrite: false,
    writeDisabledReason: "2名以上のスタッフがいると並び替えできます。",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2名以上のスタッフがいると並び替えできます。")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /山田 花子をドラッグして並べ替え/ })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "山田 花子の並び替えメニュー" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "並び順を保存" })).toBeDisabled();
  },
};

export const ServerConflict: Story = {
  args: {
    isDirty: true,
    hasServerConflict: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("編集中の並び順は保持しています。最新の内容を読み込むと、編集中の並び順は破棄されます。"),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "並び順を保存" })).toBeDisabled();
  },
};

function BehaviorPreview() {
  const [draft, setDraft] = useState(people);
  const [savedOrder, setSavedOrder] = useState<string | null>(null);

  return (
    <>
      {savedOrder && <output>保存結果: {savedOrder}</output>}
      <StaffOrderEditorView
        people={draft}
        canWrite
        isDirty
        isSaving={false}
        hasServerConflict={false}
        onOrderChange={setDraft}
        onReloadLatest={noop}
        onSave={() => setSavedOrder(draft.map((person) => person.name).join("、"))}
      />
    </>
  );
}

export const AlternativeMoveAndSaveBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <BehaviorPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "佐藤 太郎の並び替えメニュー" }));
    const menuTrigger = canvas.getByRole("button", { name: "佐藤 太郎の並び替えメニュー" });
    await userEvent.click(await page.findByRole("menuitem", { name: "先頭へ" }));

    const rows = canvas.getAllByRole("listitem");
    await expect(rows[0]).toHaveTextContent("佐藤 太郎");
    await expect(rows[1]).toHaveTextContent("山田 花子");
    await expect(canvas.getByText("佐藤 太郎を1番目へ移動しました。")).toBeInTheDocument();
    await waitFor(() => expect(menuTrigger).toHaveFocus());

    await userEvent.click(canvas.getByRole("button", { name: "並び順を保存" }));
    await expect(await canvas.findByText(/保存結果: 佐藤 太郎、山田 花子、鈴木 美咲/)).toBeInTheDocument();
  },
};

function KeyboardDragPreview() {
  const [draft, setDraft] = useState(people);
  return (
    <StaffOrderEditorView
      people={draft}
      canWrite
      isDirty
      isSaving={false}
      hasServerConflict={false}
      onOrderChange={setDraft}
      onReloadLatest={noop}
      onSave={noop}
    />
  );
}

export const KeyboardDragBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <KeyboardDragPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dragHandle = canvas.getByRole("button", { name: /鈴木 美咲をドラッグして並べ替え/ });
    dragHandle.focus();
    await userEvent.keyboard("[Space][ArrowUp][Space]");

    const rows = canvas.getAllByRole("listitem");
    await expect(rows[1]).toHaveTextContent("鈴木 美咲");
    await expect(rows[2]).toHaveTextContent("佐藤 太郎");
  },
};
