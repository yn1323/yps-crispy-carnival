// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShopFilterMenu } from "./ShopFilterMenu";

describe("ShopFilterMenu", () => {
  it("店舗が1つのときはフィルターを表示しない", () => {
    render(<ShopFilterMenu value={null} options={[{ value: "shop-1", label: "本店" }]} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "店舗で絞り込む（現在：すべて）" })).toBeNull();
  });
});
