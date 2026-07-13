import { Box, Flex, Heading, Image, Stack, Text } from "@chakra-ui/react";
import type { ComponentProps } from "react";
import { LuArrowRight } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import registerStartImage from "./register-start.webp";

type Props = {
  onSetupClick: () => void;
};

export const WelcomeHero = ({ onSetupClick }: Props) => (
  <Box
    bg="white"
    borderRadius="xl"
    borderWidth="1px"
    borderColor="teal.100"
    px={{ base: 5, lg: 7 }}
    py={{ base: 5, lg: 6 }}
  >
    <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={{ base: 4, md: 8 }}>
      <Stack gap={4} flex={1} minW={0} maxW={{ md: "520px" }}>
        <Stack gap={1.5}>
          <Heading as="h1" textStyle="sectionTitle" color="gray.900" letterSpacing="-0.01em">
            お店の情報を登録しましょう
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            お店の名前とシフト希望の集め方を決めるだけで始められます。
          </Text>
        </Stack>
        <WelcomeHeroImage display={{ base: "flex", md: "none" }} />
        <Flex justify={{ base: "flex-end", md: "flex-start" }}>
          <Button colorPalette="teal" size="md" onClick={onSetupClick} gap={1.5}>
            お店を登録する
            <LuArrowRight />
          </Button>
        </Flex>
      </Stack>
      <WelcomeHeroImage display={{ base: "none", md: "flex" }} flex={1} justify="flex-end" />
    </Flex>
  </Box>
);

const WelcomeHeroImage = (props: ComponentProps<typeof Flex>) => (
  <Flex align="center" justify="center" {...props}>
    <Image
      src={registerStartImage}
      alt="お店登録の開始画面イメージ"
      w="full"
      maxW={{ base: "196px", md: "294px", lg: "336px" }}
      h="auto"
      objectFit="contain"
      loading="lazy"
    />
  </Flex>
);
