import { Box, Flex, Grid, GridItem, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { IoCalendarOutline, IoPeopleOutline, IoSparkles } from "react-icons/io5";
import { LuArrowRight } from "react-icons/lu";
import { UserRegister } from "@/src/components/features/User/UserRegister";

export const WelcomePage = () => {
  const features = [
    { icon: IoCalendarOutline, text: "シフト作成が5分で完了" },
    { icon: IoPeopleOutline, text: "スタッフと即座に共有" },
    { icon: IoSparkles, text: "LINEの手間から解放" },
  ];

  return (
    <Box
      minH="100vh"
      bgGradient="to-br"
      gradientFrom="teal.50"
      gradientVia="white"
      gradientTo="teal.50"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p="4"
      position="relative"
    >
      {/* ログアウトリンク */}
      <Box position="absolute" top="4" right="4">
        <SignOutButton>
          <HStack
            as="button"
            gap="1"
            color="teal.600"
            fontSize="sm"
            cursor="pointer"
            _hover={{ color: "teal.700", textDecoration: "underline" }}
            transition="all 0.15s ease"
          >
            <Text>別のアカウントで始める</Text>
            <Icon as={LuArrowRight} boxSize="4" />
          </HStack>
        </SignOutButton>
      </Box>
      <Box w="full" maxW="6xl">
        <Grid templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} gap="8" alignItems="center">
          {/* Left side - Welcome message */}
          <GridItem>
            <VStack gap="6" textAlign={{ base: "center", lg: "left" }} align={{ base: "center", lg: "start" }}>
              <HStack
                display="inline-flex"
                gap="2"
                bg="teal.100"
                color="teal.700"
                px="4"
                py="2"
                borderRadius="full"
                fontSize="sm"
              >
                <Icon as={IoSparkles} boxSize="4" />
                <Text>シフト管理を、もっとシンプルに</Text>
              </HStack>

              <VStack gap="4" align={{ base: "center", lg: "start" }}>
                <Text fontSize={{ base: "3xl", md: "4xl", lg: "5xl" }} color="teal.900" lineHeight="1.2">
                  ようこそ！
                  <br />
                  始めましょう
                </Text>
                <Text color="gray.600">
                  アカウント作成まであと一歩です。
                  <br />
                  あなたの名前を教えてください。
                </Text>
              </VStack>

              <VStack gap="4" pt="4" display={{ base: "none", lg: "flex" }} align="start" w="full">
                {features.map((feature, index) => (
                  <Flex key={index} align="center" gap="3" color="gray.700">
                    <Flex
                      w="10"
                      h="10"
                      borderRadius="full"
                      bg="teal.100"
                      align="center"
                      justify="center"
                      flexShrink="0"
                    >
                      <Icon as={feature.icon} boxSize="5" color="teal.600" />
                    </Flex>
                    <Text>{feature.text}</Text>
                  </Flex>
                ))}
              </VStack>
            </VStack>
          </GridItem>

          {/* Right side - Form */}
          <GridItem>
            <UserRegister callbackRoutingPath="/mypage" />
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
};
