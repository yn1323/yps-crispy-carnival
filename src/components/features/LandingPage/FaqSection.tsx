import { Accordion, Box, Container, Heading, Text, VStack } from "@chakra-ui/react";
import { landingFaqs } from "@/src/components/features/LandingPage/faqs";

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
            {landingFaqs.map((faq) => (
              <Accordion.Item
                key={faq.q}
                value={faq.q}
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
                    {faq.q}
                  </Text>
                  <Accordion.ItemIndicator color="teal.600" />
                </Accordion.ItemTrigger>
                <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
                  <Accordion.ItemBody px={{ base: 5, md: 8 }} py={{ base: 5, md: 6 }}>
                    <VStack align="stretch" gap={2}>
                      {faq.a.split("\n").map((line) => (
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
