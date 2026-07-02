import {
  Accordion,
  Badge,
  Box,
  Container,
  Flex,
  Heading,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuBookOpen, LuFileSpreadsheet, LuMessageCircle, LuMonitorCheck } from "react-icons/lu";
import type { ArticleContent } from "@/src/components/features/ArticleSite/articleContent";
import { articles } from "@/src/components/features/ArticleSite/articleContent";

const faqs = [
  {
    q: "LINEでシフト提出はできますか？",
    a: "できます。スタッフには提出リンクを送り、LINEまたはメールから希望を提出してもらえます。",
  },
  {
    q: "無料で使えるシフト管理ツールですか？",
    a: "無料プランから始められます。人数や店舗数に応じて有料プランへ広げられます。",
  },
  {
    q: "スタッフはアプリ登録が必要ですか？",
    a: "不要です。届いたリンクを開き、スマホから希望シフトを提出できます。",
  },
  {
    q: "LINEを使わないスタッフがいても利用できますか？",
    a: "利用できます。LINE未連携のスタッフにはメールで通知できます。",
  },
  {
    q: "スマホでもシフト作成できますか？",
    a: "スマホでも確認・作成できます。細かな調整はPCでも行えます。",
  },
  {
    q: "未提出者への自動リマインドはできますか？",
    a: "できます。未提出者に自動でリマインドを送り、催促漏れを減らします。",
  },
  {
    q: "AIでシフトを自動作成できますか？",
    a: "有料オプションで、集まった希望シフトからAIがたたき台を自動作成できます。仕上げは画面上で調整する方式です。",
  },
  {
    q: "複数店舗のシフト管理はできますか？",
    a: "できます。店舗管理プランで複数店舗のシフトをまとめて管理でき、店舗ごとにマネージャーを分けられます。",
  },
  {
    q: "Excelや紙のシフト管理から移行できますか？",
    a: "できます。希望シフトの回収から確定の連絡までをシフトリに移すと、Excelへの転記や個別連絡が減ります。",
  },
];

const articleIcons = [LuMessageCircle, LuMonitorCheck, LuFileSpreadsheet, LuBookOpen];
const previewArticles = articles.slice(0, 4);

export const FaqArticlesSection = () => (
  <Box as="section" bg="#fbfefe" py={16}>
    <Container maxW="7xl">
      <VStack align="stretch" gap={12}>
        <Box id="faq">
          <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
            よくある質問
          </Heading>
          <Accordion.Root collapsible multiple variant="plain" mt={5}>
            <VStack align="stretch" gap={2.5}>
              {faqs.map((faq) => (
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

        <Box id="articles">
          <Flex align="end" justify="space-between" gap={5} mb={5}>
            <Box>
              <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
                お役立ち記事
              </Heading>
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
