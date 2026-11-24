import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AUTO_CREATE_AI_OPTION_STORAGE_KEY, AUTO_CREATE_BREAK_OPTION_STORAGE_KEY } from "../autoCreateOptionStorage";
import { AutoCreateDialog } from "./index";

const meta = {
  title: "Features/Shift/ShiftForm/AutoCreateDialog",
  component: AutoCreateDialog,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    onClose: fn(),
    onCreate: fn(),
    // AIの手直しを使えるのは時間指定の募集で、時間指定の募集では休憩の選択も出る。
    showsBreakOption: true,
  },
  // 選んだオプションは端末に覚えるため、Storyの間で持ち越さないよう、毎回消す。
  beforeEach: () => {
    window.localStorage.removeItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY);
    window.localStorage.removeItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY);
  },
} satisfies Meta<typeof AutoCreateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const AI_OPTION = "メモの内容に合わせてAIで手直しする";

/** 開いた状態。AIの手直しは外した状態から始まる。AIの残りの回数が分からない間は、回数に制限があることだけを伝える。 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("checkbox", { name: AI_OPTION })).not.toBeChecked();
    await expect(body.getByText("回数制限あり")).toBeInTheDocument();
  },
};

/** AIの残りの回数が3回より多い間は、回数に制限があることだけを伝える。 */
export const WithManyAiRemaining: Story = {
  args: { aiRemainingCount: 4 },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("回数制限あり")).toBeInTheDocument();
    await expect(body.queryByText(/あと\d+回/)).not.toBeInTheDocument();
  },
};

/** AIの残りの回数が3回以下になったら、回数を出す。 */
export const WithAiRemaining: Story = {
  args: { aiRemainingCount: 3 },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("回数制限あり：あと3回")).toBeInTheDocument();
  },
};

/** AIの回数を使い切った募集では、AIの手直しを選べず、希望シフトからの作成だけができる。 */
export const AiExhausted: Story = {
  args: { aiRemainingCount: 0 },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("回数制限あり：あと0回")).toBeInTheDocument();
    await expect(body.getByRole("checkbox", { name: AI_OPTION })).toBeDisabled();
    await expect(body.getByRole("checkbox", { name: AI_OPTION })).not.toBeChecked();
  },
};

/** AIの手直しを入れて「作成する」を押すと、AIを使う作り方を渡して閉じる。入れたことは端末に覚える。 */
export const ChooseAiInteractive: Story = {
  args: { aiRemainingCount: 3 },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const checkbox = await body.findByRole("checkbox", { name: AI_OPTION });
    await expect(checkbox).not.toBeChecked();

    await userEvent.click(body.getByText(AI_OPTION));
    await expect(checkbox).toBeChecked();
    await userEvent.click(body.getByRole("button", { name: "作成する" }));

    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).toHaveBeenCalledWith("ai", { includesBreaks: true });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(window.localStorage.getItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY)).toBe("true");
  },
};

/** AIの手直しを入れたことを覚えている端末では、入れた状態から始める。 */
export const RemembersAiOption: Story = {
  args: { aiRemainingCount: 3 },
  beforeEach: () => {
    window.localStorage.setItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY, "true");
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("checkbox", { name: AI_OPTION })).toBeChecked();

    await userEvent.click(body.getByRole("button", { name: "作成する" }));
    await expect(args.onCreate).toHaveBeenCalledWith("ai", { includesBreaks: true });
  },
};

/** 入れたことを覚えていても、回数を使い切った募集では外した状態で見せ、AIを使わずに作る。覚えた選択は変えない。 */
export const RememberedAiWhenExhaustedInteractive: Story = {
  args: { aiRemainingCount: 0 },
  parameters: { screenshot: { skip: true } },
  beforeEach: () => {
    window.localStorage.setItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY, "true");
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("checkbox", { name: AI_OPTION })).not.toBeChecked();

    await userEvent.click(body.getByRole("button", { name: "作成する" }));
    await expect(args.onCreate).toHaveBeenCalledWith("rule", { includesBreaks: true });
    await expect(window.localStorage.getItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY)).toBe("true");
  },
};

