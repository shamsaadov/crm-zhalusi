// Документ «Поступление товаров» (ПТ) в стиле УЭС: шапка + таблица строк.
// Ткань вводится в погонных метрах и цене за п.м.; на склад идёт в м² по ширине рулона
// (та же логика, что в прежней форме склада).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { CheckCheck, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { fmtDate, fmtMoney, todayKey } from "@/components/ues/report-kit";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { currentFullPath, useWorkspaceTabs } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";
import type { Component, Fabric, Supplier, WarehouseReceipt } from "@shared/schema";
import { fabricWidthMeters, fmtQty } from "./common";

interface ReceiptItem {
  itemType: "fabric" | "component";
  fabricId: string | null;
  componentId: string | null;
  quantity: string | null;
  price: string | null;
  total: string | null;
}

interface ReceiptWithItems extends WarehouseReceipt {
  items: ReceiptItem[];
}

interface Line {
  key: string;
  itemType: "fabric" | "component";
  itemId: string;
  /** Ткань: погонные метры; комплектующее: количество. */
  qtyInput: string;
  /** Ткань: цена за п.м.; комплектующее: цена за единицу. */
  priceInput: string;
  /** Исходные значения строки — отправляются без пересчёта, если строку не трогали. */
  original?: { quantity: string; price: string; total: string };
}

let lineSeq = 0;
const newLine = (itemType: Line["itemType"] = "fabric"): Line => ({
  key: `l${++lineSeq}`,
  itemType,
  itemId: "",
  qtyInput: "",
  priceInput: "",
});

