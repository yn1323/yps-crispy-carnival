import { Accordion, Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

const faqs = [
  {
    question: "本当に無料で使えますか？",
    answer: [
      "現在は正式リリースに向けて準備中のため、すべての機能を無料でお試しいただけます。",
      "正式な料金プランは今後ご案内予定です。",
    ],
  },
  {
    question: "登録しないと使えませんか？",
    answer: ["登録なしで試せるデモページをご用意しています。", "実際に使いはじめる場合は、お店の登録が必要です。"],
  },
  {
    question: "スタッフもアカウント登録が必要ですか？",
    answer: ["スタッフは専用アプリのインストールなしで、いつものLINEから希望シフトを提出できます。"],
  },
  {
    question: "LINE公式アカウントは必要ですか？",
    answer: [
      "必要ありません。",
      "シフトリ専用のLINEアカウントからスタッフへ通知が届くため、お店側でLINE公式アカウントを準備する必要はありません。",
    ],
  },
  {
    question: "スマホでも使えますか？",
    answer: [
      "スタッフの希望提出はスマホから利用できます。",
      "シフト作成や管理はPCでの利用をおすすめしています（スマホでも一部確認できます）。",
    ],
  },
  {
    question: "小さなお店でも使えますか？",
    answer: ["はい。少人数のお店でも使いやすいように、必要な機能をシンプルにまとめています。"],
  },
];

export const FaqSection = () => (
  <Box as="section" bg="white" py={{ base: 16, md: 24 }}>
    <Container maxW="6xl">
      <VStack gap={{ base: 8, md: 10 }}>
        <VStack gap={3} textAlign="center">
          <Heading as="h2" color="gray.950" fontSize={{ base: "3xl", md: "5xl" }} lineHeight="1.2">
            よくある質問
          </Heading>
          <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight="1.9">
            シフトリを使いはじめる前に、気になりやすいことをまとめました。
          </Text>
        </VStack>

        <Accordion.Root collapsible multiple variant="plain" w="full" maxW="980px">
          <VStack align="stretch" gap={{ base: 3, md: 4 }}>
            {faqs.map((faq) => (
              <Accordion.Item
                key={faq.question}
                value={faq.question}
                bg="white"
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="xl"
                boxShadow="0 10px 24px rgba(15, 23, 42, 0.06)"
                overflow="hidden"
              >
                <Accordion.ItemTrigger
                  alignItems="center"
                  gap={4}
                  px={{ base: 5, md: 8 }}
                  py={{ base: 4, md: 5 }}
                  cursor="pointer"
                  textAlign="left"
                  _hover={{ bg: "teal.50" }}
                >
                  <Text as="span" flex="1" color="teal.700" fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
                    {faq.question}
                  </Text>
                  <Accordion.ItemIndicator color="teal.600" />
                </Accordion.ItemTrigger>
                <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
                  <Accordion.ItemBody px={{ base: 5, md: 8 }} py={{ base: 5, md: 6 }}>
                    <VStack align="stretch" gap={2}>
                      {faq.answer.map((line) => (
                        <Text key={line} color="gray.900" fontSize={{ base: "sm", md: "md" }} lineHeight="1.9">
                          {line}
                        </Text>
                      ))}
                    </VStack>
                  </Accordion.ItemBody>
                </Accordion.ItemContent>
              </Accordion.Item>
            ))}
          </VStack>
        </Accordion.Root>
      </VStack>
    </Container>
  </Box>
);
