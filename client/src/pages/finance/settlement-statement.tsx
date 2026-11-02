// Расчёты с контрагентом по датам (CustomerStatement в УЭС): долг на начало, движения
// с нарастающим долгом, долг на конец и заказы, которые ждут отгрузки.

import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards, ReportError, fmtDate, fmtMoney, todayKey } from "@/components/ues/report-kit";
import { useReport } from "@/lib/report-query";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  date: string;
  type: "goods" | "receipt" | "payment" | "refund";
  title: string;
  note: string | null;
  to: string | null;
  opening: number;
  increase: number;
  decrease: number;
  closing: number;
}

interface Pending {
  id: string;
  orderNumber: number;
  date: string | null;
  amount: number;
  status: string | null;
}

interface Statement {
  kind: "dealer" | "supplier";
  name: string;
  totals: {
    opening: number;
    increase: number;
    decrease: number;
    closing: number;
    current: number;
    projected: number;
    goods: number;
    money: number;
    refund: number;
  };
  rows: Row[];
  pending: Pending[];
}

type Preset = "week" | "month" | "previousMonth" | "all";

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function periodOf(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "all") return { from: "", to: "" };
  if (preset === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: key(monday), to: todayKey() };
  }
  if (preset === "month") return { from: key(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayKey() };
  return { from: key(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: key(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

const monthName = () => {
  const s = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const PRESETS: { key: Preset; label: () => string }[] = [
  { key: "week", label: () => "Эта неделя" },
  { key: "month", label: monthName },
  { key: "previousMonth", label: () => "Прошлый месяц" },
  { key: "all", label: () => "Всё время" },
];

const TAGS: Record<Row["type"] | "order", [string, string]> = {
  goods: ["Отгрузка", "is-goods"],
  receipt: ["Поступление", "is-goods"],
  payment: ["Оплата", "is-payment"],
  refund: ["Возврат денег", "is-return"],
  order: ["Заказ", "is-order"],
};

const cell = (v: number) => (Math.abs(v) < 0.005 ? "" : `${v < 0 ? "−" : ""}${fmtMoney(Math.abs(v))}`);
const balanceTone = (v: number) => (v > 0.005 ? "is-debt" : v < -0.005 ? "is-advance" : "");

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
}

export default function SettlementStatementPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const [, navigate] = useLocation();
  const [preset, setPreset] = useState<Preset | "">("month");
  const [range, setRange] = useState(() => periodOf("month"));
  const [query, setQuery] = useState("");
  const [showOrders, setShowOrders] = useState(true);
  const { data, error, isLoading } = useReport<Statement>(`/api/reports/settlements/${kind}/${id}`, range);

  const supplier = data?.kind === "supplier";
  const debtWord = supplier ? "Наш долг" : "Долг";
  const t = data?.totals;

  const entries = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU");
    const hit = (s: string) => !q || s.toLocaleLowerCase("ru-RU").includes(q);
    const rows = (data?.rows ?? []).filter((r) => hit(`${r.title} ${r.note ?? ""}`)).map((r) => ({ date: r.date, row: r, order: null as Pending | null }));
    const orders = showOrders
      ? (data?.pending ?? []).filter((o) => hit(`Заказ №${o.orderNumber}`)).map((o) => ({ date: o.date ?? "", row: null as Row | null, order: o }))
      : [];
    return [...rows, ...orders].sort((a, b) => a.date.localeCompare(b.date));
  }, [data, query, showOrders]);

  const choose = (p: Preset) => {
    setPreset(p);
    setRange(periodOf(p));
  };
  const setDate = (field: "from" | "to", value: string) => {
    setPreset("");
    setRange((r) => ({ ...r, [field]: value }));
  };

  const pendingCount = data?.pending.length ?? 0;
  const increaseHint = t ? (t.goods ? plural(t.goods, supplier ? "поступление" : "отгрузка", supplier ? "поступления" : "отгрузки", supplier ? "поступлений" : "отгрузок") : "—") : "";
  const decreaseHint = t ? (t.money ? plural(t.money, "оплата", "оплаты", "оплат") : "—") : "";

  return (
    <Layout
      title={data ? `Расчёты с ${supplier ? "поставщиком" : "клиентом"}: ${data.name}` : "Расчёты с контрагентом"}
      caption="Финансы · Взаиморасчёты"
      wide
    >
      <div className="space-y-3">
        <div className="ues-toolbar">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={cn("ues-btn h-8", preset === p.key && "is-active")} aria-pressed={preset === p.key} onClick={() => choose(p.key)}>
              {p.label()}
            </button>
          ))}
          <span className="ues-toolbar-sep" />
          <label className="flex items-center gap-1.5 text-[13px] text-[var(--ues-muted)]">
            с
            <input type="date" className="ues-input h-8" value={range.from} max={range.to || undefined} onChange={(e) => setDate("from", e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-[var(--ues-muted)]">
            по
            <input type="date" className="ues-input h-8" value={range.to} min={range.from || undefined} onChange={(e) => setDate("to", e.target.value)} />
          </label>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input className="ues-input h-8 w-[240px] !pl-8" placeholder="Номер заказа или комментарий" aria-label="Поиск по документам" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {error && <ReportError error={error} />}

        {t && (
          <KpiCards
            items={[
              { label: t.opening < -0.005 ? "Аванс на начало" : `${debtWord} на начало`, value: fmtMoney(Math.abs(t.opening)) },
              { label: "+ Увеличение долга", value: fmtMoney(t.increase), hint: increaseHint },
              { label: "− Уменьшение долга", value: fmtMoney(t.decrease), hint: decreaseHint },
              {
                label: `= ${t.closing < -0.005 ? "Аванс" : debtWord} ${range.to ? `на ${fmtDate(range.to)}` : "сейчас"}`,
                value: fmtMoney(Math.abs(t.closing)),
              },
              ...(supplier
                ? []
                : [
                    {
                      label: "Долг с ожидаемыми отгрузками",
                      value: `${t.projected < 0 ? "−" : ""}${fmtMoney(Math.abs(t.projected))}`,
                      hint: pendingCount ? `ждут отгрузки ${plural(pendingCount, "заказ", "заказа", "заказов")}` : "заказов в ожидании нет",
                    },
                  ]),
            ]}
          />
        )}

        {!supplier && pendingCount > 0 && (
          <label className="flex w-fit items-center gap-2 text-[13px]">
            <input type="checkbox" checked={showOrders} onChange={(e) => setShowOrders(e.target.checked)} />
            Показывать в таблице заказы, которые ждут отгрузки
          </label>
        )}

        <div className="ues-table-wrap">
          <table className="ues-table ues-statement-table">
            <thead>
              <tr>
                <th className="w-[100px]">Дата</th>
                <th className="w-[130px]">Документ</th>
                <th className="w-[170px]">Номер</th>
                <th>Описание</th>
                <th className="num w-[130px]">На начало</th>
                <th className="num w-[130px]">Увеличение</th>
                <th className="num w-[130px]">Уменьшение</th>
                <th className="num w-[130px]">На конец</th>
              </tr>
            </thead>
            <tbody>
              {t && (
                <tr className="ues-statement-edge">
                  <td colSpan={7}>Остаток на {range.from ? fmtDate(range.from) : "начало"}</td>
                  <td className={cn("num", balanceTone(t.opening))}>{cell(t.opening) || "0,00"}</td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={8} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {entries.map(({ row, order }) => {
                if (order) {
                  return (
                    <tr key={`pending-${order.id}`} className="ues-statement-pending" title="Ждёт отгрузки, в долг не входит">
                      <td className="tabular-nums">{fmtDate(order.date)}</td>
                      <td>
                        <span className={cn("ues-statement-tag", TAGS.order[1])}>{TAGS.order[0]}</span>
                      </td>
                      <td>
                        <button type="button" className="ues-party-link" onClick={() => navigate(`/orders/doc/${order.id}`)}>
                          Заказ №{order.orderNumber}
                        </button>
                      </td>
                      <td className="ues-muted">{order.status || "Новый"} · {fmtMoney(order.amount)}</td>
                      <td colSpan={4} className="ues-muted">ждёт отгрузки — в долг не входит</td>
                    </tr>
                  );
                }
                const r = row!;
                const [tag, tone] = TAGS[r.type];
                return (
                  <tr key={r.key}>
                    <td className="tabular-nums">{fmtDate(r.date)}</td>
                    <td>
                      <span className={cn("ues-statement-tag", tone)}>{tag}</span>
                    </td>
                    <td>
                      {r.to ? (
                        <button type="button" className="ues-party-link" onClick={() => navigate(r.to!)}>
                          {r.title}
                        </button>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td className="ues-muted truncate max-w-0" title={r.note ?? undefined}>{r.note}</td>
                    <td className="num">{cell(r.opening)}</td>
                    <td className="num">{cell(r.increase)}</td>
                    <td className="num">{cell(r.decrease)}</td>
                    <td className={cn("num font-semibold", balanceTone(r.closing))}>{cell(r.closing) || "0,00"}</td>
                  </tr>
                );
              })}
              {t && !isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="ues-muted py-6 text-center">
                    {query.trim() ? "Ничего не найдено. Измените поиск." : "За этот период движений нет."}
                  </td>
                </tr>
              )}
            </tbody>
            {t && (
              <tfoot>
                <tr className="ues-statement-edge">
                  <td colSpan={4}>Итого за период</td>
                  <td className="num">{cell(t.opening) || "0,00"}</td>
                  <td className="num">{fmtMoney(t.increase)}</td>
                  <td className="num">{fmtMoney(t.decrease)}</td>
                  <td className={cn("num", balanceTone(t.closing))}>{cell(t.closing) || "0,00"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Layout>
  );
}