const num = (v: string) => {
  const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export default function ReceiptDocumentPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { close } = useWorkspaceTabs();

  const { data: receipt, isLoading, error } = useQuery<ReceiptWithItems>({
    queryKey: ["/api/warehouse", id],
    enabled: !isNew,
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: fabrics = [] } = useQuery<Fabric[]>({ queryKey: ["/api/fabrics"] });
  const { data: components = [] } = useQuery<Component[]>({ queryKey: ["/api/components"] });

  const [date, setDate] = useState(todayKey());
  const [supplierId, setSupplierId] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fabricById = useMemo(() => new Map(fabrics.map((f) => [f.id, f])), [fabrics]);
  const componentById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);

  // Загрузка документа в форму: м² → п.м. по ширине рулона.
  useEffect(() => {
    if (!receipt || fabrics.length === 0) return;
    setDate(receipt.date);
    setSupplierId(receipt.supplierId ?? "");
    setComment(receipt.comment ?? "");
    setLines(
      receipt.items.map((it) => {
        const qty = parseFloat(it.quantity ?? "0");
        const price = parseFloat(it.price ?? "0");
        const original = { quantity: it.quantity ?? "0", price: it.price ?? "0", total: it.total ?? "0" };
        if (it.itemType === "fabric") {
          const w = fabricWidthMeters(fabricById.get(it.fabricId ?? ""));
          return {
            key: `l${++lineSeq}`,
            itemType: "fabric",
            itemId: it.fabricId ?? "",
            qtyInput: w > 0 ? String(round(qty / w, 2)) : String(qty),
            priceInput: w > 0 ? String(round(price * w, 2)) : String(price),
            original,
          };
        }
        return {
          key: `l${++lineSeq}`,
          itemType: "component",
          itemId: it.componentId ?? "",
          qtyInput: String(qty),
          priceInput: String(price),
          original,
        };
      })
    );
    setDirty(false);
  }, [receipt, fabrics.length, fabricById]);

  /** Значения строки для склада: количество, цена за единицу хранения, сумма. */
  const computeLine = (l: Line) => {
    if (l.original) return { quantity: l.original.quantity, price: l.original.price, total: l.original.total, ok: true };
    const q = num(l.qtyInput);
    const p = num(l.priceInput);
    if (l.itemType === "fabric") {
      const w = fabricWidthMeters(fabricById.get(l.itemId));
      if (w <= 0) return { quantity: "0", price: "0", total: (q * p).toFixed(2), ok: false };
      return {
        quantity: (q * w).toFixed(2),
        price: (p / w).toFixed(2),
        total: (q * p).toFixed(2),
        ok: true,
      };
    }
    return { quantity: String(q), price: p.toFixed(2), total: (q * p).toFixed(2), ok: true };
  };

  const docTotal = lines.reduce((s, l) => s + parseFloat(computeLine(l).total), 0);

  const update = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, original: undefined } : l)));
    setDirty(true);
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = "Укажите дату";
    if (!supplierId) e.supplierId = "Выберите поставщика";
    if (lines.length === 0) e.lines = "Добавьте хотя бы одну позицию";
    lines.forEach((l, i) => {
      if (!l.itemId) e[`${l.key}:item`] = "Выберите номенклатуру";
      if (num(l.qtyInput) <= 0) e[`${l.key}:qty`] = "Количество больше нуля";
      if (num(l.priceInput) < 0) e[`${l.key}:price`] = "Цена не может быть отрицательной";
      if (l.itemType === "fabric" && l.itemId && fabricWidthMeters(fabricById.get(l.itemId)) <= 0) {
        e[`${l.key}:item`] = "У ткани не указана ширина рулона";
      }
      void i;
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const invalidate = () => {
    for (const k of ["/api/warehouse", "/api/stock", "/api/suppliers", "/api/reports/balance", "/api/reports/settlements", "/api/dashboard"]) {
      queryClient.invalidateQueries({ queryKey: [k] });
    }
  };

  const save = useMutation({
    mutationFn: async (andClose: boolean) => {
      const body = {
        date,
        supplierId,
        comment: comment || null,
        items: lines.map((l) => {
          const c = computeLine(l);
          return {
            itemType: l.itemType,
            fabricId: l.itemType === "fabric" ? l.itemId : null,
            componentId: l.itemType === "component" ? l.itemId : null,
            quantity: c.quantity,
            price: c.price,
            total: c.total,
          };
        }),
      };
      const res = isNew
        ? await apiRequest("POST", "/api/warehouse", body)
        : await apiRequest("PUT", `/api/warehouse/${id}`, body);
      return { saved: (await res.json()) as WarehouseReceipt, andClose };
    },
    onSuccess: ({ saved, andClose }) => {
      invalidate();
      setDirty(false);
      toast({ title: "Поступление проведено" });
      const here = currentFullPath();
      if (andClose) {
        close(here, { silent: true });
        navigate("/warehouse");
      } else if (isNew) {
        close(here, { silent: true });
        navigate(`/warehouse/receipt/${saved.id}`);
      }
    },
    onError: (e: Error) => toast({ title: "Не удалось провести", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/warehouse/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Поступление удалено" });
      close(currentFullPath(), { silent: true });
      navigate("/warehouse");
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const submit = (andClose: boolean) => validate() && save.mutate(andClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!isNew && error) {
    return (
      <Layout title="Документ не найден" caption="Склад">
        <p className="text-[13px] text-[var(--ues-muted)]">Поступление удалено или принадлежит другому пользователю.</p>
      </Layout>
    );
  }

  const title = isNew ? "Поступление товаров (новое)" : receipt ? `Поступление от ${fmtDate(receipt.date)}` : "Поступление товаров";
  const busy = save.isPending || remove.isPending;
  const editable =
    "bg-[var(--ues-primary-soft-hover)] border-[var(--ues-primary-border)] shadow-[inset_3px_0_0_var(--ues-primary)]";

  return (
    <Layout
      title={title}
      caption="Склад · Поступление товаров"
      actions={<span className={cn("ues-status", isNew && "is-draft")}>{isNew ? "Новое" : "Проведено"}</span>}
    >
      {!isNew && isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ues-muted)]" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="ues-toolbar">
            <button type="button" className="ues-btn success" onClick={() => submit(true)} disabled={busy} data-testid="button-post-close">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Провести и закрыть
            </button>
            <button type="button" className="ues-btn soft-success" onClick={() => submit(false)} disabled={busy} data-testid="button-post">
              <Check className="h-4 w-4" />
              Провести
            </button>
            {!isNew && (
              <>
                <span className="ues-toolbar-sep" />
                <button
                  type="button"
                  className="ues-btn danger"
                  onClick={() => {
                    if (window.confirm("Удалить поступление? Остатки и долг поставщику пересчитаются.")) remove.mutate();
                  }}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                  Удалить
                </button>
              </>
            )}
            <span className="ml-auto text-[12px] text-[var(--ues-muted)]">
              {dirty ? "Есть непроведённые изменения · " : ""}Ctrl+S — провести
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="ues-fieldset">
              <div className="ues-fieldset-title">Основное</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="ues-field-label">
                    Дата<span className="req"> *</span>
                  </span>
                  <input
                    type="date"
                    className={cn("ues-input h-9", editable)}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setDirty(true);
                    }}
                  />
                  {errors.date && <small className="text-[12px] text-[var(--ues-danger)]">{errors.date}</small>}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ues-field-label">
                    Поставщик<span className="req"> *</span>
                  </span>
                  <select
                    className={cn("ues-input h-9", editable, errors.supplierId && "border-[var(--ues-danger)]")}
                    value={supplierId}
                    onChange={(e) => {
                      setSupplierId(e.target.value);
                      setDirty(true);
                      setErrors({});
                    }}
                    data-testid="select-supplier"
                  >
                    <option value="">Выберите поставщика</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {errors.supplierId && (
                    <small className="text-[12px] text-[var(--ues-danger)]">{errors.supplierId}</small>
                  )}
                </label>
              </div>
            </section>
            <section className="ues-fieldset">
              <div className="ues-fieldset-title">Исполнение</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="ues-field-label">Сумма документа</span>
                  <div className="ues-input flex h-9 items-center justify-end bg-[var(--ues-surface-soft)] font-semibold tabular-nums">
                    {fmtMoney(docTotal)}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="ues-field-label">Позиций</span>
                  <div className="ues-input flex h-9 items-center bg-[var(--ues-surface-soft)]">{lines.length}</div>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-[var(--ues-muted)]">
                Поступление увеличивает остатки и долг перед поставщиком.
              </p>
            </section>
          </div>

          <section className="ues-fieldset !p-0">
            <div className="flex items-center gap-2 px-4 pt-3">
              <div className="ues-fieldset-title !mb-0">Товары</div>
              <button type="button" className="ues-btn ml-2 h-8" onClick={() => setLines((ls) => [...ls, newLine("fabric")])}>
                <Plus className="h-4 w-4" />
                Ткань
              </button>
              <button type="button" className="ues-btn h-8" onClick={() => setLines((ls) => [...ls, newLine("component")])}>
                <Plus className="h-4 w-4" />
                Комплектующее
              </button>
              {errors.lines && <small className="text-[12px] text-[var(--ues-danger)]">{errors.lines}</small>}
            </div>
            <div className="mt-3 overflow-x-auto border-t border-[var(--ues-border)]">
              <table className="ues-table" style={{ tableLayout: "fixed", minWidth: 980 }}>
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Номенклатура</th>
                    <th className="num">Количество</th>
                    <th>Ед.</th>
                    <th className="num">Цена</th>
                    <th className="num">На склад</th>
                    <th className="num">Сумма</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const c = computeLine(l);
                    const fabric = l.itemType === "fabric" ? fabricById.get(l.itemId) : undefined;
                    const component = l.itemType === "component" ? componentById.get(l.itemId) : undefined;
                    const w = fabricWidthMeters(fabric);
                    return (
                      <tr key={l.key}>
                        <td className="ues-muted">{i + 1}</td>
                        <td>
                          <select
                            className={cn("ues-input h-8 w-full", editable, errors[`${l.key}:item`] && "border-[var(--ues-danger)]")}
                            value={l.itemId}
                            onChange={(e) => update(l.key, { itemId: e.target.value })}
                            data-testid={`select-line-item-${i}`}
                          >
                            <option value="">{l.itemType === "fabric" ? "Выберите ткань" : "Выберите комплектующее"}</option>
                            {(l.itemType === "fabric" ? fabrics : components).map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}
                              </option>
                            ))}
                          </select>
                          {errors[`${l.key}:item`] && (
                            <small className="text-[11.5px] text-[var(--ues-danger)]">{errors[`${l.key}:item`]}</small>
                          )}
                          {fabric && w > 0 && (
                            <small className="block text-[11.5px] text-[var(--ues-muted)]">рулон {fmtQty(w)} м</small>
                          )}
                        </td>
                        <td>
                          <input
                            inputMode="decimal"
                            className={cn("ues-input h-8 w-full text-right font-semibold tabular-nums", editable, errors[`${l.key}:qty`] && "border-[var(--ues-danger)]")}
                            value={l.qtyInput}
                            placeholder="0"
                            onChange={(e) => update(l.key, { qtyInput: e.target.value.replace(/[^\d,.]/g, "") })}
                            data-testid={`input-line-qty-${i}`}
                          />
                        </td>
                        <td className="ues-muted">{l.itemType === "fabric" ? "п.м." : component?.unit || "шт"}</td>
                        <td>
                          <input
                            inputMode="decimal"
                            className={cn("ues-input h-8 w-full text-right font-semibold tabular-nums", editable)}
                            value={l.priceInput}
                            placeholder="0,00"
                            onChange={(e) => update(l.key, { priceInput: e.target.value.replace(/[^\d,.]/g, "") })}
                            data-testid={`input-line-price-${i}`}
                          />
                        </td>
                        <td className="num ues-muted">
                          {l.itemType === "fabric"
                            ? c.ok && l.itemId
                              ? `${fmtQty(c.quantity)} м²`
                              : "—"
                            : `${fmtQty(c.quantity)} ${component?.unit || "шт"}`}
                        </td>
                        <td className="num font-semibold">{fmtMoney(parseFloat(c.total))}</td>
                        <td>
                          <button
                            type="button"
                            className="ues-expander"
                            title="Удалить строку"
                            onClick={() => {
                              setLines((ls) => ls.filter((x) => x.key !== l.key));
                              setDirty(true);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="ues-muted py-4 text-center">
                        Добавьте ткань или комплектующее
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Итого</td>
                    <td className="num">{fmtMoney(docTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="px-4 py-2 text-[12px] text-[var(--ues-muted)]">
              Ткань: количество и цена — за погонный метр; на склад поступает в м² по ширине рулона.
            </p>
          </section>

          <section className="ues-fieldset">
            <div className="ues-fieldset-title">Комментарий</div>
            <textarea
              className={cn("ues-input min-h-[60px] w-full py-2", editable)}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setDirty(true);
              }}
              placeholder="Например: счёт №123 от поставщика"
            />
          </section>
        </div>
      )}
    </Layout>
  );
}
