export type ParsedFlexMessage =
  | {
      status: "ok";
      altText: string;
      contents: ParsedFlexBubble;
    }
  | {
      status: "invalid";
      reason: string;
    };

export type ParsedFlexBubble = {
  type: "bubble";
  size?: string;
  header?: ParsedFlexBox;
  body?: ParsedFlexBox;
  footer?: ParsedFlexBox;
};

export type ParsedFlexBox = {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: ParsedFlexComponent[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
};

export type ParsedFlexText = {
  type: "text";
  text: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  margin?: string;
  align?: string;
  flex?: number;
};

export type ParsedFlexSeparator = {
  type: "separator";
  margin?: string;
  color?: string;
};

export type ParsedFlexButton = {
  type: "button";
  style?: string;
  color?: string;
  height?: string;
  margin?: string;
  action: {
    type: "uri";
    label: string;
    uri: string;
  };
};

export type ParsedFlexUnsupported = {
  type: "unsupported";
  componentType: string;
};

export type ParsedFlexComponent =
  | ParsedFlexBox
  | ParsedFlexText
  | ParsedFlexSeparator
  | ParsedFlexButton
  | ParsedFlexUnsupported;

type UnknownRecord = Record<string, unknown>;

export function parseFlexMessage(input: unknown): ParsedFlexMessage {
  const value = parseJsonIfNeeded(input);
  if (!value.ok) return { status: "invalid", reason: value.reason };
  if (!isRecord(value.data)) return { status: "invalid", reason: "Flex Message JSON must be an object." };

  const message = value.data;
  if (message.type !== "flex") return { status: "invalid", reason: "Flex Message type must be flex." };
  if (typeof message.altText !== "string") return { status: "invalid", reason: "Flex Message altText is missing." };

  const contents = parseBubble(message.contents);
  if (!contents) return { status: "invalid", reason: "Flex Message contents must be a bubble." };
  return { status: "ok", altText: message.altText, contents };
}

function parseJsonIfNeeded(input: unknown): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (typeof input !== "string") return { ok: true, data: input };
  try {
    return { ok: true, data: JSON.parse(input) };
  } catch {
    return { ok: false, reason: "JSON parse failed." };
  }
}

function parseBubble(value: unknown): ParsedFlexBubble | null {
  if (!isRecord(value) || value.type !== "bubble") return null;
  const header = parseBox(value.header);
  const body = parseBox(value.body);
  const footer = parseBox(value.footer);
  return {
    type: "bubble",
    ...(typeof value.size === "string" ? { size: value.size } : {}),
    ...(header ? { header } : {}),
    ...(body ? { body } : {}),
    ...(footer ? { footer } : {}),
  };
}

function parseComponent(value: unknown): ParsedFlexComponent {
  if (!isRecord(value)) return { type: "unsupported", componentType: "unknown" };

  switch (value.type) {
    case "box":
      return parseBox(value) ?? { type: "unsupported", componentType: "box" };
    case "text":
      return parseText(value) ?? { type: "unsupported", componentType: "text" };
    case "separator":
      return parseSeparator(value);
    case "button":
      return parseButton(value) ?? { type: "unsupported", componentType: "button" };
    default:
      return { type: "unsupported", componentType: typeof value.type === "string" ? value.type : "unknown" };
  }
}

function parseBox(value: unknown): ParsedFlexBox | null {
  if (!isRecord(value) || value.type !== "box" || !isLayout(value.layout) || !Array.isArray(value.contents)) {
    return null;
  }
  return {
    type: "box",
    layout: value.layout,
    contents: value.contents.map(parseComponent),
    ...pickStringProps(value, [
      "spacing",
      "margin",
      "paddingAll",
      "paddingTop",
      "paddingBottom",
      "paddingStart",
      "paddingEnd",
      "backgroundColor",
      "borderColor",
      "borderWidth",
      "cornerRadius",
    ]),
  };
}

function parseText(value: UnknownRecord): ParsedFlexText | null {
  if (typeof value.text !== "string") return null;
  return {
    type: "text",
    text: value.text,
    ...pickStringProps(value, ["size", "weight", "color", "margin", "align"]),
    ...(typeof value.wrap === "boolean" ? { wrap: value.wrap } : {}),
    ...(typeof value.flex === "number" ? { flex: value.flex } : {}),
  };
}

function parseSeparator(value: UnknownRecord): ParsedFlexSeparator {
  return {
    type: "separator",
    ...pickStringProps(value, ["margin", "color"]),
  };
}

function parseButton(value: UnknownRecord): ParsedFlexButton | null {
  if (!isRecord(value.action)) return null;
  const action = value.action;
  if (action.type !== "uri" || typeof action.label !== "string" || typeof action.uri !== "string") return null;
  return {
    type: "button",
    action: { type: "uri", label: action.label, uri: action.uri },
    ...pickStringProps(value, ["style", "color", "height", "margin"]),
  };
}

function pickStringProps<T extends string>(value: UnknownRecord, keys: T[]): Partial<Record<T, string>> {
  const result: Partial<Record<T, string>> = {};
  for (const key of keys) {
    if (typeof value[key] === "string") result[key] = value[key];
  }
  return result;
}

function isLayout(value: unknown): value is ParsedFlexBox["layout"] {
  return value === "vertical" || value === "horizontal" || value === "baseline";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
