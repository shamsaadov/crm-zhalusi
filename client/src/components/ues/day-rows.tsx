// Разделение журналов по дням: строка-заголовок дня перед документами этого дня.

import { fmtMoney, todayKey } from "./report-kit";

export type DayItem<T> = { kind: "day"; date: string; count: number; sum: number } | { kind: "row"; item: T };

/** Вставляет заголовок дня перед первой строкой каждого дня (строки уже отсортированы). */
export function groupByDay<T>(rows: T[], dateOf: (row: T) => string | null | undefined, amountOf?: (row: T) => number) {
  const out: DayItem<T>[] = [];
  let current: Extract<DayItem<T>, { kind: "day" }> | null = null;
  for (const row of rows) {
    const date = (dateOf(row) ?? "").slice(0, 10);
    if (!current || current.date !== date) {
      current = { kind: "day", date, count: 0, sum: 0 };
      out.push(current);
    }
    current.count += 1;
    current.sum += amountOf ? amountOf(row) || 0 : 0;
    out.push({ kind: "row", item: row });
  }
  return out;
}

const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(date: string) {
  if (!date) return "Без даты";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const wd = weekday.format(d);
  const prefix = date === todayKey() ? "Сегодня" : date === yesterdayKey() ? "Вчера" : wd[0].toUpperCase() + wd.slice(1);
  return `${prefix}, ${dayMonth.format(d)}`;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function DayRow({
  date,
  count,
  sum,
  colSpan,
  noun = ["документ", "документа", "документов"],
  showSum = true,
}: {
  date: string;
  count: number;
  sum?: number;
  colSpan: number;
  noun?: [string, string, string];
  showSum?: boolean;
}) {
  return (
    <tr className="ues-day-row" aria-label={dayLabel(date)}>
      <td colSpan={colSpan}>
        <span className="ues-day-title">{dayLabel(date)}</span>
        <span className="ues-day-meta">
          {count} {plural(count, ...noun)}
          {showSum && sum !== undefined && <> · {fmtMoney(sum)}</>}
        </span>
      </td>
    </tr>
  );
}
