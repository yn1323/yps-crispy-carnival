import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { HandsOnDemo } from ".";

const meta = {
  title: "Features/Demo/HandsOnDemo",
  component: HandsOnDemo,
  args: {
    variant: "simple",
    // 撮るたびに日付が変わらないよう、募集の初日を固定する。
    periodStart: "2026-12-01",
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HandsOnDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 始まりの画面。まっさらな画面の中央に、募集を開始するボタンだけを置く。 */
export const Start: Story = {};

export const StartMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

/** 募集を開始すると、提出依頼を送る場面に進み、上の段の手順は1のままにする。 */
export const StartsRecruitment: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "12/1〜12/14の募集を開始" }));

    await expect(await canvas.findByRole("status")).toHaveTextContent("提出依頼を自動で送ります");
    await expect(canvas.getByRole("button", { current: "step" })).toHaveAccessibleName("希望シフトを集める");
  },
};

/**
 * 上の段の手順を押すと、その手順の始めへ移る。
 * シフト表から「確定シフトを送る」へ移ると、「確定」を押したときと同じく、その時の下書きを送る。
 */
export const JumpsBetweenChapters: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "シフトを作る" }));

    await expect(await screen.findByRole("region", { name: "やること" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { current: "step" })).toHaveAccessibleName("シフトを作る");
    // 届いた希望を並べ終えて操作できるようになると、知らせを出す。
    await waitFor(
      () => expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain("ここから操作できます"),
      { timeout: 5000 },
    );

    await userEvent.click(canvas.getByRole("button", { name: "確定シフトを送る" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("確定したシフトを自動で送ります");
    await expect(canvas.getByRole("button", { current: "step" })).toHaveAccessibleName("確定シフトを送る");

    // 送る場面は決まった時間で、届いたお知らせへ進む。
    const caption = await canvas.findByText("スタッフに届いたお知らせ", undefined, { timeout: 6000 });
    // シフト表で何もしていないため、佐藤さんの勤務は、始まりの下書きにある3日目と5日目だけが届く。
    await expect(within(caption.parentElement as HTMLElement).getAllByText("17:00-22:00")).toHaveLength(2);
  },
};

/**
 * 確定したあとの場面からシフト表へ戻ると、案内を終えたものとして、吹き出しと暗くした面を出さない。
 * 「まだシフトを操作してみる」と同じく、どこでも自由に操作できるようにするため。
 */
export const ReturnsToBoardWithoutGuide: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "シフトを作る" }));
    // 初めて開いたシフト表では、吹き出しで案内する。
    await expect(await screen.findByText("点線が希望シフトです", undefined, { timeout: 5000 })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "確定シフトを送る" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("確定したシフトを自動で送ります");
    await userEvent.click(canvas.getByRole("button", { name: "シフトを作る" }));

    await waitFor(() =>
      expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain("ここから操作できます"),
    );
    // 吹き出し（react-joyrideのalertdialog）を出さない。
    await expect(screen.findByRole("alertdialog", undefined, { timeout: 1500 })).rejects.toThrow();
  },
};
