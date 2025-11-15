import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select, type SelectItemType } from ".";

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { value: "1", label: "選択肢1" },
  { value: "2", label: "選択肢2" },
  { value: "3", label: "選択肢3" },
] as SelectItemType[];

export const Basic: Story = {
  args: {
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<string>("1");
    return <Select items={items} value={value} onChange={setValue} />;
  },
};

export const Unselected: Story = {
  args: {
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select items={items} value={value} onChange={setValue} placeholder="選択してください" />;
  },
};

export const WithError: Story = {
  args: {
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select items={items} value={value} onChange={setValue} invalid={!value} placeholder="必須項目です" />;
  },
};

export const WithPortal: Story = {
  args: {
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<string>("1");
    return <Select items={items} value={value} onChange={setValue} usePortal={true} />;
  },
};

export const WithoutPortal: Story = {
  args: {
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<string>("1");
    return <Select items={items} value={value} onChange={setValue} usePortal={false} />;
  },
};