/** キャンセルでは作らずに閉じる。 */
export const CancelInteractive: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: "キャンセル" }));
    await expect(args.onCreate).not.toHaveBeenCalled();
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/** AIの手直しを入れずに「作成する」を押すと、希望シフトから作る作り方を渡し、作り終えるのを待ってから閉じる。 */
export const CreateWithRuleInteractive: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: "作成する" }));

    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).toHaveBeenCalledWith("rule", { includesBreaks: true });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/** 作成中は「作成する」に進行を出し、オプションの選択とキャンセルを止める。 */
export const Creating: Story = {
  args: { isCreating: true },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "キャンセル" })).toBeDisabled();
    await expect(body.getByRole("checkbox", { name: AI_OPTION })).toBeDisabled();
    await expect(args.onCreate).not.toHaveBeenCalled();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

/** 募集期間に必要人数のある日が1日もない場合は、作れる勤務がないため「作成する」を押せず、設定へ案内する。 */
export const RequirementMissing: Story = {
  args: { isRequirementMissing: true, onOpenSetup: fn() },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "作成する" })).toBeDisabled();

    await userEvent.click(body.getByRole("button", { name: "必要人数設定を開く" }));
    await expect(args.onOpenSetup).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).not.toHaveBeenCalled();
  },
};

/** 時間指定の募集では、休憩時間も作るかを選べる。初めは作る状態である。 */
export const WithBreakOption: Story = {
  args: { showsBreakOption: true },
};

/** 「休憩時間も自動作成する」を外して作ると、休憩を作らない指定を渡す。外したことは端末に覚え、閉じたあとも戻さない。 */
export const CreateWithoutBreaksInteractive: Story = {
  args: { showsBreakOption: true },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const checkbox = await body.findByRole("checkbox", { name: "休憩時間も自動作成する" });
    await expect(checkbox).toBeChecked();

    await userEvent.click(body.getByText("休憩時間も自動作成する"));
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(body.getByRole("button", { name: "作成する" }));

    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).toHaveBeenCalledWith("rule", { includesBreaks: false });
    // このStoryは開いたままなので、閉じる操作のあとの状態を見られる。
    await expect(body.getByRole("checkbox", { name: "休憩時間も自動作成する" })).not.toBeChecked();
    await expect(window.localStorage.getItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY)).toBe("false");
  },
};

/** 外したことを覚えている端末では、外した状態から始める。 */
export const RemembersBreakOption: Story = {
  args: { showsBreakOption: true },
  parameters: { screenshot: { skip: true } },
  beforeEach: () => {
    window.localStorage.setItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY, "false");
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("checkbox", { name: "休憩時間も自動作成する" })).not.toBeChecked();
  },
};

/** AIを使えない環境では、AIの手直しを選べなくし、準備中であることを伝える。 */
export const AiNotConfigured: Story = {
  args: { aiUnavailableReason: "notConfigured" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("checkbox", { name: AI_OPTION })).toBeDisabled();
    await expect(body.getByText("準備中")).toBeInTheDocument();
    await expect(body.getByText("現在は利用できません。")).toBeInTheDocument();
  },
};

/** 時間指定でない募集では、AIの手直しも、AIを使うときの個人情報の案内も出さない。 */
export const AiUnsupportedPattern: Story = {
  args: { aiUnavailableReason: "unsupported", showsBreakOption: false },
};

/** AIの手直しを入れて作成している間は、「作成する」に進行を出し、閉じる操作を止める。 */
export const CreatingWithAiInteractive: Story = {
  render: (args) => {
    const [isCreating, setCreating] = useState(false);
    return (
      <AutoCreateDialog
        {...args}
        isCreating={isCreating}
        onCreate={() => {
          setCreating(true);
          // 作成が終わらないままの状態を見るため、解決しない。
          return new Promise<boolean>(() => {});
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByText(AI_OPTION));
    await userEvent.click(body.getByRole("button", { name: "作成する" }));

    await waitFor(() => expect(body.getByRole("button", { name: "キャンセル" })).toBeDisabled());
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

/** 作成できずに終わった場合は、AIの手直しを外して作り直せるよう、閉じない。 */
export const KeepsOpenWhenCreateFailsInteractive: Story = {
  args: { onCreate: fn(async () => false) },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByText(AI_OPTION));
    await userEvent.click(body.getByRole("button", { name: "作成する" }));

    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(body.getByRole("dialog", { name: "シフトを自動作成" })).toBeInTheDocument();
  },
};
