import { Box, Flex, Link, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { WebMeasurementConsentDecision } from "./consentStorage";

type Props =
  | {
      mode: "prompt";
      onDeny: () => void;
      onGrant: () => void;
    }
  | {
      mode: "settled";
      decision: Exclude<WebMeasurementConsentDecision, "unknown">;
      onOpenSettings: () => void;
    };

export function WebMeasurementConsentView(props: Props) {
  if (props.mode === "settled") {
    return (
      <Button
        type="button"
        position="fixed"
        insetInlineStart={{ base: 3, md: 4 }}
        bottom={{ base: 3, md: 4 }}
        zIndex="toast"
        h="44px"
        px={4}
        bg="white"
        color="gray.800"
        borderWidth="1px"
        borderColor="gray.300"
        boxShadow="md"
        variant="outline"
        fontSize="sm"
        onClick={props.onOpenSettings}
        aria-label={`アクセス解析設定（現在は${props.decision === "granted" ? "許可" : "不許可"}）`}
      >
        アクセス解析設定
      </Button>
    );
  }

  return (
    <Box
      role="region"
      aria-label="アクセス解析の設定"
      position="fixed"
      insetInline={{ base: 3, md: 4 }}
      bottom={{ base: 3, md: 4 }}
      zIndex="toast"
      maxW="720px"
      mx="auto"
      bg="white"
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="xl"
      boxShadow="xl"
      px={{ base: 4, md: 5 }}
      py={{ base: 4, md: 5 }}
    >
      <Flex direction={{ base: "column", md: "row" }} align={{ md: "center" }} gap={{ base: 4, md: 6 }}>
        <Stack gap={1.5} flex={1}>
          <Text as="h2" color="gray.950" fontWeight="bold">
            アクセス解析について
          </Text>
          <Text color="gray.700" fontSize="sm" lineHeight="tall">
            公開ページの使いやすさと表示速度を改善するため、許可された場合だけアクセス解析を利用します。
            スタッフの提出画面や管理画面では読み込みません。
          </Text>
          <Link href="/privacy" color="teal.700" fontSize="sm" fontWeight="semibold" alignSelf="flex-start">
            プライバシーポリシーを確認する
          </Link>
        </Stack>
        <Flex gap={3} flexShrink={0} justify={{ base: "stretch", md: "flex-end" }}>
          <Button type="button" variant="outline" h="44px" flex={{ base: 1, md: "initial" }} onClick={props.onDeny}>
            許可しない
          </Button>
          <Button type="button" colorPalette="teal" h="44px" flex={{ base: 1, md: "initial" }} onClick={props.onGrant}>
            許可する
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
