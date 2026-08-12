import { describe, expect, it } from "vitest";
import { assertNoBakedMeasurementScripts } from "./validateStaticBuild";

describe("static build measurement boundary", () => {
  it.each(["/", "_shell.html", "404.html"])("%sにthird-party計測scriptを直書きしない", (label) => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        label,
        '<!doctype html><html><head><script type="module" src="/assets/app.js"></script></head></html>',
      ),
    ).not.toThrow();
  });

  it.each([
    "https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234",
    "https://www.google-analytics.com/g/collect",
    "https://www.clarity.ms/tag/test",
  ])("baked measurement script %sを拒否する", (scriptUrl) => {
    expect(() =>
      assertNoBakedMeasurementScripts("/", `<html><script async src="${scriptUrl}"></script></html>`),
    ).toThrow("contains baked GTM, Google Analytics, or Clarity markup");
  });

  it("GTMのnoscript iframeを拒否する", () => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        "_shell.html",
        '<html><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST1234"></iframe></noscript></html>',
      ),
    ).toThrow("contains baked GTM, Google Analytics, or Clarity markup");
  });

  it("本文中の運用説明だけではbaked scriptと判定しない", () => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        "/howto",
        "<html><body><p>googletagmanager.comへの通信は同意後だけ許可します。</p></body></html>",
      ),
    ).not.toThrow();
  });
});
