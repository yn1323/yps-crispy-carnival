import { Box, Heading, Image, Link, List, Table, Text } from "@chakra-ui/react";
import { Children, type ComponentProps, isValidElement, type ReactNode } from "react";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { type MdxComponents, toHeadingId } from "@/src/lib/mdx";

type ResolveImageSrc = (src: string) => string;

export function createHelpMdxComponents(resolveImageSrc: ResolveImageSrc = (src) => src): MdxComponents {
  const Img = ({ src, alt, title }: ComponentProps<"img">) => (
    <HelpFigureView src={resolveImageSrc(src ?? "")} alt={alt ?? ""} caption={title} />
  );

  const HelpFigure = ({
    src,
    alt,
    caption,
    width,
    height,
  }: {
    src: string;
    alt: string;
    caption?: string;
    width?: number;
    height?: number;
  }) => <HelpFigureView src={resolveImageSrc(src)} alt={alt} caption={caption} width={width} height={height} />;

  return {
    h1: () => null,
    h2: ({ children }: ComponentProps<"h2">) => <HelpHeading level={2}>{children}</HelpHeading>,
    h3: ({ children }: ComponentProps<"h3">) => <HelpHeading level={3}>{children}</HelpHeading>,
    p: ({ children }: ComponentProps<"p">) => {
      const items = Children.toArray(children);
      if (items.length === 1 && isValidElement(items[0]) && items[0].type === Img) {
        return <>{children}</>;
      }
      return (
        <Text as="p" color="gray.800" lineHeight="1.9">
          {children}
        </Text>
      );
    },
    ul: (props: ComponentProps<"ul">) => <List.Root as="ul" gap={2} ps={5} color="gray.800" {...props} />,
    ol: (props: ComponentProps<"ol">) => <List.Root as="ol" gap={2} ps={5} color="gray.800" {...props} />,
    li: (props: ComponentProps<"li">) => <List.Item lineHeight="1.8" {...props} />,
    blockquote: ({ children }: ComponentProps<"blockquote">) => (
      <Box as="blockquote" borderLeftWidth="3px" borderColor="teal.500" bg="teal.50/60" px={4} py={3}>
        {children}
      </Box>
    ),
    table: (props: ComponentProps<"table">) => (
      <Box overflowX="auto" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
        <Table.Root size="sm" {...props} />
      </Box>
    ),
    thead: (props: ComponentProps<"thead">) => <Table.Header {...props} />,
    tbody: (props: ComponentProps<"tbody">) => <Table.Body {...props} />,
    tr: (props: ComponentProps<"tr">) => <Table.Row {...props} />,
    th: (props: ComponentProps<"th">) => <Table.ColumnHeader bg="gray.50" color="gray.900" {...props} />,
    td: (props: ComponentProps<"td">) => <Table.Cell color="gray.800" lineHeight="1.7" {...props} />,
    a: (props: ComponentProps<"a">) => (
      <Link color="teal.700" fontWeight="semibold" textDecoration="underline" textUnderlineOffset="3px" {...props} />
    ),
    strong: (props: ComponentProps<"strong">) => <Box as="strong" color="gray.950" fontWeight="bold" {...props} />,
    img: Img,
    HelpFigure,
  } satisfies MdxComponents;
}

function HelpHeading({ level, children }: { level: 2 | 3; children: ReactNode }) {
  return (
    <Heading
      id={toHeadingId(reactNodeToText(children))}
      as={level === 2 ? "h2" : "h3"}
      color="gray.950"
      fontSize={level === 2 ? { base: "xl", md: "2xl" } : { base: "lg", md: "xl" }}
      lineHeight="1.5"
      letterSpacing="0"
      mt={level === 2 ? { base: 8, md: 10 } : { base: 5, md: 6 }}
      scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}
    >
      {children}
    </Heading>
  );
}

function HelpFigureView({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  if (!src.trim()) throw new Error("ヘルプ画像にはsrcを指定してください");
  if (!alt.trim()) throw new Error("ヘルプ画像には内容を説明するaltを指定してください");

  return (
    <Box as="figure" my={2}>
      <Box
        overflow="hidden"
        w={{ base: "full", md: width ? `${width}px` : "full" }}
        maxW="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="gray.50"
        aspectRatio={width && height ? width / height : undefined}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          w="full"
          h="full"
          objectFit="contain"
        />
      </Box>
      {caption && (
        <Text as="figcaption" mt={2} color="gray.600" fontSize="sm" lineHeight="1.7">
          {caption}
        </Text>
      )}
    </Box>
  );
}

function reactNodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return reactNodeToText(node.props.children);
  return "";
}
