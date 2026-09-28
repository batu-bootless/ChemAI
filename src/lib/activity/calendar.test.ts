import { describe, expect, it } from "vitest";
import { buildYear, levelOf } from "./calendar";

// The ChemPlus website's calendar for 2026, seen on 28 September 2026, is the reference: its month
// names sit at left = 14 px × week, and its greens follow the counts below.
describe("buildYear", () => {
  const today = new Date(2026, 8, 28);
  const calendar = buildYear(2026, { "2026-08-15": 25, "2026-09-28": 3, "2026-09-29": 7, "2025-12-30": 4 }, today);

  it("runs Monday to Sunday from the week of 1 January to the week of 31 December", () => {
    expect(calendar.weeks).toHaveLength(53);
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    expect(calendar.weeks[0][0].key).toBe("2025-12-29");
    expect(calendar.weeks.at(-1)?.at(-1)?.key).toBe("2027-01-03");
  });

  it("puts each month's name where the ChemPlus calendar does", () => {
    expect(calendar.months.map((m) => m.week)).toEqual([0, 5, 9, 14, 18, 22, 27, 31, 36, 40, 44, 49]);
    expect(calendar.months.map((m) => m.month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("shows only the days of the year up to today, and counts only those", () => {
    const days = calendar.weeks.flat();
    const byKey = (key: string) => days.find((day) => day.key === key)!;
    expect(byKey("2025-12-31").shown).toBe(false);
    expect(byKey("2026-01-01").shown).toBe(true);
    expect(byKey("2026-09-28")).toMatchObject({ shown: true, count: 3 });
    expect(byKey("2026-09-29")).toMatchObject({ shown: false, count: 0 });
    expect(calendar.total).toBe(28);
    expect(calendar.todayWeek).toBe(39);
  });
});

describe("levelOf", () => {
  it("matches the ChemPlus calendar's greens", () => {
    const seen: [number, number][] = [[0, 0], [1, 1], [2, 1], [3, 1], [4, 2], [5, 2], [6, 2], [7, 3], [8, 3], [9, 3], [12, 4], [13, 4], [14, 4], [25, 4]];
    for (const [count, level] of seen) expect(levelOf(count)).toBe(level);
  });
});
