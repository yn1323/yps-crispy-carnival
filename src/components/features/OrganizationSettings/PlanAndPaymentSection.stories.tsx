import { Button } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import type { OrganizationBillingView } from "./types";

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  peopleUsage: { current: 4, max: 15 },
  shopUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  invoices: [],
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

const meta = {
  title: "Features/OrganizationSettings/PlanAndPaymentSection",
  component: PlanAndPaymentSection,
  parameters: { layout: "padded", screenshot: { skip: true } },
  args: {
    organizationName: "さくらダイニング",
    billing,
    freeSelection: {
      selectedManagerId: "person-1",
      selectedManagerName: "田中 太郎",
      selectedShopId: "shop-1",
      selectedShopName: "渋谷店",
      managerCandidates: [{ id: "person-1", name: "田中 太郎", projectedPeopleCount: 4 }],
      shopCandidates: [{ id: "shop-1", name: "渋谷店" }],
      projectedPeopleCount: 4,
      readOnlyManagerNames: [],
      suspendedShopNames: [],
      isComplete: true,
    },
    onManagePlan: fn(),
    onUpdatePaymentMethod: fn(),
    onUpdateBillingEmail: fn(),
    onOpenInvoice: fn(),
    onSaveFreeSelection: fn(),
  },
} satisfies Meta<typeof PlanAndPaymentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const DynamicCapabilityHarness = (args: React.ComponentProps<typeof PlanAndPaymentSection>) => {
  const [canScheduleFree, setCanScheduleFree] = useState(true);
  const [dialog, setDialog] = useState<Element | null>(null);
  useEffect(() => {
    const updateDialog = () => setDialog(document.querySelector('[role="alertdialog"]'));
    updateDialog();
    const observer = new MutationObserver(updateDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <PlanAndPaymentSection {...args} billing={{ ...args.billing, canScheduleFree }} />
      {dialog &&
        createPortal(
          <Button size="sm" variant="outline" onClick={() => setCanScheduleFree(false)}>
            Free設定権限を外す
          </Button>,
          dialog,
        )}
    </>
  );
};

export const DynamicFreeCapabilityLoss: Story = {
  render: (args) => <DynamicCapabilityHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Freeで残す内容を確認" }));
    await expect(await screen.findByRole("alertdialog", { name: "Freeプランで残す内容を確認" })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "Free設定権限を外す" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(args.onSaveFreeSelection).not.toHaveBeenCalled();
  },
};
