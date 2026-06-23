import { Box, Grid, Heading, Image, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuBookOpen } from "react-icons/lu";
import heroPcImage from "@/src/components/features/LandingPage/hero-pc.webp";
import heroSpImage from "@/src/components/features/LandingPage/hero-sp.webp";
import { Button } from "@/src/components/ui/Button";

type ArticleConversionCtaProps = {
  compact?: boolean;
};

export function ArticleConversionCta({ compact = false }: ArticleConversionCtaProps): ReactNode {
  return (
    <Box
      as="section"
      position="relative"
      overflow="hidden"
      bgGradient="to-b"
      gradientFrom="#E6F7F5"
      gradientVia="#F3FBFA"
      gradientTo="white"
      px={{ base: 5, md: 7, lg: compact ? 7 : 8 }}
      py={{ base: 7, md: compact ? 7 : 8, lg: compact ? 7 : 9 }}
    >
      <Grid
        templateColumns={{
          base: "1fr",
          lg: compact ? "minmax(0, 1fr) 280px" : "minmax(0, 0.95fr) minmax(340px, 1.05fr)",
        }}
        gap={{ base: 7, md: 8, lg: compact ? 7 : 9 }}
        alignItems="center"
      >
        <VStack align={{ base: "center", lg: "start" }} gap={{ base: 5, md: 6 }} order={{ base: 0, lg: 0 }}>
          <Box display="flex" justifyContent="center" w="full">
            <Image
              src="/textlogo_black.webp"
              alt="シフトリ"
              h={{ base: "32px", md: "36px", lg: compact ? "34px" : "38px" }}
              maxW={{ base: "156px", md: "178px", lg: compact ? "168px" : "188px" }}
              objectFit="contain"
            />
          </Box>
          <VStack
            align={{ base: "center", lg: "stretch" }}
            gap={{ base: 3, md: 4 }}
            textAlign={{ base: "center", lg: "start" }}
          >
            <Heading as="h2" color="gray.950" textStyle="sectionTitle" letterSpacing="0">
              <Box as="span" color="teal.700">
                LINE
              </Box>
              で届けてそのまま提出
              <Box as="span" display="block">
                かんたんシフト管理
              </Box>
            </Heading>
            <Text color="gray.800" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="560px">
              スタッフはいつものスマホからシフト希望を提出
              <Box as="span" display="block">
                未提出確認・確定通知もまるごとおまかせ
              </Box>
            </Text>
          </VStack>
          <Box display={{ base: "block", lg: "none" }} w="full">
            <ArticleConversionVisual compact={compact} />
          </Box>
          <Box w="full" maxW={{ base: "full", sm: "280px" }} mx="auto">
            <Button
              asChild
              colorPalette="teal"
              borderRadius="full"
              h={{ base: "54px", md: "58px" }}
              px={{ base: 5, md: 6 }}
              fontWeight="bold"
              w="full"
            >
              <Link href="/">
                <LuBookOpen />
                詳しく見る
              </Link>
            </Button>
          </Box>
        </VStack>
        <Box display={{ base: "none", lg: "block" }}>
          <ArticleConversionVisual compact={compact} />
        </Box>
      </Grid>
    </Box>
  );
}

function ArticleConversionVisual({ compact }: { compact: boolean }): ReactNode {
  return (
    <Box
      position="relative"
      alignSelf="center"
      justifySelf="center"
      w="full"
      maxW={{ base: "320px", md: "460px", lg: compact ? "300px" : "470px" }}
      aspectRatio={{ base: "1.08", lg: compact ? "1.05" : "1.12" }}
      order={{ base: 1, lg: 1 }}
    >
      <Box
        display={{ base: "none", md: "block" }}
        position="absolute"
        top={{ md: 0, lg: "-4px" }}
        right={{ md: 2, lg: 0 }}
        color="teal.700"
        fontSize={{ md: "sm", lg: "md" }}
        fontWeight="bold"
        lineHeight="1.8"
        textAlign="center"
        transform="rotate(-2deg)"
      >
        LINEでカンタン
        <Box as="span" display="block">
          シフト作成！
        </Box>
      </Box>
      <Box
        position="absolute"
        insetStart="0"
        insetEnd={{ base: "7%", md: "8%" }}
        insetBlockStart={{ base: "8%", md: "18%" }}
      >
        <Image src={heroPcImage} alt="シフトリのPCシフト作成画面イメージ" w="full" h="auto" objectFit="contain" />
      </Box>
      <Box position="absolute" insetEnd="0" insetBlockEnd="0" w={{ base: "34%", md: "35%" }}>
        <Image src={heroSpImage} alt="シフトリのスマホ通知イメージ" w="full" h="auto" objectFit="contain" />
      </Box>
    </Box>
  );
}
