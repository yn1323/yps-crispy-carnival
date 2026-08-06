import { Badge, Box, Flex, Image, Link, List, Stack, Text } from "@chakra-ui/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { LuArrowRight, LuExternalLink, LuMail, LuMessageCircle } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { HelpMdxComponents } from "./helpContent";

function HelpNote({ children }: PropsWithChildren) {
  return (
    <Box borderLeftWidth="3px" borderColor="teal.500" bg="gray.50" px={4} py={3} borderRadius="sm">
      <Text color="gray.800" fontSize="sm" lineHeight="1.8">
        {children}
      </Text>
    </Box>
  );
}

function NotificationChannelExample() {
  const rows = [
    { status: "LINE連携済み", detail: "友だち追加中", channel: "LINE", palette: "green", icon: LuMessageCircle },
    {
      status: "LINEで受け取れません",
      detail: "友だち追加が解除されている可能性があります",
      channel: "メール",
      palette: "orange",
      icon: LuMail,
    },
    { status: "LINE未連携", detail: "LINEを連携していません", channel: "メール", palette: "gray", icon: LuMail },
  ] as const;

  return (
    <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50/70" px={{ base: 4, md: 5 }}>
      <Stack gap={0} divideY="1px" divideColor="gray.200">
        {rows.map((row) => {
          const ChannelIcon = row.icon;
          return (
            <Flex
              key={row.status}
              py={4}
              direction={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              justify="space-between"
              gap={3}
            >
              <Stack gap={1.5} align="flex-start">
                <Badge colorPalette={row.palette} variant="subtle" borderRadius="full" px={2.5}>
                  {row.status}
                </Badge>
                <Text color="gray.600" fontSize="xs">
                  {row.detail}
                </Text>
              </Stack>
              <Flex align="center" gap={2} color="gray.800" fontSize="sm" fontWeight="bold" flexShrink={0}>
                <LuArrowRight aria-hidden />
                <ChannelIcon aria-hidden />
                {row.channel}
              </Flex>
            </Flex>
          );
        })}
      </Stack>
    </Box>
  );
}

function ShiftBoardDemoLink() {
  return (
    <Button asChild size="sm" variant="outline" colorPalette="teal">
      <a
        href="/demo/shiftboard"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="デモで操作を確認する（別タブで開きます）"
      >
        デモで操作を確認する
        <LuExternalLink aria-hidden="true" focusable="false" />
      </a>
    </Button>
  );
}

export const helpMdxComponents = {
  p: (props: ComponentProps<"p">) => <Text as="p" color="gray.800" lineHeight="1.9" {...props} />,
  ul: (props: ComponentProps<"ul">) => <List.Root as="ul" gap={2} ps={5} color="gray.800" {...props} />,
  ol: (props: ComponentProps<"ol">) => <List.Root as="ol" gap={2} ps={5} color="gray.800" {...props} />,
  li: (props: ComponentProps<"li">) => <List.Item lineHeight="1.8" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <Link color="teal.700" fontWeight="semibold" textDecoration="underline" textUnderlineOffset="3px" {...props} />
  ),
  img: (props: ComponentProps<"img">) => <Image display="block" w="full" h="auto" borderRadius="md" {...props} />,
  strong: (props: ComponentProps<"strong">) => <Box as="strong" fontWeight="bold" color="gray.900" {...props} />,
  HelpNote,
  NotificationChannelExample,
  ShiftBoardDemoLink,
} satisfies HelpMdxComponents;
