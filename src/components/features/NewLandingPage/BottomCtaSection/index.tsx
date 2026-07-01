import { Box, Container, Flex, Grid, Heading, Icon, Image, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuChevronRight, LuMail, LuMessageCircle, LuMousePointerClick } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import makerImage from "../../LandingPage/side-maker.webp";
import userImage from "../../LandingPage/side-user.webp";

export const BottomCtaSection = () => (
  <Box as="section" bg="#eaf8f6" py={14} overflow="hidden">
    <Container maxW="7xl">
      <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 0.9fr) minmax(420px, 0.7fr)" }} gap={9} alignItems="center">
        <VStack align="start" gap={6}>
          <Heading as="h2" fontSize={{ base: "3xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
            シフトのやり取りを、
            <Box as="span" display="block" color="teal.700">
              LINEとメールでひとつに。
            </Box>
          </Heading>
          <Text color="gray.800" fontSize="md" lineHeight="1.9" fontWeight="semibold" maxW="620px">
            希望回収、未提出リマインド、確定共有まで。まずは無料で、毎月のシフト連絡をラクにしましょう。
          </Text>
          <Flex gap={4} flexWrap="wrap">
            <BottomButton href="/signup" label="無料で試してみる" primary />
            <BottomButton href="/demo/flow" label="登録不要でデモを見る" />
          </Flex>
        </VStack>

        <Box position="relative" minH="240px">
          <Flex position="absolute" insetInlineStart="0" bottom="0" align="end" gap={5}>
            <Image src={makerImage} alt="シフトを作る人のイメージ" w="150px" objectFit="contain" />
            <Image src={userImage} alt="シフトを提出する人のイメージ" w="150px" objectFit="contain" />
          </Flex>
          <Flex position="absolute" insetInlineEnd="0" top="26px" direction="column" gap={4}>
            <ChannelPill icon={LuMessageCircle} label="LINE" />
            <ChannelPill icon={LuMail} label="メール" />
          </Flex>
        </Box>
      </Grid>
    </Container>
  </Box>
);

const BottomButton = ({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) => (
  <Button
    asChild
    colorPalette="teal"
    variant={primary ? "solid" : "outline"}
    bg={primary ? undefined : "white"}
    h="52px"
    minW="220px"
    px={7}
    borderRadius="md"
    fontWeight="bold"
  >
    <a href={href}>
      {primary ? <Icon as={LuChevronRight} boxSize={5} /> : <Icon as={LuMousePointerClick} boxSize={5} />}
      {label}
    </a>
  </Button>
);

const ChannelPill = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex
    align="center"
    gap={3}
    bg="white"
    borderWidth="1px"
    borderColor="teal.100"
    borderRadius="full"
    px={5}
    py={3}
    boxShadow="0 12px 28px rgba(15, 23, 42, 0.08)"
  >
    <Icon as={icon} boxSize={5} color="teal.600" />
    <Text color="gray.950" fontSize="sm" fontWeight="black">
      {label}
    </Text>
  </Flex>
);
