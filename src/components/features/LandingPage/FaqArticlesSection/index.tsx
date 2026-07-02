import { Accordion, Badge, Box, Container, Flex, Icon, Image, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuBookOpen, LuFileSpreadsheet, LuMessageCircle, LuMonitorCheck } from "react-icons/lu";
import type { ArticleContent } from "@/src/components/features/ArticleSite/articleContent";
import { articles } from "@/src/components/features/ArticleSite/articleContent";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { landingFaqs } from "../faqs";
import { SectionHeading } from "../SectionHeading";

const articleIcons = [LuMessageCircle, LuMonitorCheck, LuFileSpreadsheet, LuBookOpen];
const previewArticles = articles.slice(0, 4);

export const FaqArticlesSection = () => (
  <Box as="section" bg="#fbfefe" py={16}>
    <Container maxW="7xl">
      <VStack align="stretch" gap={12}>
        <Box id="faq" scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}>
          <SectionHeading phrases={["よくある質問"]} textAlign="center" />
          <Accordion.Root collapsible multiple variant="plain" mt={5}>
            <VStack align="stretch" gap={2.5}>
              {landingFaqs.map((faq) => (
                <Accordion.Item
                  key={faq.q}
                  value={faq.q}
                  bg="white"
                  borderWidth="1px"
                  borderColor="gray.200"
                  borderRadius="md"
                  overflow="hidden"
                >
                  <Accordion.ItemTrigger px={4} py={3} cursor="pointer" textAlign="left" _hover={{ bg: "teal.50" }}>
                    <Text as="span" flex="1" color="gray.950" fontSize="sm" fontWeight="bold" lineHeight="1.6">
                      {faq.q}
                    </Text>
                    <Accordion.ItemIndicator color="teal.600" />
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
                    <Accordion.ItemBody px={4} py={4}>
                      <Text color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold">
                        {faq.a}
                      </Text>
                    </Accordion.ItemBody>
                  </Accordion.ItemContent>
                </Accordion.Item>
              ))}
            </VStack>
          </Accordion.Root>
        </Box>

        <Box id="articles" scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}>
          <Flex align="end" justify="space-between" gap={5} mb={5}>
            <Box>
              <SectionHeading phrases={["お役立ち記事"]} />
              <Text mt={2} color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
                シフト管理に役立つノウハウを公開中
              </Text>
            </Box>
            <Link
              href="/articles"
              color="teal.700"
              fontSize="sm"
              fontWeight="bold"
              whiteSpace="nowrap"
              flexShrink={0}
              _hover={{ textDecoration: "none", color: "teal.900" }}
            >
              すべての記事を見る
            </Link>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            {previewArticles.map((article, index) => (
              <ArticleCard key={article.meta.slug} article={article} icon={articleIcons[index % articleIcons.length]} />
            ))}
          </SimpleGrid>
        </Box>
      </VStack>
    </Container>
  </Box>
);

const ArticleCard = ({ article, icon }: { article: ArticleContent; icon: IconType }) => (
  <Link
    href={article.meta.canonicalPath}
    color="inherit"
    display="block"
    textDecoration="none"
    _hover={{ textDecoration: "none" }}
  >
    <Flex
      direction="column"
      h="full"
      minH="250px"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      overflow="hidden"
      transition="border-color 0.2s ease, box-shadow 0.2s ease"
      _hover={{ borderColor: "teal.300", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.08)" }}
    >
      <ArticleThumbnail article={article} icon={icon} />
      <Flex direction="column" flex="1" p={5}>
        <Badge alignSelf="start" colorPalette="green" variant="subtle" borderRadius="full" px={2.5}>
          {article.meta.categoryLabel}
        </Badge>
        <Text mt={3} color="gray.950" fontSize="md" fontWeight="black" lineHeight="1.55" lineClamp={2}>
          {article.meta.title}
        </Text>
        <Flex align="center" gap={2} mt="auto" pt={4} color="teal.700" fontSize="sm" fontWeight="bold">
          詳しく見る
          <Icon as={LuArrowRight} boxSize={4} />
        </Flex>
      </Flex>
    </Flex>
  </Link>
);

const ArticleThumbnail = ({ article, icon }: { article: ArticleContent; icon: IconType }) => {
  if (article.meta.heroImage) {
    return (
      <Image
        src={article.meta.heroImage.src}
        alt={article.meta.heroImage.alt}
        h="112px"
        w="full"
        objectFit="cover"
        bg="teal.50"
      />
    );
  }

  return (
    <Flex align="center" justify="center" h="112px" bg="teal.50" color="teal.600">
      <Icon as={icon} boxSize={12} strokeWidth={1.7} />
    </Flex>
  );
};
