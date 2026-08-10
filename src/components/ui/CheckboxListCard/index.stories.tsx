import { Badge, Flex, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LuStore } from "react-icons/lu";
import { expect, userEvent, within } from "storybook/test";
import { CheckboxListCard, CheckboxListCardItem } from ".";

const meta = {
  title: "UI/CheckboxListCard",
  component: CheckboxListCard,
  parameters: { layout: "padded" },
  args: {
    ariaLabel: "選択肢",
    children: null,
  },
} satisfies Meta<typeof CheckboxListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <StoreListExample />,
};

export const DisabledWithReason: Story = {
  render: () => <DisabledWithReasonExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "プラン停止中の店舗" });

    await expect(checkbox).toBeDisabled();
    await expect(checkbox).toHaveAccessibleDescription("稼働中の店舗だけ所属を変更できます。");
    await userEvent.click(canvas.getByText("プラン停止中の店舗"));
    await expect(canvas.getByTestId("disabled-change-count")).toHaveTextContent("0");
  },
};

export const LongText: Story = {
  render: () => (
    <CheckboxListCard ariaLabel="スタッフを選択">
      <CheckboxListCardItem
        checked={false}
        ariaLabel="長い名前のスタッフ"
        leading={<PersonAvatar>長</PersonAvatar>}
        trailing={<StatusBadge>管理者</StatusBadge>}
        onCheckedChange={() => {}}
      >
        <Stack gap={0.5}>
          <Text fontWeight="medium" color="gray.900" lineHeight="short">
            複数店舗を担当しているとても長い名前のスタッフがモバイル幅でも省略されずに折り返される例
          </Text>
          <Text fontSize="xs" color="fg.muted">
            very-long-staff-address-for-layout-verification@example-shiftori.test
          </Text>
        </Stack>
      </CheckboxListCardItem>
    </CheckboxListCard>
  ),
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <StoreListExample />,
};

export const KeyboardSelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <KeyboardSelectionExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "本店" });

    await expect(checkbox).not.toBeChecked();
    checkbox.focus();
    await expect(checkbox).toHaveFocus();
    await userEvent.keyboard("[Space]");
    await expect(checkbox).toBeChecked();

    await userEvent.click(canvas.getByText("本店"));
    await expect(checkbox).not.toBeChecked();
  },
};

function StoreListExample() {
  return (
    <CheckboxListCard ariaLabel="所属する店舗">
      <CheckboxListCardItem checked ariaLabel="渋谷店" leading={<StoreIcon />} onCheckedChange={() => {}}>
        <Text fontWeight="medium" color="gray.900">
          渋谷店
        </Text>
      </CheckboxListCardItem>
      <CheckboxListCardItem checked={false} ariaLabel="新宿店" leading={<StoreIcon />} onCheckedChange={() => {}}>
        <Text fontWeight="medium" color="gray.900">
          新宿店
        </Text>
      </CheckboxListCardItem>
    </CheckboxListCard>
  );
}

function KeyboardSelectionExample() {
  const [checked, setChecked] = useState(false);

  return (
    <CheckboxListCard ariaLabel="所属する店舗">
      <CheckboxListCardItem checked={checked} ariaLabel="本店" leading={<StoreIcon />} onCheckedChange={setChecked}>
        <Text fontWeight="medium" color="gray.900">
          本店
        </Text>
      </CheckboxListCardItem>
    </CheckboxListCard>
  );
}

function DisabledWithReasonExample() {
  const [changeCount, setChangeCount] = useState(0);

  return (
    <>
      <output data-testid="disabled-change-count" hidden>
        {changeCount}
      </output>
      <CheckboxListCard ariaLabel="所属する店舗">
        <CheckboxListCardItem
          checked
          disabled
          ariaLabel="プラン停止中の店舗"
          leading={<StoreIcon />}
          trailing={<StatusBadge>プラン停止中</StatusBadge>}
          disabledReason="稼働中の店舗だけ所属を変更できます。"
          onCheckedChange={() => setChangeCount((current) => current + 1)}
        >
          <Text fontWeight="medium" color="gray.900">
            プラン停止中の店舗
          </Text>
        </CheckboxListCardItem>
      </CheckboxListCard>
    </>
  );
}

function StoreIcon() {
  return (
    <Flex
      boxSize="40px"
      borderRadius="lg"
      bg="teal.100"
      color="teal.700"
      align="center"
      justify="center"
      flexShrink={0}
      aria-hidden
    >
      <LuStore />
    </Flex>
  );
}

function PersonAvatar({ children }: { children: string }) {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="teal.100"
      color="teal.700"
      align="center"
      justify="center"
      flexShrink={0}
      fontWeight="semibold"
      aria-hidden
    >
      {children}
    </Flex>
  );
}

function StatusBadge({ children }: { children: string }) {
  return (
    <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
      {children}
    </Badge>
  );
}
