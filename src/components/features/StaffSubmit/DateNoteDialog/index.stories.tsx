import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateNoteDialog } from "./index";

const meta = {
  title: "features/StaffSubmit/DateNoteDialog",
  component: DateNoteDialog,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  args: {
    date: "2026-04-07",
    note: "",
    onClose: () => {},
    onSave: () => {},
  },
} satisfies Meta<typeof DateNoteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** メモを書く前のDialog。入力例、文字数、個人情報と機密情報の補足を確認する。 */
export const Empty: Story = {};

export const WithNote: Story = {
  args: { note: "17時以降なら入れます" },
};
