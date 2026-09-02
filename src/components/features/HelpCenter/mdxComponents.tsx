import { Accordion, Box, chakra, Heading, Image, Link, List, Stack, Table, Text } from "@chakra-ui/react";
import { Children, type ComponentProps, isValidElement, type ReactNode } from "react";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { type MdxComponents, toHeadingId } from "@/src/lib/mdx";

type ResolveImageSrc = (src: string) => string;
type ResolveVideoSrc = (src: string) => string;

export function createHelpMdxComponents(
  resolveImageSrc: ResolveImageSrc = (src) => src,
  resolveVideoSrc: ResolveVideoSrc = (src) => src,
): MdxComponents {
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

  const HelpVideo = ({ src, title, width, height }: { src: string; title: string; width: number; height: number }) => (
    <HelpVideoView src={resolveVideoSrc(src)} title={title} width={width} height={height} />
  );

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
    HelpAccordion,
    HelpFigure,
    HelpVideo,
  } satisfies MdxComponents;
}

function HelpAccordion({ title, children }: { title: string; children: ReactNode }) {
  if (!title.trim()) throw new Error("ヘルプのアコーディオンにはtitleを指定してください");

  return (
    <Accordion.Root collapsible lazyMount variant="plain">
      <Accordion.Item
        value={title}
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="white"
        overflow="hidden"
      >
        <Heading as="h3" fontSize="inherit" fontWeight="normal">
          <Accordion.ItemTrigger
            alignItems="center"
            gap={3}
            px={{ base: 4, md: 5 }}
            py={3.5}
            cursor="pointer"
            textAlign="left"
            _hover={{ bg: "gray.50" }}
          >
            <Text as="span" flex="1" color="gray.950" fontWeight="bold" lineHeight="1.7">
              {title}
            </Text>
            <Accordion.ItemIndicator color="teal.700" flexShrink={0} />
          </Accordion.ItemTrigger>
        </Heading>
        <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
          <Accordion.ItemBody px={{ base: 4, md: 5 }} py={5}>
            <Stack gap={4}>{children}</Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function HelpVideoView({ src, title, width, height }: { src: string; title: string; width: number; height: number }) {
  if (!src.trim()) throw new Error("ヘルプ動画にはsrcを指定してください");
  if (!title.trim()) throw new Error("ヘルプ動画には内容を説明するtitleを指定してください");
  if (width <= 0 || height <= 0) throw new Error("ヘルプ動画には正のwidthとheightを指定してください");

  return (
    <Box as="figure" my={2}>
      <Box
        overflow="hidden"
        w="full"
        maxW={{ base: "360px", md: "380px" }}
        mx="auto"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="black"
        aspectRatio={width / height}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: 音声トラックのない操作動画のため、字幕は不要です。 */}
        <chakra.video
          src={src}
          htmlWidth={width}
          htmlHeight={height}
          controls
          playsInline
          preload="metadata"
          aria-label={`${title}の動画`}
          w="full"
          h="full"
          objectFit="contain"
          bg="black"
        >
          お使いのブラウザでは動画を再生できません。
        </chakra.video>
      </Box>
    </Box>
  );
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
    <Box
      as="figure"
      my={2}
      w={{ base: "full", md: width ? `${width}px` : "full" }}
      maxW="full"
      mx={width ? "auto" : undefined}
    >
      {caption && (
        <Text as="figcaption" mb={2} color="gray.600" fontSize="sm" lineHeight="1.7">
          {caption}
        </Text>
      )}
      <Box
        overflow="hidden"
        w="full"
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
    </Box>
  );
}

function reactNodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return reactNodeToText(node.props.children);
  return "";
}
