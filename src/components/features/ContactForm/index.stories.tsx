import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ContactFormController } from "./ContactFormController";

const meta = {
  title: "features/ContactForm",
  component: ContactFormController,
  args: {
    onSubmit: async () => {},
    verification: { token: "storybook-token" },
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof ContactFormController>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TroubleGuidance: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "問い合わせ種別" }), "trouble");
    await expect(canvas.getByRole("textbox", { name: "問い合わせ内容" })).toHaveAttribute(
      "placeholder",
      "シフトを確定しようとすると「○○」と表示されます。\n再読み込みしても同じ状態です。",
    );
    await expect(
      canvas.getByText("エラーメッセージや直前の操作もご記載いただくと、より早く確認できます。"),
    ).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const Validation: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "問い合わせを送る" }));
    await expect(canvas.findByText("氏名を入力してください")).resolves.toBeVisible();
    await expect(canvas.findByText("メールアドレスを入力してください")).resolves.toBeVisible();
    await expect(canvas.findByText("問い合わせ内容を入力してください")).resolves.toBeVisible();
  },
};

export const SuccessfulSubmission: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "氏名" }), "田中 太郎");
    await userEvent.type(canvas.getByRole("textbox", { name: "メールアドレス" }), "tanaka@example.com");
    await userEvent.type(canvas.getByRole("textbox", { name: "問い合わせ内容" }), "導入について相談したいです");
    await userEvent.click(canvas.getByRole("checkbox", { name: /プライバシーポリシー/ }));
    await userEvent.click(canvas.getByRole("button", { name: "問い合わせを送る" }));
    await expect(canvas.findByRole("heading", { name: "お問い合わせを受け付けました" })).resolves.toBeVisible();
    await expect(canvas.findByRole("link", { name: "TOPに戻る" })).resolves.toHaveAttribute("href", "/");
  },
};
