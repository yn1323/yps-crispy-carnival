import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { RouteErrorFallback } from ".";

const providerError = new Error(
  "useContext returned 'undefined'. Seems you forgot to wrap component within <ChakraProvider />",
);

const meta = {
  title: "UI/RouteErrorFallback",
  component: RouteErrorFallback,
  parameters: { layout: "fullscreen" },
  args: {
    error: providerError,
    onRefresh: () => {},
  },
} satisfies Meta<typeof RouteErrorFallback>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const ErrorDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const errorMessage = canvas.getByText(providerError.message);
    await expect(errorMessage).not.toBeVisible();

    await userEvent.click(await canvas.findByText("エラーの詳細を表示"));

    await expect(errorMessage).toBeVisible();
    await expect(errorMessage.closest("pre")).toHaveAttribute("data-clarity-mask", "true");
    const contact = await canvas.findByRole("link", { name: "お問い合わせフォーム（別タブ）" });
    await expect(contact).toHaveAttribute("href", "https://shiftori.app/contact");
    await expect(contact).toHaveAttribute("target", "_blank");
    await expect(contact).toHaveAttribute("rel", "noopener noreferrer");

    await userEvent.click(await canvas.findByText("エラーの詳細を閉じる"));
    await expect(errorMessage).not.toBeVisible();
    await expect(contact).toBeVisible();

    await userEvent.click(await canvas.findByText("エラーの詳細を表示"));
    await expect(errorMessage).toBeVisible();
  },
};

export const MobileLongErrorDetails: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { error: new Error(`Failed to fetch dynamically imported module: /assets/${"module".repeat(35)}.js`) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("エラーの詳細を表示"));
    await expect(canvas.getByText((args.error as Error).message)).toBeVisible();
  },
};

let refreshClickCount = 0;

export const RefreshAction: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    onRefresh: () => {
      refreshClickCount += 1;
    },
  },
  play: async ({ canvasElement }) => {
    refreshClickCount = 0;
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "再読み込みする" }));
    expect(refreshClickCount).toBe(1);
  },
};
