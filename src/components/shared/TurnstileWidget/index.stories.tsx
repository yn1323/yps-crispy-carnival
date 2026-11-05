import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { TurnstileWidget } from "./index";

type RenderOptions = Parameters<NonNullable<Window["turnstile"]>["render"]>[1];

const turnstileMock = {
  renders: [] as RenderOptions[],
  removedWidgetIds: [] as string[],
};

const waitForRenderCount = (count: number) => waitFor(() => expect(turnstileMock.renders).toHaveLength(count));

const latestRender = () => {
  const options = turnstileMock.renders.at(-1);
  if (!options) throw new Error("Turnstile widget was not rendered");
  return options;
};

const meta = {
  title: "Shared/TurnstileWidget",
  component: TurnstileWidget,
  parameters: { layout: "centered", screenshot: { skip: true } },
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
    troubleGuidance:
      "それでも申請できない場合は、店舗の管理者に名前とメールアドレスを伝えて、登録してもらってください。",
  },
  beforeEach: () => {
    const original = window.turnstile;
    turnstileMock.renders = [];
    turnstileMock.removedWidgetIds = [];
    // 外部scriptを読み込まず、Cloudflareから届くcallbackをStoryから発火する。
    window.turnstile = {
      render: (_element, options) => {
        turnstileMock.renders.push(options);
        return `widget-${turnstileMock.renders.length}`;
      },
      remove: (widgetId) => {
        turnstileMock.removedWidgetIds.push(widgetId);
      },
    };
    return () => {
      window.turnstile = original;
    };
  },
} satisfies Meta<typeof TurnstileWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VerifiedBehavior: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("セキュリティ確認をしています")).toBeInTheDocument();
    await waitForRenderCount(1);

    latestRender()["before-interactive-callback"]();
    await expect(await canvas.findByText("下に表示された確認欄にチェックを入れてください。")).toBeInTheDocument();

    latestRender()["after-interactive-callback"]();
    latestRender().callback("verified-token");
    await expect(await canvas.findByText("セキュリティ確認が完了しました")).toBeInTheDocument();
    await expect(args.onVerify).toHaveBeenLastCalledWith("verified-token");
  },
};

export const StalledBehavior: Story = {
  args: { stallTimeoutMs: 50 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("セキュリティ確認に時間がかかっています")).toBeInTheDocument();
    await expect(within(alert).getByText(/店舗の管理者に名前とメールアドレスを伝えて/)).toBeInTheDocument();

    // 案内を出した後も確認は続け、遅れて完了したtokenで送信できるようにする。
    latestRender().callback("late-token");
    await expect(await canvas.findByText("セキュリティ確認が完了しました")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(args.onVerify).toHaveBeenLastCalledWith("late-token");
    await expect(turnstileMock.renders).toHaveLength(1);
  },
};

export const FailedRetryBehavior: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("セキュリティ確認をしています");
    await waitForRenderCount(1);

    latestRender()["error-callback"]("300030");
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
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("セキュリティ確認をしています");
    await waitForRenderCount(1);

    latestRender()["unsupported-callback"]();
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("セキュリティ確認を完了できませんでした")).toBeInTheDocument();
    await expect(args.onError).toHaveBeenCalledTimes(1);
  },
};
