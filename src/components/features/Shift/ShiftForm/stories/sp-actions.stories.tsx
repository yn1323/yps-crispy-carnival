import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { allPatternsArgs, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

const ActionHarness = (args: ComponentProps<typeof ShiftForm>) => {
  const [operations, setOperations] = useState({ drafts: 0, confirmations: 0, exports: 0 });

  return (
    <>
      <Box flex={1} minH={0}>
        <ShiftForm
          {...args}
          onSaveDraft={() => setOperations((current) => ({ ...current, drafts: current.drafts + 1 }))}
          onConfirm={() => setOperations((current) => ({ ...current, confirmations: current.confirmations + 1 }))}
          exportAction={{
            isDisabled: args.exportAction?.isDisabled ?? false,
            onClick: () => setOperations((current) => ({ ...current, exports: current.exports + 1 })),
          }}
        />
      </Box>
      <Box role="status" aria-label="操作結果" p={2} fontSize="sm">
        下書き保存：{operations.drafts}回、確定・再送：{operations.confirmations}回、出力：{operations.exports}回
      </Box>
    </>
  );
};

const meta = {
  title: "Features/Shift/ShiftForm/SP/Actions",
  component: ShiftForm,
  decorators: shiftFormDecorators,
  parameters: {
    ...fullscreenParameters,
    screenshot: { skip: true },
  },
  globals: mobileGlobals,
  args: {
    ...allPatternsArgs,
    header: { desktopTitle: "店舗：1/23", mobileTitle: "1/23" },
  },
  render: (args) => <ActionHarness {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectActions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", { name: "保存・確定・出力" });
    const result = canvas.getByRole("status", { name: "操作結果" });

    await expect(canvas.getByRole("heading", { level: 1, name: "1/23" })).toBeInTheDocument();
    const triggerBounds = trigger.getBoundingClientRect();
    for (const y of [triggerBounds.top - 5, triggerBounds.bottom + 5]) {
      const touchTarget = canvasElement.ownerDocument.elementFromPoint(triggerBounds.left + triggerBounds.width / 2, y);
      await expect(touchTarget).toBe(trigger);
    }

    await userEvent.click(trigger);
    await screen.findByRole("menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(result).toHaveTextContent("下書き保存：0回、確定・再送：0回、出力：0回");

    await userEvent.click(screen.getByRole("menuitem", { name: "下書きを保存" }));
    await expect(result).toHaveTextContent("下書き保存：1回、確定・再送：0回、出力：0回");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "シフトを確定" }));
    await expect(result).toHaveTextContent("下書き保存：1回、確定・再送：1回、出力：0回");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "PDF・Excel出力" }));
    await expect(result).toHaveTextContent("下書き保存：1回、確定・再送：1回、出力：1回");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  },
};

export const ResendConfirmedShift: Story = {
  args: { isConfirmed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", { name: "保存・再送・出力" });

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "確定シフトを再送" }));
    await expect(canvas.getByRole("status", { name: "操作結果" })).toHaveTextContent(
      "下書き保存：0回、確定・再送：1回、出力：0回",
    );
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  },
};

export const ExportUnavailable: Story = {
  args: { exportAction: { isDisabled: true, onClick: () => {} } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole("button", { name: "保存・確定・出力" });

    await userEvent.click(trigger);
    const exportItem = await screen.findByRole("menuitem", { name: "PDF・Excel出力" });
    await expect(exportItem).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(exportItem);
    await expect(canvas.getByRole("status", { name: "操作結果" })).toHaveTextContent(
      "下書き保存：0回、確定・再送：0回、出力：0回",
    );
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  },
};

const expectBlockedActions: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const screen = within(canvasElement.ownerDocument.body);
  const trigger = await canvas.findByRole("button", { name: "保存・確定・出力" });

  await expect(trigger).toBeDisabled();
  await userEvent.click(trigger);
  await expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await expect(canvas.getByRole("status", { name: "操作結果" })).toHaveTextContent(
    "下書き保存：0回、確定・再送：0回、出力：0回",
  );
};

export const SavingDraft: Story = {
  args: { isSavingDraft: true },
  play: expectBlockedActions,
};

export const ConfirmingShift: Story = {
  args: { isConfirming: true },
  play: expectBlockedActions,
};

export const ReadOnlyExport: Story = {
  args: { isReadOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: "PDF・Excel（別タブで開きます）" }));
    await expect(canvas.getByRole("status", { name: "操作結果" })).toHaveTextContent(
      "下書き保存：0回、確定・再送：0回、出力：1回",
    );
    await expect(canvas.queryByRole("button", { name: "保存・確定・出力" })).not.toBeInTheDocument();
  },
};
