import { Field, Input, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuShield } from "react-icons/lu";
import { FormCard } from "./index";

const meta = {
  title: "UI/FormCard",
  component: FormCard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof FormCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    icon: LuShield,
    iconColor: "teal",
    title: "基本情報",
    children: (
      <Stack gap={4}>
        <Field.Root>
          <Field.Label>ユーザー名</Field.Label>
          <Input placeholder="山田太郎" />
        </Field.Root>
        <Field.Root>
          <Field.Label>メールアドレス</Field.Label>
          <Input type="email" placeholder="example@example.com" />
        </Field.Root>
      </Stack>
    ),
  },
};
