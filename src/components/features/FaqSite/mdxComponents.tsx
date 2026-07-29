import { Box, Link, List, Text } from "@chakra-ui/react";
import type { ComponentProps } from "react";
import type { MdxComponents } from "@/src/lib/mdx";
import { FaqVisual } from "./FaqVisual";

export const faqMdxComponents = {
  p: (props: ComponentProps<"p">) => <Text as="p" color="gray.800" lineHeight="1.9" {...props} />,
  ul: (props: ComponentProps<"ul">) => <List.Root as="ul" gap={0} ps={5} color="gray.800" {...props} />,
  ol: (props: ComponentProps<"ol">) => <List.Root as="ol" gap={0} ps={5} color="gray.800" {...props} />,
  li: (props: ComponentProps<"li">) => <List.Item lineHeight="1.9" _marker={{ color: "teal.600" }} {...props} />,
  a: (props: ComponentProps<"a">) => (
    <Link color="teal.700" fontWeight="semibold" textDecoration="underline" textUnderlineOffset="3px" {...props} />
  ),
  strong: (props: ComponentProps<"strong">) => <Box as="strong" color="gray.900" fontWeight="bold" {...props} />,
  FaqVisual,
} satisfies MdxComponents;
