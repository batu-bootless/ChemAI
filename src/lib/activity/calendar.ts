// ChemAI: the account page's year of activity, laid out like GitHub's contribution graph (the
// same calendar as the ChemPlus website's): one column per week from Monday to Sunday, the
// calendar year from the week of 1 January to the week of 31 December. Days outside the year and
// days still to come are kept in the grid but not shown, so every column stays a full week.

import { dayKey } from "../ai/usage";

/** GitHub's five greens, lightest (no activity) to darkest. */
export const LEVEL_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] as const;

/** 0 for none, then 1-3, 4-6, 7-9 and 10 or more activities in a day. */
export function levelOf(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

export interface CalendarDay {
  key: string;
  date: Date;
  count: number;
  /** In the year and not after today: the only days that are shown. */
  shown: boolean;
}

export interface YearCalendar {
  year: number;
  /** Columns of seven days, Monday first. */
  weeks: CalendarDay[][];
  /** Where each month's name goes: the first week whose first day of the year is in that month. */
  months: { month: number; week: number }[];
  /** The total over the shown days. */
  total: number;
  /** The week that holds today, or the last week for a past year. */
  todayWeek: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  // Built from the parts, so a daylight-saving change never moves a day.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday = 0 … Sunday = 6. */
function weekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function buildYear(year: number, counts: Record<string, number>, today = new Date()): YearCalendar {
  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const start = addDays(first, -weekday(first));
  const end = addDays(last, 6 - weekday(last));
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const todayKey = dayKey(todayStart);
  const weeks: CalendarDay[][] = [];
  let total = 0;
  let todayWeek = -1;
  const dayCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

  for (let i = 0; i < dayCount; i++) {
    const date = addDays(start, i);
    const key = dayKey(date);
    const shown = date.getFullYear() === year && date.getTime() <= todayStart.getTime();
    const count = shown ? Math.max(0, counts[key] ?? 0) : 0;
    total += count;
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ key, date, count, shown });
    if (key === todayKey) todayWeek = weeks.length - 1;
  }

  // A month's name goes over the first week whose first day of the year is in that month.
  const months: { month: number; week: number }[] = [];
  weeks.forEach((days, week) => {
    const firstInYear = days.find((day) => day.date.getFullYear() === year);
    if (firstInYear && months.at(-1)?.month !== firstInYear.date.getMonth()) {
      months.push({ month: firstInYear.date.getMonth(), week });
    }
  });

  if (todayWeek < 0) todayWeek = todayStart.getFullYear() < year ? 0 : weeks.length - 1;
  return { year, weeks, months, total, todayWeek };
}
