import { Accordion, Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

const faqs = [
  {
    question: "本当に無料で使えますか？",
    answer: [
      "はい。正式リリース前の先行利用として、現在は無料でお試しいただけます。",
      "料金プランは今後ご案内します。",
    ],
  },
  {
    question: "登録なしで試せますか？",
    answer: ["はい。デモページは登録なしで試せます。", "実際に使いはじめる場合は、お店の登録が必要です。"],
  },
  {
    question: "スタッフもアカウント登録が必要ですか？",
    answer: ["スタッフは専用アプリのインストールなしで、いつものLINEから希望シフトを提出できます。"],
  },
  {
    question: "LINE公式アカウントは必要ですか？",
    answer: ["必要ありません。", "シフトリ専用のLINEアカウントから通知が届くため、お店側で準備する必要はありません。"],
  },
  {
    question: "スマホでも使えますか？",
    answer: ["スタッフの希望提出はスマホから利用できます。", "シフト作成や管理はPCでの利用をおすすめしています。"],
  },
  {
    question: "小さなお店でも使えますか？",
    answer: ["はい。少人数のお店でも使いやすいように、必要な機能をシンプルにまとめています。"],
  },
];

type FaqSectionProps = {
  headingAs?: "h1" | "h2";
};

export const FaqSection = ({ headingAs = "h2" }: FaqSectionProps) => (
  <Box as="section" id="faq" bg="white" py={{ base: 16, md: 24 }}>
    <Container maxW="6xl">
      <VStack gap={{ base: 8, md: 10 }}>
        <VStack gap={3} textAlign="center">
          <Heading
            as={headingAs}
            color="gray.950"
            fontSize={{ base: "2xl", md: "4xl", xl: "5xl" }}
            lineHeight={{ base: "2rem", md: "3rem", xl: "3.75rem" }}
          >
            よくある質問
          </Heading>
          <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
            使いはじめる前に、よく聞かれることをまとめました。
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
                  <Text as="span" flex="1" color="teal.700" textStyle={{ base: "md", md: "md" }} fontWeight="bold">
                    {faq.question}
                  </Text>
                  <Accordion.ItemIndicator color="teal.600" />
                </Accordion.ItemTrigger>
                <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
                  <Accordion.ItemBody px={{ base: 5, md: 8 }} py={{ base: 5, md: 6 }}>
                    <VStack align="stretch" gap={2}>
                      {faq.answer.map((line) => (
                        <Text key={line} color="gray.900" textStyle="bodySm" lineHeight="1.8">
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
