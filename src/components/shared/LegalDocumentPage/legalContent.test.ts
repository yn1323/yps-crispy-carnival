import { describe, expect, it } from "vitest";
import { buildLegalDocument, buildLegalDocuments, type LegalMdxComponent } from "./legalContent";

const termsFrontmatterModules = import.meta.glob<unknown>("../../features/Terms/content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const privacyFrontmatterModules = import.meta.glob<unknown>("../../features/PrivacyPolicy/content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const commercialTransactionsFrontmatterModules = import.meta.glob<unknown>(
  "../../features/CommercialTransactions/content/*.mdx",
  {
    eager: true,
    query: "?mdx-frontmatter",
    import: "default",
  },
);

const DummyContent: LegalMdxComponent = () => null;

function toComponentModules(frontmatterModules: Record<string, unknown>): Record<string, LegalMdxComponent> {
  return Object.fromEntries(Object.keys(frontmatterModules).map((path) => [path, DummyContent]));
}

const validFrontmatter = { title: "スタッフ向け利用規約", lastUpdated: "2026年5月9日" };

describe("buildLegalDocument", () => {
  it("指定した単一ファイルのfrontmatterとContentを読み取れる", () => {
    const document = buildLegalDocument(
      { "./content/index.mdx": DummyContent },
      { "./content/index.mdx": validFrontmatter },
      "index.mdx",
    );

    expect(document).toEqual({ ...validFrontmatter, Content: DummyContent });
  });

  it("指定したファイルがない場合はエラーにする", () => {
    expect(() => buildLegalDocument({}, {}, "index.mdx")).toThrow("content/index.mdx");
  });

  it("特定商取引法に基づく表記の実ファイルのfrontmatterを読み込める", () => {
    const document = buildLegalDocument(
      toComponentModules(commercialTransactionsFrontmatterModules),
      commercialTransactionsFrontmatterModules,
      "index.mdx",
    );

    expect(document.title).toBe("特定商取引法に基づく表記");
    expect(document.lastUpdated).not.toBe("");
  });
});

describe("buildLegalDocuments", () => {
  it("frontmatter と Content を audience 別に読み取れる", () => {
    const documents = buildLegalDocuments(
      { "./content/manager.mdx": DummyContent, "./content/staff.mdx": DummyContent },
      { "./content/manager.mdx": validFrontmatter, "./content/staff.mdx": validFrontmatter },
    );

    expect(documents.manager.title).toBe("スタッフ向け利用規約");
    expect(documents.staff.lastUpdated).toBe("2026年5月9日");
    expect(documents.staff.Content).toBe(DummyContent);
  });

  it("audience 分のファイルが揃っていない場合はエラーにする", () => {
    expect(() =>
      buildLegalDocuments({ "./content/manager.mdx": DummyContent }, { "./content/manager.mdx": validFrontmatter }),
    ).toThrow("staff.mdx");
  });

  it("title がない場合はエラーにする", () => {
    expect(() =>
      buildLegalDocuments(
        { "./content/manager.mdx": DummyContent, "./content/staff.mdx": DummyContent },
        {
          "./content/manager.mdx": { lastUpdated: "2026年5月9日" },
          "./content/staff.mdx": validFrontmatter,
        },
      ),
    ).toThrow("frontmatter");
  });

  it("lastUpdated がない場合はエラーにする", () => {
    expect(() =>
      buildLegalDocuments(
        { "./content/manager.mdx": DummyContent, "./content/staff.mdx": DummyContent },
        {
          "./content/manager.mdx": validFrontmatter,
          "./content/staff.mdx": { title: "スタッフ向け利用規約" },
        },
      ),
    ).toThrow("frontmatter");
  });

  it("利用規約の実ファイルの frontmatter を manager / staff ともに読み込める", () => {
    const documents = buildLegalDocuments(toComponentModules(termsFrontmatterModules), termsFrontmatterModules);

    expect(Object.keys(documents)).toEqual(["manager", "staff"]);
    expect(Object.values(documents).every(({ title, lastUpdated }) => title !== "" && lastUpdated !== "")).toBe(true);
  });

  it("プライバシーポリシーの実ファイルの frontmatter を manager / staff ともに読み込める", () => {
    const documents = buildLegalDocuments(toComponentModules(privacyFrontmatterModules), privacyFrontmatterModules);

    expect(Object.keys(documents)).toEqual(["manager", "staff"]);
    expect(Object.values(documents).every(({ title, lastUpdated }) => title !== "" && lastUpdated !== "")).toBe(true);
  });
});
