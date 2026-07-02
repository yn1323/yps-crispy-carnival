export type MarkdownImageAlign = "left" | "center" | "right";
export type MarkdownMediaAlign = "left" | "right";

export type MarkdownImage = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  align: MarkdownImageAlign;
};

export type MarkdownBlock =
  | {
      type: "heading";
      level: 2 | 3;
      text: string;
      id: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "unorderedList";
      items: string[];
    }
  | {
      type: "orderedList";
      items: string[];
    }
  | {
      type: "blockquote";
      text: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    }
  | {
      type: "image";
      image: MarkdownImage;
    }
  | {
      type: "media";
      align: MarkdownMediaAlign;
      image: MarkdownImage;
      text: string;
    }
  | {
      type: "horizontalRule";
    };

export type MarkdownParseOptions = {
  resolveImageSrc?: (src: string) => string;
};

export function parseMarkdownDocument(
  source: string,
  slug: string,
): { frontmatter: Record<string, string>; bodySource: string } {
  const normalizedSource = source.replace(/\r\n/g, "\n").trim();
  const frontmatterMatch = normalizedSource.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error(`文書 "${slug}" の frontmatter が見つかりません`);
  }

  const [, frontmatterSource, bodySource] = frontmatterMatch;
  return {
    frontmatter: parseFrontmatter(frontmatterSource),
    bodySource: bodySource ?? "",
  };
}

function parseFrontmatter(source: string): Record<string, string> {
  return source.split("\n").reduce<Record<string, string>>((acc, line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    acc[key] = stripQuotes(value);
    return acc;
  }, {});
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[,、]/)
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseBoundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = parsePositiveInteger(value, fallback);
  return Math.min(Math.max(parsed, min), max);
}

export function parseMarkdownBlocks(source: string, options: MarkdownParseOptions = {}): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? "";

    if (!line.trim() || /^#\s+/.test(line)) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length === 2 ? 2 : 3;
      const text = headingMatch[2].trim();
      blocks.push({ type: "heading", level, text, id: toHeadingId(text) });
      index += 1;
      continue;
    }

    const media = parseMediaBlock(lines, index, options);
    if (media) {
      blocks.push(media.block);
      index = media.nextIndex;
      continue;
    }
    if (/^:::\s+media(?:\s+.*)?$/.test(line.trim())) {
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\|.+\|$/.test((lines[index] ?? "").trim())) {
        tableLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      blocks.push(parseTable(tableLines));
      continue;
    }

    const image = parseImageLine(line, options);
    if (image) {
      blocks.push({ type: "image", image });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, "").trim());
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trimEnd())) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "unorderedList", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trimEnd())) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "orderedList", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const currentLine = lines[index]?.trimEnd() ?? "";
      if (
        !currentLine.trim() ||
        /^#{1,3}\s+/.test(currentLine) ||
        /^:::\s+media(?:\s+.*)?$/.test(currentLine.trim()) ||
        isTableStart(lines, index) ||
        parseImageLine(currentLine, options) ||
        /^(-{3,}|\*{3,})$/.test(currentLine.trim()) ||
        /^>\s?/.test(currentLine) ||
        /^[-*]\s+/.test(currentLine) ||
        /^\d+\.\s+/.test(currentLine)
      ) {
        break;
      }
      paragraphLines.push(currentLine.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function parseMediaBlock(
  lines: string[],
  startIndex: number,
  options: MarkdownParseOptions,
): { block: Extract<MarkdownBlock, { type: "media" }>; nextIndex: number } | undefined {
  const openingMatch = (lines[startIndex] ?? "").trim().match(/^:::\s+media(?:\s+(.+))?$/);
  if (!openingMatch) {
    return undefined;
  }

  const mediaAttributes = parseAttributeString(openingMatch[1] ?? "");
  const imageLines: MarkdownImage[] = [];
  const textLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^:::\s*$/.test((lines[index] ?? "").trim())) {
    const currentLine = lines[index]?.trimEnd() ?? "";
    const image = parseImageLine(currentLine, options);

    if (image) {
      imageLines.push(image);
    } else if (currentLine.trim()) {
      textLines.push(currentLine.trim());
    }

    index += 1;
  }

  const image = imageLines[0];
  if (!image) {
    return undefined;
  }

  const align = parseMediaAlign(mediaAttributes.align, image.align === "left" ? "left" : "right");
  return {
    block: {
      type: "media",
      align,
      image: {
        ...image,
        width: parsePositiveInteger(mediaAttributes.width, image.width ?? 0) || image.width,
        align,
      },
      text: textLines.join("\n"),
    },
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseImageLine(line: string, options: MarkdownParseOptions): MarkdownImage | undefined {
  const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)(?:\{([^}]*)\})?$/);
  if (!imageMatch) {
    return undefined;
  }

  const [, alt, src, caption, attributeSource] = imageMatch;
  const attributes = parseAttributeString(attributeSource ?? "");
  return {
    src: options.resolveImageSrc ? options.resolveImageSrc(src) : src,
    alt: alt.trim(),
    caption: caption?.trim(),
    width: parsePositiveInteger(attributes.width, 0) || undefined,
    align: parseImageAlign(attributes.align, "center"),
  };
}

function parseAttributeString(source: string): Record<string, string> {
  return source.split(/\s+/).reduce<Record<string, string>>((acc, token) => {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1).trim();
    if (key && value) {
      acc[key] = stripQuotes(value);
    }
    return acc;
  }, {});
}

function parseImageAlign(value: string | undefined, fallback: MarkdownImageAlign): MarkdownImageAlign {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  return fallback;
}

function parseMediaAlign(value: string | undefined, fallback: MarkdownMediaAlign): MarkdownMediaAlign {
  if (value === "left" || value === "right") {
    return value;
  }
  return fallback;
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  return /^\|.+\|$/.test(current) && /^\|[\s:\-|]+\|$/.test(next);
}

function parseTable(lines: string[]): Extract<MarkdownBlock, { type: "table" }> {
  const [headerLine, , ...rowLines] = lines;

  return {
    type: "table",
    headers: splitTableRow(headerLine ?? ""),
    rows: rowLines.map(splitTableRow),
  };
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function toHeadingId(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

  return normalized || "section";
}
