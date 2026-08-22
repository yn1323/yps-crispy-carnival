import { Flex, Link, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuCircleHelp } from "react-icons/lu";

export function HelpSupport() {
  return (
    <Stack
      mt={{ base: 12, lg: 16 }}
      pt={{ base: 8, lg: 10 }}
      borderTopWidth="1px"
      borderColor="gray.200"
      align={{ base: "stretch", md: "flex-end" }}
      gap={3}
    >
      <Stack gap={1} align={{ base: "flex-start", md: "flex-end" }} textAlign={{ md: "right" }}>
        <Flex align="center" gap={2} color="gray.950" fontWeight="bold" justify={{ md: "flex-end" }}>
          <LuCircleHelp aria-hidden />
          ヘルプで解決しない場合
        </Flex>
        <Text color="gray.600" fontSize="sm">
          画面名、行った操作、表示された文言を添えてご連絡ください。
        </Text>
      </Stack>
      <Link href="/contact" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={2}>
        お問い合わせ
        <LuArrowRight aria-hidden />
      </Link>
    </Stack>
  );
}
