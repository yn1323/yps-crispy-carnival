import { Box, Grid, Heading, Image, Link, List, Separator, Table, Text } from "@chakra-ui/react";
import { Children, type ComponentProps, isValidElement, type ReactNode } from "react";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { type MdxComponents, toHeadingId } from "@/src/lib/mdx";

type ResolveImageSrc = (src: string) => string;

export type ArticleImageAlign = "left" | "center" | "right";

type ArticleImageValue = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  align: ArticleImageAlign;
};

/**
 * 記事本文MDXのタグマッピングを、記事ごとの画像パスリゾルバ付きで生成する。
 * 標準Markdownに加えて、MDX内で使える記事用コンポーネントを提供する:
 * - `<ArticleImage src alt caption? width? align? />`: サイズ・配置指定つき画像
 * - `<Media image alt caption? align? width?>本文</Media>`: 画像と短い文章の横並びブロック
 */
export function createArticleMdxComponents(resolveImageSrc: ResolveImageSrc): MdxComponents {
  const Img = ({ src, alt, title }: ComponentProps<"img">) => (
    <ArticleImageFigure image={{ src: resolveImageSrc(src ?? ""), alt: alt ?? "", caption: title, align: "center" }} />
  );

  type ArticleImageProps = {
    src: string;
    alt: string;
    caption?: string;
    width?: number;
    align?: ArticleImageAlign;
  };

  const ArticleImage = ({ src, alt, caption, width, align = "center" }: ArticleImageProps) => (
    <ArticleImageFigure image={{ src: resolveImageSrc(src), alt, caption, width, align }} />
  );

  type MediaProps = {
    image: string;
    alt: string;
    caption?: string;
    align?: "left" | "right";
    width?: number;
    children: ReactNode;
  };

  const Media = ({ image, alt, caption, align = "right", width, children }: MediaProps) => (
    <Grid
      templateColumns={{
        base: "1fr",
        md: width ? (align === "right" ? `minmax(0, 1fr) ${width}px` : `${width}px minmax(0, 1fr)`) : "1fr 1fr",
      }}
      gap={{ base: 4, md: 6 }}
      alignItems="start"
    >
      <Box order={align === "right" ? 1 : 2}>{children}</Box>
      <Box order={align === "right" ? 2 : 1} minW={0}>
        <ArticleImageFigure image={{ src: resolveImageSrc(image), alt, caption, width, align: "center" }} compact />
      </Box>
    </Grid>
  );

  return {
    // 記事タイトルはfrontmatterの`title`で描画するため、本文中のH1は表示しない
    h1: () => null,
    h2: ({ children }: ComponentProps<"h2">) => <ArticleHeading level={2}>{children}</ArticleHeading>,
    h3: ({ children }: ComponentProps<"h3">) => <ArticleHeading level={3}>{children}</ArticleHeading>,
    p: ({ children }: ComponentProps<"p">) => {
      // 段落が画像1つだけの場合はfigureをそのまま出す（<p>内にブロックを入れない）
      const items = Children.toArray(children);
      if (items.length === 1 && isValidElement(items[0]) && items[0].type === Img) {
        return <>{children}</>;
      }
      return <ArticleText>{children}</ArticleText>;
    },
    ul: (props: ComponentProps<"ul">) => (
      <List.Root as="ul" gap={3} ps={6} color="gray.700" textStyle="body" {...props} />
    ),
    ol: (props: ComponentProps<"ol">) => (
      <List.Root as="ol" gap={3} ps={6} color="gray.700" textStyle="body" {...props} />
    ),
    li: (props: ComponentProps<"li">) => <List.Item lineHeight="1.8" {...props} />,
    blockquote: ({ children }: ComponentProps<"blockquote">) => (
      <Box
        as="blockquote"
        borderLeftWidth="4px"
        borderColor="teal.500"
        bg="gray.50"
        px={{ base: 4, lg: 5 }}
        py={4}
        borderRadius="md"
        css={{ "& p": { color: "colors.gray.800", fontWeight: "medium", whiteSpace: "pre-line" } }}
      >
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
    th: (props: ComponentProps<"th">) => (
      <Table.ColumnHeader bg="green.50" color="gray.800" fontWeight="bold" {...props} />
    ),
    td: (props: ComponentProps<"td">) => <Table.Cell color="gray.700" lineHeight="1.7" {...props} />,
    hr: () => <Separator />,
    a: (props: ComponentProps<"a">) => (
      <Link color="teal.700" fontWeight="bold" textDecoration="underline" textUnderlineOffset="3px" {...props} />
    ),
    strong: (props: ComponentProps<"strong">) => <Box as="strong" color="gray.950" fontWeight="bold" {...props} />,
    code: (props: ComponentProps<"code">) => (
      <Box as="code" bg="gray.100" color="gray.800" px={1.5} py={0.5} borderRadius="sm" fontSize="0.9em" {...props} />
    ),
    img: Img,
    ArticleImage,
    Media,
  } satisfies MdxComponents;
}

function ArticleHeading({ level, children }: { level: 2 | 3; children: ReactNode }): ReactNode {
  return (
    <Heading
      id={toHeadingId(reactNodeToText(children))}
      as={level === 2 ? "h2" : "h3"}
      color="gray.950"
      textStyle={level === 2 ? "sectionTitle" : { base: "lg", md: "xl" }}
      letterSpacing="0"
      mt={level === 2 ? { base: 8, md: 12 } : { base: 4, md: 6 }}
      textWrap="pretty"
      scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}
    >
      {children}
    </Heading>
  );
}

/** 目次アンカー用に、見出しのReactNodeからテキストだけを取り出す */
function reactNodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeToText).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return reactNodeToText(node.props.children);
  }
  return "";
}

export function ArticleText({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text color="gray.700" textStyle="body" lineHeight="1.8">
      {children}
    </Text>
  );
}

export function ArticleImageFigure({
  image,
  compact = false,
}: {
  image: ArticleImageValue;
  compact?: boolean;
}): ReactNode {
  return (
    <Box
      as="figure"
      my={compact ? 0 : { base: 1, lg: 2 }}
      display="flex"
      flexDirection="column"
      alignItems={{ base: "stretch", md: getFigureAlignItems(image.align) }}
    >
      <Box
        overflow="hidden"
        w={{ base: "full", md: image.width ? `${image.width}px` : "full" }}
        maxW="full"
        borderRadius="lg"
        bg="transparent"
      >
        <Image src={image.src} alt={image.alt} w="full" maxH={{ base: "320px", lg: "440px" }} objectFit="contain" />
      </Box>
      {image.caption && (
        <Text
          as="figcaption"
          w={{ base: "full", md: image.width ? `${image.width}px` : "full" }}
          maxW="full"
          mt={2}
          color="gray.500"
          textStyle="sm"
          lineHeight="1.7"
          textAlign="center"
        >
          {image.caption}
        </Text>
      )}
    </Box>
  );
}

function getFigureAlignItems(align: ArticleImageAlign): "flex-start" | "center" | "flex-end" {
  switch (align) {
    case "left":
      return "flex-start";
    case "right":
      return "flex-end";
    case "center":
      return "center";
  }
}
