import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupModal } from "./index";

const meta = {
  title: "Features/Dashboard/SetupModal",
  component: SetupModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onComplete: () => {},
    managerProfileDefaults: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
} satisfies Meta<typeof SetupModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = {};

const waitForElement = async <T extends HTMLElement>(
  finder: () => T | null,
  message: string,
  timeout = 2000,
): Promise<T> => {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const element = finder();
    if (element) return element;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(message);
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const clickButton = async (text: string, match: "exact" | "includes" = "exact") => {
  const button = await waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
        match === "exact" ? candidate.textContent?.trim() === text : candidate.textContent?.includes(text),
      ) ?? null,
    `${text} ボタンが見つかりませんでした`,
  );
  button.click();
};

const inputShopName = async () => {
  const shopNameInput = await waitForElement(
    () => document.querySelector<HTMLInputElement>('input[name="shopName"]'),
    "店舗名の入力欄が見つかりませんでした",
  );
  setInputValue(shopNameInput, "居酒屋たなか");
};

export const DateOnlySkipsSettings: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async () => {
    await inputShopName();

    await clickButton("次へ");
    await waitForElement(
      () => document.querySelector<HTMLInputElement>('input[name="name"]'),
      "あなたの名前ステップの入力欄が表示されませんでした",
    );
  },
};

export const TimeSettingsStep: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async () => {
    await inputShopName();
    await clickButton("時間指定", "includes");
    await clickButton("次へ");

    await waitForElement(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>("label")).find(
          (candidate) => candidate.textContent?.trim() === "シフト開始時間",
        ) ?? null,
      "勤務時間ステップが表示されませんでした",
    );
  },
};

export const ShiftTypeSettingsStep: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async () => {
    await inputShopName();
    await clickButton("勤務区分", "includes");
    await clickButton("次へ");

    await waitForElement(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>("label")).find(
          (candidate) => candidate.textContent?.trim() === "区分名",
        ) ?? null,
      "勤務区分ステップが表示されませんでした",
    );
  },
};
