import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { SendModal } from "./SendModal";

const meta = {
  title: "Features/Demo/HandsOnDemo/SendModal",
  component: SendModal,
  args: {
    scene: "sent",
    shopName: "居酒屋シフトリ",
    staffName: "佐藤 大輔",
    periodLabel: "11/30(月)〜12/13(日)",
    deadlineLabel: "11/29(日) 23:59",
    periodStart: "2026-11-30",
    confirmRows: [],
    onStaffSubmitted: () => {},
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "100dvh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SendModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 募集を開始したとき。シフトリからスタッフへ、メールのアイコンが飛ぶ。上に「自動で再生中」を出す。 */
export const Sent: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("自動で再生中")).toBeVisible();
  },
};

/** スタッフに届いたお知らせ。押す場所を、カーソルの動きで示す。スマートフォンの枠の上にも「自動で再生中」を出す。 */
export const StaffMessage: Story = {
  args: { scene: "staffMessage" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("自動で再生中")).toBeVisible();
  },
};

/** 希望が届いたとき。スタッフからシフトリへ、カレンダーのアイコンが飛ぶ。 */
export const Collected: Story = {
  args: { scene: "collected" },
};

/** 確定したとき。シフトリからスタッフへ、メールのアイコンが飛ぶ。 */
export const ConfirmSent: Story = {
  args: { scene: "confirmSent" },
};

/** 確定のお知らせ。シフト表で入れた勤務を日ごとに並べ、勤務がない日は休みにする。 */
export const ConfirmMessage: Story = {
  args: {
    scene: "confirmMessage",
    confirmRows: [
      { dateLabel: "11/30(月)", timeLabel: "17:00-22:00" },
      { dateLabel: "12/1(火)", timeLabel: null },
      { dateLabel: "12/2(水)", timeLabel: "17:00-22:00" },
      { dateLabel: "12/3(木)", timeLabel: null },
      { dateLabel: "12/4(金)", timeLabel: "17:00-22:00" },
      { dateLabel: "12/5(土)", timeLabel: null },
      { dateLabel: "12/6(日)", timeLabel: null },
    ],
  },
};

export const ConfirmMessageMobile: Story = {
  args: ConfirmMessage.args,
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
