// @vitest-environment jsdom

import { parseDate } from "@chakra-ui/react";
import { act, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CreateRecruitmentFormView } from "./CreateRecruitmentFormView";

const state = vi.hoisted(() => ({ view: undefined as ComponentProps<typeof CreateRecruitmentFormView> | undefined }));
vi.mock("./CreateRecruitmentFormView", () => ({
  CreateRecruitmentFormView: (props: ComponentProps<typeof CreateRecruitmentFormView>) => {
    state.view = props;
    return null;
  },
}));

import { CreateRecruitmentForm } from ".";

describe("募集編集フォーム", () => {
  it("カレンダーの開始日だけの中間更新を挟んでも、残る期間の休日選択を保持する", () => {
    render(
      <CreateRecruitmentForm
        mode="edit"
        today="2026-05-01"
        regularClosedDays={["mon"]}
        defaultValues={{
          periodStart: "2026-06-01",
          periodEnd: "2026-06-07",
          deadline: "2026-05-31",
          shopClosedDates: ["2026-06-03"],
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(state.view?.holidays.value.map(String)).toEqual(["2026-06-03"]);
    act(() => state.view?.onPeriodChange([parseDate("2026-06-01")]));
    act(() => state.view?.onPeriodChange([parseDate("2026-06-01"), parseDate("2026-06-14")]));

    expect(state.view?.holidays.value.map(String)).toEqual(["2026-06-03", "2026-06-08"]);
  });

  it("休日を変更して期間ステップへ戻った後も、その選択から期間を変更する", () => {
    render(
      <CreateRecruitmentForm
        mode="edit"
        today="2026-05-01"
        regularClosedDays={["mon"]}
        defaultValues={{
          periodStart: "2026-06-01",
          periodEnd: "2026-06-07",
          deadline: "2026-05-31",
          shopClosedDates: ["2026-06-03"],
        }}
        onSubmit={vi.fn()}
      />,
    );
    act(() => state.view?.onHolidayChange([parseDate("2026-06-04")]));
    act(() => state.view?.onPeriodChange([parseDate("2026-06-02"), parseDate("2026-06-06")]));
    expect(state.view?.holidays.value.map(String)).toEqual(["2026-06-04"]);
  });
});
