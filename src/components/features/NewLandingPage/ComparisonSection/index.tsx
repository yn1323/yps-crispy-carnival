import { Box, Container, Heading, Table, Text, VStack } from "@chakra-ui/react";

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

export const ComparisonSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={7}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0" textAlign="center">
          紙・Excel・LINEグループのシフト管理を、ひとつに。
        </Heading>

        <Box w="full" overflowX="auto" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader color="gray.800" fontWeight="bold" textAlign="center" w="28%">
                  項目
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.800" fontWeight="bold" textAlign="center">
                  紙・Excel・LINEグループ
                </Table.ColumnHeader>
                <Table.ColumnHeader color="gray.800" fontWeight="bold" textAlign="center">
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
                  <Table.Cell color="teal.700" fontWeight="black" textAlign="center" verticalAlign="middle">
                    {row.shiftori}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        <Text color="gray.600" fontSize="sm" textAlign="center" lineHeight="1.8">
          連絡する場所を増やさずに、誰が出したかの確認も、確定の連絡も、同じ画面でできます。
        </Text>
      </VStack>
    </Container>
  </Box>
);
