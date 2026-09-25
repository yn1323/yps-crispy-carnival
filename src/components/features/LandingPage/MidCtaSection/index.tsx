import { Box, Container, Heading, Stack, VStack } from "@chakra-ui/react";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { SignupButton } from "../SignupButton";

/** 毎月の流れを読み終えたところに置く登録導線。末尾の登録sectionと同じ面にし、ボタンだけが浮かないようにする。 */
export const MidCtaSection = () => (
  <Box as="section" bg="#eaf8f6" py={{ base: 10, md: 12 }}>
    <Container maxW="5xl">
      <Stack
        direction={{ base: "column", md: "row" }}
        align="center"
        justify="space-between"
        gap={{ base: 5, md: 10 }}
        textAlign={{ base: "center", md: "start" }}
      >
        <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.5" letterSpacing="0">
          スタッフへの連絡は
          <Box as="span" display="block" color="teal.700">
            シフトリに任せよう
          </Box>
        </Heading>
        <VStack align={{ base: "stretch", md: "flex-start" }} gap={3} w={{ base: "full", md: "auto" }}>
          <SignupButton measurementCtaId="flow_signup" />
          <TrialReassurance />
        </VStack>
      </Stack>
    </Container>
  </Box>
);
