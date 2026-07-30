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
  Empty: ({ title, description, action }: { title: ReactNode; description: ReactNode; action: ReactNode }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </section>
  ),
}));

import { NotFoundPage } from ".";

it("未知URLからトップページへ戻れる", () => {
  render(<NotFoundPage />);

  expect(screen.getByRole("heading", { name: "ページが見つかりません" })).not.toBeNull();
  expect(screen.getByRole("link", { name: "トップページへ戻る" }).getAttribute("href")).toBe("/");
});
