// Форма денежного документа по шаблону УЭС (ПКО / РКО / ПД):
// «Основное» (дата, касса, сумма, статья) + «Платёж» (вид операции, контрагент, его долг).
// Маршруты: /finance/new/:kind и /finance/doc/:id.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Check, CheckCheck, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { fmtDate, fmtMoney, todayKey } from "@/components/ues/report-kit";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWorkspaceTabs, currentFullPath } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";
import {
  OPERATION_TYPE_HINTS,
  counterpartyFor,
  resolveOperationType,
} from "@shared/finance";
import {
  EXPENSE_OPERATION_TYPES,
  INCOME_OPERATION_TYPES,
  type Cashbox,
  type Dealer,
  type ExpenseType,
  type FinanceOperation,
  type Supplier,
} from "@shared/schema";
import { docCode } from "./journal";

type Kind = "income" | "expense" | "transfer";

interface Form {
  date: string;
  amount: string;
  cashboxId: string;
  fromCashboxId: string;
  toCashboxId: string;
  operationType: string;
  dealerId: string;
  supplierId: string;
  expenseTypeId: string;
  comment: string;
}

// Стабильные пустые списки: новый [] на каждой отрисовке перезапускал эффекты формы.
const NO_CASHBOXES: Cashbox[] = [];
const NO_DEALERS: Dealer[] = [];
const NO_SUPPLIERS: Supplier[] = [];
const NO_EXPENSE_TYPES: ExpenseType[] = [];

const EMPTY: Form = {
  date: "",
  amount: "",
  cashboxId: "",
  fromCashboxId: "",
  toCashboxId: "",
  operationType: "",
  dealerId: "",
  supplierId: "",
  expenseTypeId: "",
  comment: "",
};

const TITLES: Record<Kind, { name: string; caption: string; journal: string }> = {
  income: { name: "Приходный кассовый ордер", caption: "Финансы · ПКО", journal: "/finance/income" },
  expense: { name: "Расходный кассовый ордер", caption: "Финансы · РКО", journal: "/finance/expense" },
  transfer: { name: "Перемещение денег", caption: "Финансы · ПД", journal: "/finance/transfers" },
};

function kindOf(op: Pick<FinanceOperation, "type">): Kind {
  return op.type === "income" ? "income" : op.type === "transfer" ? "transfer" : "expense";
}

