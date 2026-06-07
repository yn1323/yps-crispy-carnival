import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ConfirmShiftContent } from "./ConfirmShiftContent";
import { RemindUnsubmittedContent } from "./RemindUnsubmittedContent";

const meta = {
  title: "Features/ShiftBoard/DialogContents",
  component: ConfirmShiftContent,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ConfirmShiftContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    staffCount: 10,
    periodLabel: "1/20(月)〜1/26(日)",
  },
  render: () => (
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={5} maxW="960px">
      <VariantBlock label="シフト確定">
        <ConfirmShiftContent staffCount={10} periodLabel="1/20(月)〜1/26(日)" />
      </VariantBlock>
      <VariantBlock label="未提出者一覧 / 1名">
        <RemindUnsubmittedContent deadline="5/10(土) 23:59" unsubmittedNames={["田中次郎"]} />
      </VariantBlock>
      <VariantBlock label="未提出者一覧 / 標準">
        <RemindUnsubmittedContent deadline="5/10(土) 23:59" unsubmittedNames={["田中次郎", "小林大輔", "佐藤花子"]} />
      </VariantBlock>
      <VariantBlock label="未提出者一覧 / 多人数">
        <RemindUnsubmittedContent
          deadline="5/10(土) 23:59"
          unsubmittedNames={[
            "田中次郎",
            "小林大輔",
            "佐藤花子",
            "山田太郎",
            "鈴木一郎",
            "高橋健太",
            "中村真理",
            "渡辺優子",
          ]}
        />
      </VariantBlock>
    </SimpleGrid>
  ),
};

const VariantBlock = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={3}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
      {label}
    </Text>
    <Box bg="white" borderWidth="1px" borderColor="border.muted" borderRadius="lg" p={4}>
      {children}
    </Box>
  </Stack>
);
