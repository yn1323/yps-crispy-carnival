import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { pickNextAction } from "./pickNextAction";

const NOW = dayjs("2026-04-18");

const id = (s: string) => s as unknown as Id<"recruitments">;

const make = (over: Partial<Recruitment>): Recruitment => ({
  _id: id("base"),
  periodStart: "2026-05-01",
  periodEnd: "2026-05-07",
  deadline: "2026-04-25",
  status: "open",
  responseCount: 0,
  ...over,
});

describe("pickNextAction", () => {
  it("returns idle when no recruitments", () => {
    expect(pickNextAction([], NOW)).toEqual({ kind: "idle" });
  });

  it("returns idle when only confirmed exist", () => {
    expect(pickNextAction([make({ status: "confirmed", deadline: "2026-04-15" })], NOW)).toEqual({ kind: "idle" });
  });

  it("returns idle when collecting deadline is more than 3 days away", () => {
    expect(pickNextAction([make({ deadline: "2026-04-25" })], NOW)).toEqual({ kind: "idle" });
  });

  it("prioritizes past-deadline over collecting", () => {
    const past = make({ _id: id("past"), deadline: "2026-04-15" });
    const collecting = make({ _id: id("collecting"), deadline: "2026-04-20" });
    const result = pickNextAction([collecting, past], NOW);
    expect(result.kind).toBe("past-deadline");
    if (result.kind === "past-deadline") expect(result.recruitment._id).toBe(id("past"));
  });

  it("picks the oldest past-deadline first", () => {
    const oldest = make({ _id: id("oldest"), deadline: "2026-04-10" });
    const newer = make({ _id: id("newer"), deadline: "2026-04-15" });
    const result = pickNextAction([newer, oldest], NOW);
    if (result.kind === "past-deadline") expect(result.recruitment._id).toBe(id("oldest"));
  });

  it("returns deadline-today when collecting deadline equals today", () => {
    const today = make({ _id: id("today"), deadline: "2026-04-18" });
    const result = pickNextAction([today], NOW);
    expect(result.kind).toBe("deadline-today");
  });

  it("returns deadline-soon with daysLeft for collecting within 3 days", () => {
    const soon = make({ deadline: "2026-04-20" });
    expect(pickNextAction([soon], NOW)).toEqual({ kind: "deadline-soon", recruitment: soon, daysLeft: 2 });
  });

  it("picks the closest deadline among multiple soon", () => {
    const later = make({ _id: id("later"), deadline: "2026-04-21" });
    const sooner = make({ _id: id("sooner"), deadline: "2026-04-19" });
    const result = pickNextAction([later, sooner], NOW);
    if (result.kind === "deadline-soon") {
      expect(result.recruitment._id).toBe(id("sooner"));
      expect(result.daysLeft).toBe(1);
    }
  });

  it("deadline-today takes precedence over deadline-soon", () => {
    const today = make({ _id: id("today"), deadline: "2026-04-18" });
    const soon = make({ _id: id("soon"), deadline: "2026-04-19" });
    const result = pickNextAction([soon, today], NOW);
    expect(result.kind).toBe("deadline-today");
    if (result.kind === "deadline-today") expect(result.recruitment._id).toBe(id("today"));
  });
});
