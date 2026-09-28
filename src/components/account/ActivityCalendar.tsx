"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildYear, LEVEL_COLORS, levelOf } from "@/lib/activity/calendar";
import { chemAiActivity, localActivity } from "@/lib/activity/chemaiActivity";
import { useL, useLocale } from "@/mobile/i18n";

// ChemAI: the year of activity under the name on the account page - the ChemPlus website's
// GitHub-like calendar, cell for cell (11 px squares, 3 px apart, Monday first). On a phone there is
// no hover, so a tap on a day names it under the calendar; the calendar opens on today's week and
// keeps the day names in view.

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;

export default function ActivityCalendar() {
  const l = useL();
  const locale = useLocale();
  const year = new Date().getFullYear();
  // The account page only renders signed in, in the app: this phone's count is there at once, and
  // the account's saved questions join it when they arrive.
  const [counts, setCounts] = useState<Record<string, number>>(localActivity);
  const [selected, setSelected] = useState<string | null>(null);
  const [explained, setExplained] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void chemAiActivity(year).then((merged) => {
      if (live) setCounts(merged);
    });
    return () => {
      live = false;
    };
  }, [year]);

  const calendar = useMemo(() => buildYear(year, counts), [year, counts]);

  // Today's week near the right edge: the recent weeks are what a phone should show first (the
  // weeks still to come are empty).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const grid = el.querySelector<HTMLElement>("[data-calendar-grid]");
    const offset = grid ? grid.offsetLeft : 0;
    el.scrollLeft = Math.max(0, offset + (calendar.todayWeek + 3) * STEP - el.clientWidth);
  }, [calendar.todayWeek]);

  const monthName = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const dayName = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short" }), [locale]);
  const longDate = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }), [locale]);
  // 5 January 2026 was a Monday: the labels for Monday, Wednesday, Friday and Sunday.
  const weekdayLabels = [0, 2, 4, 6].map((offset) => dayName.format(new Date(2026, 0, 5 + offset)));

  const describe = (count: number, date: Date) =>
    l(
      `${longDate.format(date)}: ${count} etkinlik`,
      `${count} ${count === 1 ? "contribution" : "contributions"} on ${longDate.format(date)}`
    );
  const selectedDay = selected ? calendar.weeks.flat().find((day) => day.key === selected) : null;
  const gridWidth = calendar.weeks.length * STEP - GAP;

  return (
    <section className="relative mt-5 text-left">
      <h2 className="mb-2 px-1 text-[15px] font-semibold text-gray-900 dark:text-white">
        {l(`${year} yılında ${calendar.total} etkinlik`, `${calendar.total} contributions in ${year}`)}
      </h2>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
        <div className="relative">
          <div ref={scroller} className="overflow-x-auto pb-1">
            <div className="inline-flex">
              {/* The day names stay put while the weeks scroll under them (a phone shows a few months). */}
              <div className="sticky left-0 z-20 flex flex-col justify-end bg-white pb-0 pr-2 dark:bg-[#1c1c1e]" style={{ paddingTop: 19 }}>
                <div className="grid shrink-0" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}>
                  {Array.from({ length: 7 }, (_, row) => (
                    <span key={row} className="flex items-center text-[10px] leading-none text-gray-500" style={{ height: CELL }}>
                      {row % 2 === 0 ? weekdayLabels[row / 2] : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div data-calendar-grid>
                <div className="relative h-4" style={{ width: gridWidth }}>
                  {calendar.months.map(({ month, week }) => (
                    <span key={month} className="absolute top-0 text-xs text-gray-500" style={{ left: week * STEP }}>
                      {monthName.format(new Date(year, month, 1))}
                    </span>
                  ))}
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${calendar.weeks.length}, ${CELL}px)`,
                    gridTemplateRows: `repeat(7, ${CELL}px)`,
                    gridAutoFlow: "column",
                    gap: GAP,
                    marginTop: GAP,
                  }}
                >
                  {calendar.weeks.flat().map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      disabled={!day.shown}
                      aria-label={describe(day.count, day.date)}
                      aria-pressed={selected === day.key}
                      onClick={() => setSelected((current) => (current === day.key ? null : day.key))}
                      className={`rounded-sm outline-none transition-transform duration-100 hover:z-10 hover:scale-125 hover:ring-2 hover:ring-gray-400 focus-visible:z-10 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:pointer-events-none disabled:opacity-0 ${
                        selected === day.key ? "z-10 scale-125 ring-2 ring-gray-400" : ""
                      }`}
                      style={{ width: CELL, height: CELL, backgroundColor: LEVEL_COLORS[levelOf(day.count)] }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {selectedDay && <p className="mt-2 text-xs text-gray-600 dark:text-[#c7c7cc]">{describe(selectedDay.count, selectedDay.date)}</p>}
          {explained && (
            <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-[#9c9ca1]">
              {l(
                "Her kare bir gün. İris'e sorduğun her soru ve İris'in senin için yaptığı her iş (zamanlayıcı, not, protokol, rapor, grafik…) bir etkinlik sayılır. Renk koyulaştıkça o gün daha çok etkinlik var. Bu telefondaki kullanım ve hesabına kaydedilen ChemAI sohbetleri birlikte sayılır.",
                "Each square is a day. Every question you ask Iris and everything Iris does for you (a timer, note, protocol, report, graph…) counts as one contribution. The darker the square, the more happened that day. Use on this phone and the ChemAI chats saved to your account are counted together."
              )}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setExplained((open) => !open)}
              aria-expanded={explained}
              className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-700"
            >
              {l("Bu nedir?", "What is this?")}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>{l("Az", "Less")}</span>
              <div className="flex items-center gap-[3px]">
                {LEVEL_COLORS.map((color) => (
                  <span key={color} className="rounded-sm" style={{ width: CELL, height: CELL, backgroundColor: color }} />
                ))}
              </div>
              <span>{l("Çok", "More")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
