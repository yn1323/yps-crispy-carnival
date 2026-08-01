import { describe, expect, it } from "vitest";
import { parseFlexMessage } from "./parse";

describe("FlexMessagePreview parseFlexMessage", () => {
  it("対応subsetのbubble, box, text, separator, button, uri actionを解析する", () => {
    const parsed = parseFlexMessage({
      type: "flex",
      altText: "提出依頼",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "📩 提出依頼", weight: "bold", size: "lg" },
            { type: "separator", margin: "md" },
            {
              type: "button",
              style: "primary",
              action: {
                type: "uri",
                label: "提出はこちら",
                uri: "https://example.com/submit?openExternalBrowser=1",
              },
            },
          ],
        },
      },
    });

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.altText).toBe("提出依頼");
    expect(parsed.contents.body?.contents).toHaveLength(3);
    expect(parsed.contents.body?.contents[0]).toMatchObject({
      type: "text",
      text: "📩 提出依頼",
      weight: "bold",
    });
    expect(parsed.contents.body?.contents[2]).toMatchObject({
      type: "button",
      action: {
        type: "uri",
        label: "提出はこちら",
        uri: "https://example.com/submit?openExternalBrowser=1",
      },
    });
  });

  it("未対応componentはunsupportedとして残す", () => {
    const parsed = parseFlexMessage({
      type: "flex",
      altText: "画像つき",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "image", url: "https://example.com/image.png" }],
        },
      },
    });

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.contents.body?.contents[0]).toEqual({ type: "unsupported", componentType: "image" });
  });

  it("不正JSON文字列はinvalidにする", () => {
    const parsed = parseFlexMessage("{");

    expect(parsed).toEqual({ status: "invalid", reason: "JSON parse failed." });
  });
});
