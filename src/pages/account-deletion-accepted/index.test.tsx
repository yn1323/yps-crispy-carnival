// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@chakra-ui/react", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/src/components/templates/Header", () => ({
  HEADER_HEIGHT: { base: "56px", md: "64px" },
}));

vi.mock("@/src/components/templates/PublicPageLayout", () => ({
  PublicPageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({
    title,
    description,
    secondaryDescription,
    action,
  }: {
    title: ReactNode;
    description: ReactNode;
    secondaryDescription?: ReactNode;
    action: ReactNode;
  }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>{secondaryDescription}</p>
      {action}
    </section>
  ),
}));

import { AccountDeletionAcceptedPage } from ".";

it("公開受付ページを表示する", () => {
  render(<AccountDeletionAcceptedPage />);

  expect(screen.getByRole("heading", { name: "アカウントの削除を受け付けました" })).not.toBeNull();
  expect(
    screen.getByText(
      /過去のシフト・同意・請求・操作記録などは、法令または契約上必要な業務記録として残る場合があります/,
    ),
  ).not.toBeNull();
  expect(screen.queryByText(/過去の利用履歴は、業務記録として残ります/)).toBeNull();
  expect(screen.getByRole("link", { name: "トップページへ戻る" }).getAttribute("href")).toBe("/");
});