/** Сумма с пробелами между разрядами, как GroupedNumberInput в УЭС. */
function groupDigits(v: string) {
  const [int, frac] = v.replace(/\s/g, "").replace(".", ",").split(",");
  const grouped = (int || "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac !== undefined ? `${grouped},${frac}` : grouped;
}

function Field({
  label,
  required,
  error,
  children,
  wide,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <span className="ues-field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error && <small className="text-[12px] text-[var(--ues-danger)]">{error}</small>}
    </label>
  );
}

const inputCls = "ues-input h-9 w-full";
const editableCls =
  "bg-[var(--ues-primary-soft-hover)] border-[var(--ues-primary-border)] shadow-[inset_3px_0_0_var(--ues-primary)]";

export default function FinanceDocumentPage() {
  const params = useParams<{ id?: string; kind?: string }>();
  const isNew = !params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { close } = useWorkspaceTabs();

  const { data: existing, isLoading: loadingDoc, error: docError } = useQuery<FinanceOperation>({
    queryKey: ["/api/finance", params.id],
    enabled: !isNew,
  });

  const kind: Kind = existing
    ? kindOf(existing)
    : params.kind === "expense" || params.kind === "transfer"
      ? params.kind
      : "income";

  const { data: cashboxes = NO_CASHBOXES } = useQuery<Cashbox[]>({ queryKey: ["/api/cashboxes"] });
  const { data: dealers = NO_DEALERS } = useQuery<Dealer[]>({ queryKey: ["/api/dealers"] });
  const { data: suppliers = NO_SUPPLIERS } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: expenseTypes = NO_EXPENSE_TYPES, isFetched: expenseTypesFetched } = useQuery<ExpenseType[]>({
    queryKey: ["/api/expense-types"],
  });

  const [form, setForm] = useState<Form>(() => ({ ...EMPTY, date: todayKey() }));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  // Заполняем форму один раз на документ — поздняя загрузка справочников
  // не должна стирать то, что пользователь уже ввёл.
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || !expenseTypesFetched) return;
    if (initializedFor.current === existing.id) return;
    initializedFor.current = existing.id;
    setForm({
      date: existing.date,
      amount: String(parseFloat(existing.amount)),
      cashboxId: existing.cashboxId ?? "",
      fromCashboxId: existing.fromCashboxId ?? "",
      toCashboxId: existing.toCashboxId ?? "",
      operationType:
        existing.type === "transfer"
          ? ""
          : resolveOperationType(existing, expenseTypes.find((e) => e.id === existing.expenseTypeId)),
      dealerId: existing.dealerId ?? "",
      supplierId: existing.supplierId ?? "",
      expenseTypeId: existing.expenseTypeId ?? "",
      comment: existing.comment ?? "",
    });
    setDirty(false);
  }, [existing, expenseTypes, expenseTypesFetched]);

  // Новый документ: вид операции по умолчанию для своего вида документа.
  useEffect(() => {
    if (!isNew) return;
    initializedFor.current = null;
    // Предзаполнение из ссылки (кнопка «ПКО» в журнале заказов).
    const q = new URLSearchParams(window.location.search);
    const preset = q.get("operationType");
    const allowed: readonly string[] =
      kind === "income" ? INCOME_OPERATION_TYPES : kind === "expense" ? EXPENSE_OPERATION_TYPES : [];
    setForm({
      ...EMPTY,
      date: todayKey(),
      operationType:
        preset && allowed.includes(preset)
          ? preset
          : kind === "income"
            ? "Оплата от покупателя"
            : kind === "expense"
              ? "Операционные расходы"
              : "",
      amount: q.get("amount") && Number(q.get("amount")) > 0 ? String(Number(q.get("amount"))) : "",
      dealerId: q.get("dealerId") ?? "",
      supplierId: q.get("supplierId") ?? "",
      comment: q.get("comment") ?? "",
    });
    setDirty(false);
  }, [isNew, kind]);

  // Кассы подставляем, только когда поле ещё пустое.
  useEffect(() => {
    if (!isNew || cashboxes.length === 0) return;
    setForm((f) => ({
      ...f,
      cashboxId: f.cashboxId || cashboxes[0].id,
      fromCashboxId: f.fromCashboxId || cashboxes[0].id,
      toCashboxId: f.toCashboxId || cashboxes[1]?.id || "",
    }));
  }, [isNew, cashboxes]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const operationTypes: readonly string[] =
    kind === "income" ? INCOME_OPERATION_TYPES : kind === "expense" ? EXPENSE_OPERATION_TYPES : [];
  const party = counterpartyFor(form.operationType);
  const direction = kind === "income" ? "income" : "expense";
  const articles = expenseTypes.filter((e) => e.direction === direction);

  // Долг выбранного контрагента на дату документа.
  const { data: settlements } = useQuery<{
    dealers: { id: string; balance: number }[];
    suppliers: { id: string; balance: number }[];
  }>({
    queryKey: ["/api/reports/settlements", form.date],
    queryFn: async () => {
      const r = await fetch(`/api/reports/settlements?asOf=${form.date}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    enabled: !!party && /^\d{4}-\d{2}-\d{2}$/.test(form.date),
  });
  const partyBalance = useMemo(() => {
    if (!settlements || !party) return null;
    const list = party === "dealer" ? settlements.dealers : settlements.suppliers;
    const id = party === "dealer" ? form.dealerId : form.supplierId;
    return id ? (list.find((s) => s.id === id)?.balance ?? 0) : null;
  }, [settlements, party, form.dealerId, form.supplierId]);

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    const amount = parseFloat(form.amount.replace(/\s/g, "").replace(",", "."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) e.date = "Укажите дату";
    if (!Number.isFinite(amount) || amount <= 0) e.amount = "Сумма должна быть больше нуля";
    if (kind === "transfer") {
      if (!form.fromCashboxId) e.fromCashboxId = "Выберите кассу-отправителя";
      if (!form.toCashboxId) e.toCashboxId = "Выберите кассу-получателя";
      if (form.fromCashboxId && form.fromCashboxId === form.toCashboxId) e.toCashboxId = "Кассы должны различаться";
    } else {
      if (!form.cashboxId) e.cashboxId = "Выберите кассу";
      if (!form.operationType) e.operationType = "Выберите вид операции";
      if (party === "supplier" && !form.supplierId) e.supplierId = "Выберите поставщика";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = () => {
    const amount = parseFloat(form.amount.replace(/\s/g, "").replace(",", ".")).toFixed(2);
    if (kind === "transfer") {
      return {
        type: "transfer",
        amount,
        date: form.date,
        cashboxId: null,
        fromCashboxId: form.fromCashboxId,
        toCashboxId: form.toCashboxId,
        dealerId: null,
        supplierId: null,
        expenseTypeId: null,
        operationType: null,
        comment: form.comment || null,
      };
    }
    // «Оплата поставщику» хранится прежним типом supplier_payment — на него
    // опираются расчёты с поставщиками во всех старых отчётах.
    const type =
      kind === "income" ? "income" : form.operationType === "Оплата поставщику" ? "supplier_payment" : "expense";
    return {
      type,
      amount,
      date: form.date,
      cashboxId: form.cashboxId,
      fromCashboxId: null,
      toCashboxId: null,
      dealerId: party === "dealer" ? form.dealerId || null : null,
      supplierId: party === "supplier" ? form.supplierId : null,
      expenseTypeId: form.expenseTypeId || null,
      operationType: type === "supplier_payment" ? null : form.operationType,
      comment: form.comment || null,
    };
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/pnl"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/cash-flow"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/settlements"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
  };

  const save = useMutation({
    mutationFn: async (andClose: boolean) => {
      const res = isNew
        ? await apiRequest("POST", "/api/finance", payload())
        : await apiRequest("PATCH", `/api/finance/${params.id}`, payload());
      return { op: (await res.json()) as FinanceOperation, andClose };
    },
    onSuccess: ({ op, andClose }) => {
      invalidateAll();
      setDirty(false);
      toast({ title: isNew ? "Документ проведён" : "Изменения проведены" });
      const here = currentFullPath();
      if (andClose) {
        close(here, { silent: true });
        navigate(TITLES[kind].journal);
      } else if (isNew) {
        // Вкладка «новый документ» превращается во вкладку проведённого документа.
        close(here, { silent: true });
        navigate(`/finance/doc/${op.id}`);
      }
    },
    onError: (e: Error) => toast({ title: "Не удалось провести", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/finance/${params.id}`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Документ помечен на удаление" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const restore = useMutation({
    mutationFn: () => apiRequest("POST", `/api/finance/${params.id}/restore`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Документ восстановлен" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deletedDoc = !!existing?.isDraft;
  const submit = (andClose: boolean) => {
    if (deletedDoc || save.isPending) return;
    if (validate()) save.mutate(andClose);
  };

  // Ctrl+S — провести.
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

  // Предупреждение о несохранённых изменениях при закрытии страницы.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const t = TITLES[kind];
  const deleted = !!existing?.isDraft;
  const title = isNew
    ? `${t.name} (новый)`
    : existing
      ? `${docCode(existing)} от ${fmtDate(existing.date)}`
      : t.name;

  if (!isNew && docError) {
    return (
      <Layout title="Документ не найден" caption="Финансы">
        <p className="text-[13px] text-[var(--ues-muted)]">Документ удалён или принадлежит другому пользователю.</p>
      </Layout>
    );
  }

  const busy = save.isPending || remove.isPending || restore.isPending;
  const sel = (key: keyof Form, value: string, options: { id: string; name: string }[], placeholder: string) => (
    <select
      className={cn(inputCls, editableCls, errors[key] && "border-[var(--ues-danger)]")}
      value={value}
      onChange={(e) => set(key, e.target.value)}
      disabled={deleted}
      data-testid={`select-${key}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );

  return (
    <Layout
      title={title}
      caption={t.caption}
      actions={
        !isNew && existing ? (
          <span className={cn("ues-status", deleted && "is-deleted")}>{deleted ? "Помечен на удаление" : "Проведён"}</span>
        ) : (
          <span className="ues-status is-draft">Новый</span>
        )
      }
    >
      {!isNew && loadingDoc ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ues-muted)]" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="ues-toolbar">
            {!deleted && (
              <>
                <button
                  type="button"
                  className="ues-btn success"
                  onClick={() => submit(true)}
                  disabled={busy}
                  data-testid="button-post-close"
                >
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                  Провести и закрыть
                </button>
                <button
                  type="button"
                  className="ues-btn soft-success"
                  onClick={() => submit(false)}
                  disabled={busy}
                  data-testid="button-post"
                >
                  <Check className="h-4 w-4" />
                  Провести
                </button>
              </>
            )}
            {!isNew && existing && (
              <>
                <span className="ues-toolbar-sep" />
                {deleted ? (
                  <button type="button" className="ues-btn" onClick={() => restore.mutate()} disabled={busy}>
                    <RotateCcw className="h-4 w-4" />
                    Восстановить
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ues-btn danger"
                    onClick={() => remove.mutate()}
                    disabled={busy}
                    data-testid="button-delete-document"
                  >
                    <Trash2 className="h-4 w-4" />
                    Пометить на удаление
                  </button>
                )}
              </>
            )}
            <span className="ml-auto text-[12px] text-[var(--ues-muted)]">
              {dirty ? "Есть непроведённые изменения · " : ""}Ctrl+S — провести
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {kind === "transfer" ? (
              <>
                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Отправитель</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Дата" required error={errors.date}>
                      <input
                        type="date"
                        className={cn(inputCls, editableCls)}
                        value={form.date}
                        onChange={(e) => set("date", e.target.value)}
                        disabled={deleted}
                        data-testid="input-date"
                      />
                    </Field>
                    <Field label="Касса-отправитель" required error={errors.fromCashboxId}>
                      {sel("fromCashboxId", form.fromCashboxId, cashboxes, "Выберите кассу")}
                    </Field>
                  </div>
                </section>
                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Получатель</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Касса-получатель" required error={errors.toCashboxId}>
                      {sel("toCashboxId", form.toCashboxId, cashboxes, "Выберите кассу")}
                    </Field>
                    <Field label="Сумма" required error={errors.amount}>
                      <input
                        inputMode="decimal"
                        className={cn(inputCls, editableCls, "text-right font-semibold tabular-nums")}
                        value={groupDigits(form.amount)}
                        placeholder="0,00"
                        onChange={(e) => set("amount", e.target.value.replace(/[^\d,.\s]/g, ""))}
                        disabled={deleted}
                        data-testid="input-amount"
                      />
                    </Field>
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Основное</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Дата" required error={errors.date}>
                      <input
                        type="date"
                        className={cn(inputCls, editableCls)}
                        value={form.date}
                        onChange={(e) => set("date", e.target.value)}
                        disabled={deleted}
                        data-testid="input-date"
                      />
                    </Field>
                    <Field label="Касса" required error={errors.cashboxId}>
                      {sel("cashboxId", form.cashboxId, cashboxes, "Выберите кассу")}
                    </Field>
                    <Field label="Сумма" required error={errors.amount}>
                      <input
                        inputMode="decimal"
                        className={cn(inputCls, editableCls, "text-right font-semibold tabular-nums")}
                        value={groupDigits(form.amount)}
                        placeholder="0,00"
                        onChange={(e) => set("amount", e.target.value.replace(/[^\d,.\s]/g, ""))}
                        disabled={deleted}
                        data-testid="input-amount"
                      />
                    </Field>
                    <Field label={kind === "income" ? "Статья доходов" : "Статья расходов"}>
                      <select
                        className={cn(inputCls, editableCls)}
                        value={form.expenseTypeId}
                        onChange={(e) => {
                          const id = e.target.value;
                          set("expenseTypeId", id);
                          // Статья с видом операции по умолчанию подставляет его.
                          const art = articles.find((a) => a.id === id);
                          if (art?.operationType && operationTypes.includes(art.operationType)) {
                            set("operationType", art.operationType);
                          }
                        }}
                        disabled={deleted}
                        data-testid="select-expenseTypeId"
                      >
                        <option value="">Без статьи</option>
                        {articles.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </section>

                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Платёж</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Вид операции" required error={errors.operationType} wide={!party}>
                      <select
                        className={cn(inputCls, editableCls, errors.operationType && "border-[var(--ues-danger)]")}
                        value={form.operationType}
                        onChange={(e) => set("operationType", e.target.value)}
                        disabled={deleted}
                        data-testid="select-operationType"
                      >
                        <option value="">Выберите вид операции</option>
                        {operationTypes.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {party === "dealer" && (
                      <Field label="Дилер" error={errors.dealerId}>
                        {sel(
                          "dealerId",
                          form.dealerId,
                          dealers.map((d) => ({ id: d.id, name: d.fullName })),
                          "Без дилера (розница)"
                        )}
                      </Field>
                    )}
                    {party === "supplier" && (
                      <Field label="Поставщик" required error={errors.supplierId}>
                        {sel("supplierId", form.supplierId, suppliers, "Выберите поставщика")}
                      </Field>
                    )}
                  </div>
                  {form.operationType && OPERATION_TYPE_HINTS[form.operationType] && (
                    <p className="mt-3 text-[12px] text-[var(--ues-muted)]">{OPERATION_TYPE_HINTS[form.operationType]}</p>
                  )}
                  {party && partyBalance !== null && (
                    <div className="mt-3 rounded-[10px] bg-[var(--ues-surface-soft)] px-3 py-2 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[var(--ues-muted)]">
                          {party === "dealer"
                            ? partyBalance >= 0
                              ? "Долг дилера на дату"
                              : "Аванс дилера на дату"
                            : partyBalance >= 0
                              ? "Наш долг поставщику на дату"
                              : "Аванс поставщику на дату"}
                        </span>
                        <span className={cn("font-semibold tabular-nums", partyBalance > 0 && party === "dealer" && "ues-neg")}>
                          {fmtMoney(Math.abs(partyBalance))}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--ues-muted)]">
                        По отгруженным заказам и проведённым платежам
                        {!isNew ? ", включая этот документ" : ""}.
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          <section className="ues-fieldset">
            <div className="ues-fieldset-title">Комментарий</div>
            <textarea
              className={cn("ues-input min-h-[70px] w-full py-2", editableCls)}
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
              disabled={deleted}
              placeholder="Например: оплата по заказу №1012"
              data-testid="input-comment"
            />
          </section>
        </div>
      )}
    </Layout>
  );
}
