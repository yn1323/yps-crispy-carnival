import { Box, Flex, Text } from "@chakra-ui/react";
import {
  type ParsedFlexBox,
  type ParsedFlexBubble,
  type ParsedFlexButton,
  type ParsedFlexComponent,
  type ParsedFlexSeparator,
  type ParsedFlexText,
  type ParsedFlexUnsupported,
  parseFlexMessage,
} from "./parse";

type FlexMessagePreviewProps = {
  message: unknown;
};

export const FlexMessagePreview = ({ message }: FlexMessagePreviewProps) => {
  const parsed = parseFlexMessage(message);

  return (
    <Flex bg="#DDEFE5" minH="100%" p={5} align="flex-start">
      {parsed.status === "ok" ? (
        <Flex direction="column" gap={2} width="360px" maxW="100%">
          <BubbleView bubble={parsed.contents} />
          <Text fontSize="xs" color="gray.700" lineHeight="short" wordBreak="break-word">
            altText: {parsed.altText}
          </Text>
        </Flex>
      ) : (
        <Box width="360px" maxW="100%" bg="white" borderRadius="md" border="1px solid" borderColor="red.200" p={4}>
          <Text fontSize="sm" fontWeight="bold" color="red.700">
            Flex Messageを表示できません
          </Text>
          <Text mt={2} fontSize="xs" color="red.700">
            {parsed.reason}
          </Text>
        </Box>
      )}
    </Flex>
  );
};

const BubbleView = ({ bubble }: { bubble: ParsedFlexBubble }) => (
  <Box width="100%" bg="white" borderRadius="16px" overflow="hidden" boxShadow="0 1px 1px rgba(0,0,0,0.08)">
    {bubble.header ? <BoxView box={bubble.header} block="header" /> : null}
    {bubble.body ? <BoxView box={bubble.body} block="body" /> : null}
    {bubble.footer ? (
      <Box borderTop="1px solid" borderColor="gray.200">
        <BoxView box={bubble.footer} block="footer" />
      </Box>
    ) : null}
  </Box>
);

const BoxView = ({ box, block }: { box: ParsedFlexBox; block?: "header" | "body" | "footer" }) => {
  const isHorizontal = box.layout === "horizontal" || box.layout === "baseline";
  return (
    <Flex
      direction={isHorizontal ? "row" : "column"}
      align={box.layout === "baseline" ? "baseline" : isHorizontal ? "center" : "stretch"}
      gap={spacingToCss(box.spacing)}
      mt={spacingToCss(box.margin)}
      p={paddingForBox(box, block)}
      pt={box.paddingTop}
      pb={box.paddingBottom}
      ps={box.paddingStart}
      pe={box.paddingEnd}
      bg={box.backgroundColor}
      borderColor={box.borderColor}
      borderWidth={borderWidthToCss(box.borderWidth)}
      borderRadius={radiusToCss(box.cornerRadius)}
      minW={0}
    >
      {box.contents.map((component, index) => (
        <ComponentView key={`${component.type}-${index}`} component={component} />
      ))}
    </Flex>
  );
};

const ComponentView = ({ component }: { component: ParsedFlexComponent }) => {
  switch (component.type) {
    case "box":
      return <BoxView box={component} />;
    case "text":
      return <TextView text={component} />;
    case "separator":
      return <SeparatorView separator={component} />;
    case "button":
      return <ButtonView button={component} />;
    case "unsupported":
      return <UnsupportedView component={component} />;
  }
};

const TextView = ({ text }: { text: ParsedFlexText }) => (
  <Text
    mt={spacingToCss(text.margin)}
    fontSize={fontSizeToChakra(text.size)}
    fontWeight={text.weight === "bold" ? "bold" : "normal"}
    color={text.color}
    textAlign={text.align === "end" ? "right" : text.align === "center" ? "center" : "left"}
    whiteSpace={text.wrap === false ? "nowrap" : "pre-wrap"}
    wordBreak="break-word"
    lineHeight="1.6"
    flex={text.flex}
    minW={0}
  >
    {text.text}
  </Text>
);

const SeparatorView = ({ separator }: { separator: ParsedFlexSeparator }) => (
  <Box mt={spacingToCss(separator.margin)} borderTop="1px solid" borderColor={separator.color ?? "gray.200"} />
);

const ButtonView = ({ button }: { button: ParsedFlexButton }) => (
  <a
    href={button.action.uri}
    target="_blank"
    rel="noreferrer"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: button.height === "sm" ? "40px" : "44px",
      marginTop: spacingToCss(button.margin),
      paddingInline: "16px",
      borderRadius: "8px",
      background: button.color ?? "#319795",
      color: "white",
      fontSize: "14px",
      fontWeight: 700,
      textAlign: "center",
      textDecoration: "none",
      wordBreak: "break-word",
    }}
  >
    {button.action.label}
  </a>
);

const UnsupportedView = ({ component }: { component: ParsedFlexUnsupported }) => (
  <Box border="1px dashed" borderColor="orange.300" bg="orange.50" borderRadius="md" px={3} py={2}>
    <Text fontSize="xs" fontWeight="bold" color="orange.800">
      未対応: {component.componentType}
    </Text>
  </Box>
);

function paddingForBox(box: ParsedFlexBox, block?: "header" | "body" | "footer") {
  if (box.paddingAll) return box.paddingAll;
  if (block === "footer") return "20px";
  return block ? "20px" : 0;
}

function spacingToCss(value: string | undefined) {
  switch (value) {
    case "none":
      return 0;
    case "xs":
      return "4px";
    case "sm":
      return "8px";
    case "md":
      return "12px";
    case "lg":
      return "16px";
    case "xl":
      return "20px";
    case "xxl":
      return "24px";
    default:
      return undefined;
  }
}

function fontSizeToChakra(size: string | undefined) {
  switch (size) {
    case "xxs":
    case "xs":
      return "xs";
    case "sm":
      return "sm";
    case "lg":
      return "lg";
    case "xl":
      return "xl";
    case "xxl":
      return "2xl";
    default:
      return "md";
  }
}

function borderWidthToCss(value: string | undefined) {
  if (!value || value === "none") return undefined;
  if (value.endsWith("px")) return value;
  return "1px";
}

function radiusToCss(value: string | undefined) {
  switch (value) {
    case "none":
      return 0;
    case "xs":
      return "2px";
    case "sm":
      return "4px";
    case "md":
      return "8px";
    case "lg":
      return "12px";
    case "xl":
      return "16px";
    case "xxl":
      return "20px";
    default:
      return value;
  }
}
