import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { installTurnstileMock, type TurnstileMock } from "@/src/devtools/turnstileMock";
import { TurnstileWidget } from "./index";

let turnstileMock: TurnstileMock;

const waitForRenderCount = (count: number) => waitFor(() => expect(turnstileMock.renders).toHaveLength(count));

const meta = {
  title: "Shared/TurnstileWidget",
  component: TurnstileWidget,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="360px" maxW="calc(100vw - 32px)">
        <Story />
      </Box>
    ),
  ],
  args: {
    action: "staff_registration",
    siteKey: "test-site-key",
    onError: fn(),
    onVerify: fn(),
    troubleGuidance: "解決しない場合は、シフトの管理者に名前とメールアドレスを伝え、スタッフ登録を依頼してください。",
  },
  beforeEach: () => {
    turnstileMock = installTurnstileMock();
    return turnstileMock.restore;
  },
} satisfies Meta<typeof TurnstileWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 15秒を待たずに、確認が終わらない場合の案内を表示する。 */
export const Stalled: Story = {
  args: { stallTimeoutMs: 0 },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("alert");
  },
};

export const VerifiedBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("セキュリティ確認をしています")).toBeInTheDocument();
    await waitForRenderCount(1);

    turnstileMock.latestRender()["before-interactive-callback"]();
    await expect(await canvas.findByText("下に表示された確認欄にチェックを入れてください。")).toBeInTheDocument();

    turnstileMock.latestRender()["after-interactive-callback"]();
    turnstileMock.latestRender().callback("verified-token");
    await expect(await canvas.findByText("セキュリティ確認が完了しました")).toBeInTheDocument();
    await expect(args.onVerify).toHaveBeenLastCalledWith("verified-token");
  },
};

export const StalledBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { stallTimeoutMs: 50 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("セキュリティ確認に時間がかかっています")).toBeInTheDocument();
    await expect(within(alert).getByText(/シフトの管理者に名前とメールアドレスを伝え/)).toBeInTheDocument();

    // 案内を出した後も確認は続け、遅れて完了したtokenで送信できるようにする。
    turnstileMock.latestRender().callback("late-token");
    await expect(await canvas.findByText("セキュリティ確認が完了しました")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(args.onVerify).toHaveBeenLastCalledWith("late-token");
    await expect(turnstileMock.renders).toHaveLength(1);
  },
};

export const FailedRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("セキュリティ確認をしています");
    await waitForRenderCount(1);

    turnstileMock.latestRender()["error-callback"]("300030");
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("セキュリティ確認を完了できませんでした")).toBeInTheDocument();
    await expect(args.onError).toHaveBeenLastCalledWith("300030");

    await userEvent.click(within(alert).getByRole("button", { name: "もう一度確認する" }));
    await expect(await canvas.findByText("セキュリティ確認をしています")).toBeInTheDocument();
    await waitForRenderCount(2);
    await expect(turnstileMock.removedWidgetIds).toEqual(["widget-1"]);
    await expect(args.onVerify).toHaveBeenLastCalledWith("");
  },
};

export const UnsupportedBrowserBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("セキュリティ確認をしています");
    await waitForRenderCount(1);

    turnstileMock.latestRender()["unsupported-callback"]();
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("セキュリティ確認を完了できませんでした")).toBeInTheDocument();
    await expect(args.onError).toHaveBeenCalledTimes(1);
  },
};
