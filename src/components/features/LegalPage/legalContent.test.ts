import { describe, expect, it } from "vitest";
import { buildLegalDocuments, type LegalMdxComponent } from "./legalContent";

const termsFrontmatterModules = import.meta.glob<unknown>("../Terms/content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const privacyFrontmatterModules = import.meta.glob<unknown>("../PrivacyPolicy/content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const DummyContent: LegalMdxComponent = () => null;

function toComponentModules(frontmatterModules: Record<string, unknown>): Record<string, LegalMdxComponent> {
  return Object.fromEntries(Object.keys(frontmatterModules).map((path) => [path, DummyContent]));
}

const validFrontmatter = { title: "スタッフ向け利用規約", lastUpdated: "2026年5月9日" };

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

    expect(documents.manager.title).toBe("管理ユーザー向け利用規約");
    expect(documents.staff.title).toBe("スタッフ向け利用規約");
    expect(documents.manager.lastUpdated).not.toBe("");
    expect(documents.staff.lastUpdated).not.toBe("");
  });

  it("プライバシーポリシーの実ファイルの frontmatter を manager / staff ともに読み込める", () => {
    const documents = buildLegalDocuments(toComponentModules(privacyFrontmatterModules), privacyFrontmatterModules);

    expect(documents.manager.title).toBe("管理ユーザー向けプライバシーポリシー");
    expect(documents.staff.title).toBe("スタッフ向けプライバシーポリシー");
  });
});
