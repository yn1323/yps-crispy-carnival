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
    ownerProfileDefaults: {
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

const clickSelectOption = async (triggerIndex: number, value: string) => {
  const trigger = await waitForElement(
    () => document.querySelectorAll<HTMLElement>('[data-part="trigger"]')[triggerIndex] ?? null,
    `Select ${triggerIndex + 1} のトリガーが見つかりませんでした`,
  );
  trigger.click();

  const option = await waitForElement(
    () => document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`),
    `${value} の選択肢が見つかりませんでした`,
  );
  option.click();
};

const clickButton = async (text: string) => {
  const button = await waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === text,
      ) ?? null,
    `${text} ボタンが見つかりませんでした`,
  );
  button.click();
};

export const Step2: Story = {
  play: async () => {
    const shopNameInput = await waitForElement(
      () => document.querySelector<HTMLInputElement>('input[name="shopName"]'),
      "店舗名の入力欄が見つかりませんでした",
    );
    setInputValue(shopNameInput, "居酒屋たなか");

    await clickSelectOption(0, "14:00");
    await clickSelectOption(1, "25:00");
    await clickButton("次へ");
    await waitForElement(
      () => document.querySelector<HTMLInputElement>('input[name="name"]'),
      "Step2 の入力欄が表示されませんでした",
    );
  },
};
