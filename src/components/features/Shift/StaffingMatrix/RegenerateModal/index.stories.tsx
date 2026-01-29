import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { RegenerateModal } from "./index";

const meta = {
  title: "features/Shift/StaffingMatrix/RegenerateModal",
  component: RegenerateModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof RegenerateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const RegenerateModalWrapper = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <RegenerateModal
      isOpen={isOpen}
      onOpenChange={(details) => setIsOpen(details.open)}
      onClose={() => setIsOpen(false)}
      initialAIInput={{ shopType: "カフェ、ランチメイン", customerCount: "平日80人くらい" }}
      onRegenerate={(result, aiInput) => {
        console.log("再生成結果:", result, aiInput);
        setIsOpen(false);
      }}
      openTime="09:00"
      closeTime="22:00"
      positions={[
        { _id: "pos_1", name: "ホール" },
        { _id: "pos_2", name: "キッチン" },
        { _id: "pos_3", name: "その他" },
      ]}
    />
  );
};

export const Basic: Story = {
  render: () => <RegenerateModalWrapper />,
  args: {} as never,
};
