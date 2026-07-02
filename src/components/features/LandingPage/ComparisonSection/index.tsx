import { Badge, Box, Container, Flex, Table, Text, VStack } from "@chakra-ui/react";
import { SectionHeading } from "../SectionHeading";

const comparisonRows = [
  {
    item: "希望シフト回収",
    old: "紙・口頭・LINEでバラバラ",
    shiftori: "LINE・メールでひとつに回収",
  },
  {
    item: "催促",
    old: "個別に連絡が必要",
    shiftori: "未提出者へ自動リマインド",
  },
  {
    item: "調整",
    old: "Excelへ転記して作成",
    shiftori: "画面上でシフトを調整",
  },
  {
    item: "共有",
    old: "確定後に個別送信・投稿",
    shiftori: "確定後にLINE・メールで自動共有",
  },
];

const shiftoriBodyTextColor = "green.700";

export const ComparisonSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={7}>
        <SectionHeading phrases={["紙・Excel・LINEグループの", "シフト管理を、ひとつに。"]} textAlign="center" />

        <ComparisonTable />
        <ComparisonCards />
      </VStack>
    </Container>
  </Box>
);

const ComparisonTable = () => (
  <Box hideBelow="md" w="full" overflowX="auto" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
    <Table.Root size="md">
      <Table.Header>
        <Table.Row bg="teal.500">
          <Table.ColumnHeader color="white" fontWeight="bold" textAlign="center" w="28%">
            シフト作成タスク
          </Table.ColumnHeader>
          <Table.ColumnHeader color="white" fontWeight="bold" textAlign="center">
            紙・Excel・LINEグループ
          </Table.ColumnHeader>
          <Table.ColumnHeader color="white" fontWeight="bold" textAlign="center">
            シフトリ
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {comparisonRows.map((row) => (
          <Table.Row key={row.item}>
            <Table.Cell color="gray.950" fontWeight="bold" textAlign="center" verticalAlign="middle">
              {row.item}
            </Table.Cell>
            <Table.Cell color="gray.700" fontWeight="semibold" textAlign="center" verticalAlign="middle">
              {row.old}
            </Table.Cell>
            <Table.Cell color={shiftoriBodyTextColor} fontWeight="black" textAlign="center" verticalAlign="middle">
              {row.shiftori}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  </Box>
);

const ComparisonCards = () => (
  <VStack hideFrom="md" align="stretch" gap={4} w="full">
    {comparisonRows.map((row) => (
      <Box key={row.item} borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4}>
        <Text color="gray.950" fontSize="md" fontWeight="black" lineHeight="1.5">
          {row.item}
        </Text>
        <VStack align="stretch" gap={2.5} mt={4}>
          <ComparisonValue label="Before" tone="before">
            {row.old}
          </ComparisonValue>
          <ComparisonValue label="After" tone="after">
            {row.shiftori}
          </ComparisonValue>
        </VStack>
      </Box>
    ))}
  </VStack>
);

const ComparisonValue = ({
  label,
  tone,
  children,
}: {
  label: "Before" | "After";
  tone: "before" | "after";
  children: string;
}) => {
  const isAfter = tone === "after";

  return (
    <Flex align="center" gap={3} bg={isAfter ? "green.50" : "gray.50"} borderRadius="md" p={3.5}>
      <Badge colorPalette={isAfter ? "green" : "gray"} variant="subtle" borderRadius="full" px={2.5} flexShrink={0}>
        {label}
      </Badge>
      <Text
        minW={0}
        color={isAfter ? shiftoriBodyTextColor : "gray.700"}
        fontSize="sm"
        fontWeight={isAfter ? "black" : "bold"}
        lineHeight="1.7"
      >
        {children}
      </Text>
    </Flex>
  );
};
