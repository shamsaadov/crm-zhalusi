// Документ «Заказ покупателя» (ЗП) по образцу ErpDocumentCard в УЭС:
// заголовок со статусом, панель действий (Провести и закрыть · Провести · Печать ·
// Передать в производство · Отгрузить · К ПКО · Ещё), поля «Основное» и «Исполнение»,
// строка итогов, табличная часть «Изделия», подвал (комментарий, автор) и вкладка
// «Связанные документы». Маршруты: /orders/new и /orders/doc/:id.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { Check, CheckCheck, ChevronDown, ExternalLink, Loader2, Pencil, Plus, Printer, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtMoney } from "@/components/ues/report-kit";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { currentFullPath, useWorkspaceTabs } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES, PRODUCTION_PRIORITIES, type Cashbox, type Dealer, type Fabric } from "@shared/schema";
import type { OrderFormValues } from "./schemas";
import type { ComponentWithStock, FabricWithStock, OrderWithRelations, SystemWithComponents } from "./types";
import { useOrderEditor, type MeasurementWithSashes } from "./use-order-editor";
import { OrderLines } from "./order-lines";
import { CostCalculationDialog } from "./cost-calculation-dialog";
import { CuttingDialog } from "./cutting-dialog";
import { printCustomerInvoice, printInvoice } from "./utils";

/** Замер, который журнал передаёт в новый документ (через sessionStorage). */
export const MEASUREMENT_KEY = "order-from-measurement";

interface Related {
  payments: { id: string; date: string; amount: string; isDraft: boolean | null; deletedAt: string | null; comment: string | null }[];
  writeoff: { date: string; lines: number; total: string } | null;
  production: { total: number; sent: number; ready: number; sentAt: string | null; readyAt: string | null };
  shippedAt: string | null;
}

const NO_DEALERS: (Dealer & { balance: number })[] = [];
const NO_SYSTEMS: SystemWithComponents[] = [];
const NO_FABRICS: Fabric[] = [];
const NO_FABRIC_STOCK: FabricWithStock[] = [];
const NO_COMPONENT_STOCK: ComponentWithStock[] = [];

const WRITE_KEYS = [
  "/api/orders",
  "/api/production",
  "/api/stock",
  "/api/dealers",
  "/api/finance",
  "/api/cashboxes",
  "/api/dashboard",
  "/api/reports/pnl",
  "/api/reports/balance",
  "/api/reports/settlements",
  "/api/warehouse/writeoffs",
  "/api/deletions",
];
const invalidateAll = () => WRITE_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

const isProductOrder = (o?: OrderWithRelations) =>
  !!o?.sashes?.length && o.sashes.every((s) => s.componentId && !s.systemId);

export default function OrderDocumentPage() {
  const params = useParams<{ id?: string }>();
  const id = params.id;
  const isNew = !id;
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();
  const { close } = useWorkspaceTabs();
  const [view, setView] = useState<"main" | "related">("main");
  const [sendOpen, setSendOpen] = useState(false);
  const [priority, setPriority] = useState<string>("Обычно");
  const [costOpen, setCostOpen] = useState(false);
  const [cuttingOpen, setCuttingOpen] = useState(false);
  const [quickDealer, setQuickDealer] = useState({ open: false, name: "", phone: "" });
  const measurementRef = useRef<string | null>(null);

  const { data: dealers = NO_DEALERS } = useQuery<(Dealer & { balance: number })[]>({ queryKey: ["/api/dealers"] });
  const systemsQ = useQuery<SystemWithComponents[]>({ queryKey: ["/api/systems"] });
  const fabricsQ = useQuery<Fabric[]>({ queryKey: ["/api/fabrics"] });
  const systems = systemsQ.data ?? NO_SYSTEMS;
  const fabrics = fabricsQ.data ?? NO_FABRICS;
  const catalogsReady = systemsQ.isSuccess && fabricsQ.isSuccess;
  const { data: stock } = useQuery<{ fabrics: FabricWithStock[]; components: ComponentWithStock[] }>({ queryKey: ["/api/stock"] });
  useQuery<Cashbox[]>({ queryKey: ["/api/cashboxes"] });
  const fabricStock = stock?.fabrics ?? NO_FABRIC_STOCK;
  const componentStock = stock?.components ?? NO_COMPONENT_STOCK;

  const {
    data: order,
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery<OrderWithRelations>({
    queryKey: ["/api/orders", id, "doc"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Заказ не найден");
      return res.json();
    },
    enabled: !isNew,
  });

  const { data: related } = useQuery<Related>({
    queryKey: ["/api/orders", id, "related"],
    queryFn: async () => (await apiRequest("GET", `/api/orders/${id}/related`)).json(),
    enabled: !isNew && view === "related",
  });

  // В новом документе помеченные записи справочников не предлагаем.
  const live = <T extends { deletedAt?: Date | string | null }>(list: T[]) => (isNew ? list.filter((x) => !x.deletedAt) : list);
  const formDealers = useMemo(() => live(dealers), [dealers, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const formSystems = useMemo(() => live(systems), [systems, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const formFabrics = useMemo(() => live(fabrics), [fabrics, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useOrderEditor({ dealers, systems, fabrics, fabricStock, componentStock });
  const { form, fieldArray } = editor;
  const dirty = form.formState.isDirty;

  // Заказ с сервера → форма. Пока есть непроведённые правки — их не затираем.
  const loadedAt = useRef(0);
  useEffect(() => {
    if (!order || !catalogsReady || dataUpdatedAt === loadedAt.current) return;
    if (loadedAt.current && form.formState.isDirty) return;
    loadedAt.current = dataUpdatedAt;
    editor.loadOrder(order);
    if (order.productionPriority) setPriority(order.productionPriority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, dataUpdatedAt, catalogsReady]);

  // Новый документ: пустой или из замера мобильного приложения.
  useEffect(() => {
    if (!isNew) return;
    const mid = new URLSearchParams(search).get("measurement");
    if (!mid) {
      if (measurementRef.current !== "") {
        measurementRef.current = "";
        editor.resetNew();
      }
      return;
    }
    if (measurementRef.current === mid || !catalogsReady) return;
    try {
      const raw = sessionStorage.getItem(MEASUREMENT_KEY);
      const m = raw ? (JSON.parse(raw) as MeasurementWithSashes) : null;
      if (m && m.id === mid) {
        measurementRef.current = mid;
        editor.loadMeasurement(m);
      }
    } catch {
      /* замер недоступен — пустой документ */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, search, catalogsReady]);

  const status = order?.status || "Новый";
  const marked = !!order?.deletedAt;
  const shipped = status === "Отгружен";
  const product = isProductOrder(order);
  const locked = marked || shipped;
  const total = order?.productionTotal ?? 0;
  const sent = order?.productionSent ?? 0;
  const ready = order?.productionReady ?? 0;
  const unsent = total - sent;
  const salePrice = parseFloat(form.watch("salePrice") || "0");
  const costPrice = parseFloat(form.watch("costPrice") || "0");
  const dealerId = form.watch("dealerId");
  const dealer = dealers.find((d) => d.id === dealerId);
  const showProfit = typeof window !== "undefined" && sessionStorage.getItem("forsa-show-profit") === "true";

  // ---------- Запись ----------
  const save = useMutation({
    mutationFn: async ({ data, andClose }: { data: OrderFormValues; andClose: boolean }) => {
      if (isNew) {
        const res = await apiRequest("POST", "/api/orders", { ...data, status: "Новый", isPaid: false });
        return { id: ((await res.json()) as { id: string }).id, andClose };
      }
      if (product) {
        // Заказ товара: строки — комплектующие, правим только шапку.
        await apiRequest("PATCH", `/api/orders/${id}`, { date: data.date, dealerId: data.dealerId, comment: data.comment, skipStockValidation: true });
      } else {
        const { status: _s, isPaid: _p, cashboxId: _c, ...rest } = data;
        await apiRequest("PATCH", `/api/orders/${id}`, rest);
      }
      return { id: id!, andClose };
    },
    onSuccess: async ({ id: savedId, andClose }) => {
      const mid = measurementRef.current;
      if (isNew && mid) {
        await apiRequest("POST", `/api/app-measurements/${mid}/convert`, { orderId: savedId }).catch(() => undefined);
        sessionStorage.removeItem(MEASUREMENT_KEY);
        queryClient.invalidateQueries({ queryKey: ["/api/app-measurements"] });
      }
      invalidateAll();
      toast({ title: "Документ записан и проведён" });
      const here = currentFullPath();
      if (andClose) {
        form.reset(form.getValues());
        close(here, { silent: true });
        navigate("/orders");
      } else if (isNew) {
        form.reset(form.getValues());
        close(here, { silent: true });
        navigate(`/orders/doc/${savedId}`);
      } else {
        loadedAt.current = 0; // перечитать строки с id и состоянием производства
        form.reset(form.getValues());
      }
    },
    onError: (e: Error) => {
      const err = e as ApiError;
      toast({
        title: err.stockError ? "Недостаточно материалов на складе" : "Не удалось провести",
        description: err.errors?.join("\n") || e.message,
        variant: "destructive",
        duration: err.stockError ? 10000 : 5000,
      });
    },
  });

  const submit = (andClose: boolean) => {
    if (!isNew && !dirty) {
      if (andClose) {
        close(currentFullPath(), { silent: true });
        navigate("/orders");
      }
      return;
    }
    form.handleSubmit(
      (data) => {
        if (product) return save.mutate({ data, andClose });
        const built = editor.buildPayload(data);
        if ("error" in built) {
          toast({ title: "Нельзя провести", description: built.error, variant: "destructive", duration: 8000 });
          return;
        }
        save.mutate({ data: built.payload, andClose });
      },
      () => {
        toast({ title: "Заполните обязательные поля", variant: "destructive" });
        setTimeout(() => document.querySelector<HTMLElement>(".is-invalid, [aria-invalid='true']")?.focus(), 30);
      }
    )();
  };

  // ---------- Действия по проведённому документу ----------
  const action = useMutation({
    mutationFn: async (fn: () => Promise<Response>) => (await fn()).json().catch(() => ({})),
    onSuccess: () => {
      loadedAt.current = 0;
      invalidateAll();
    },
    onError: (e: Error) => {
      const err = e as ApiError;
      toast({ title: "Не выполнено", description: err.errors?.join("\n") || e.message, variant: "destructive", duration: 8000 });
    },
  });
  const busy = save.isPending || action.isPending;

  const sendToProduction = () =>
    action.mutate(() => apiRequest("POST", `/api/orders/${id}/production/send`, { priority }), {
      onSuccess: (r: { sent?: number }) => {
        setSendOpen(false);
        toast({ title: `Передано в производство: ${r.sent ?? unsent} изд.` });
      },
    });
  const setStatus = (next: string) =>
    action.mutate(() => apiRequest("PATCH", `/api/orders/${id}/status`, { status: next }), {
      onSuccess: () => toast({ title: next === "Отгружен" ? "Заказ отгружен" : `Статус: ${next}` }),
    });
  const toggleMark = () =>
    action.mutate(() => apiRequest("POST", `/api/deletions/orders/${id}/${marked ? "restore" : "mark"}`), {
      onSuccess: () => toast({ title: marked ? "Пометка снята" : "Заказ помечен на удаление" }),
    });
  const changePriority = (p: string) => {
    setPriority(p);
    if (!isNew && sent > 0) action.mutate(() => apiRequest("POST", `/api/orders/${id}/production/priority`, { priority: p }));
  };
  const toReceipt = () => {
    if (!order) return;
    const rest = Math.max(0, parseFloat(order.salePrice?.toString() || "0") - (order.paidAmount ?? 0));
    const q = new URLSearchParams({ operationType: "Оплата от покупателя", amount: rest.toFixed(2), comment: `Оплата заказа №${order.orderNumber}` });
    if (order.dealerId) q.set("dealerId", order.dealerId);
    navigate(`/finance/new/income?${q}`);
  };

  const createDealer = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/dealers", { fullName: quickDealer.name.trim(), phone: quickDealer.phone.trim() || undefined })).json(),
    onSuccess: (d: Dealer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      form.setValue("dealerId", d.id, { shouldDirty: true });
      setQuickDealer({ open: false, name: "", phone: "" });
    },
  });

  // Ctrl+S — провести, как в УЭС.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!locked && !busy) submit(false);
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
      <Layout title="Документ не найден" caption="Продажи · Заказ покупателя">
        <p className="text-[13px] text-[var(--ues-muted)]">Заказ удалён или принадлежит другому пользователю.</p>
      </Layout>
    );
  }

  // ---------- Состояния кнопок (подсказки — почему недоступно) ----------
  const needPosted = isNew ? "Сначала проведите заказ" : dirty ? "Сначала проведите изменения" : marked ? "Заказ помечен на удаление" : null;
  const productionLabel =
    total === 0 ? "Передать в производство" : unsent > 0 && sent > 0 ? `Обновить производство (+${unsent})` : unsent > 0 ? "Передать в производство" : ready >= total ? "Готов с производства" : "Передано";
  const productionBlock =
    needPosted ?? (shipped ? "Заказ отгружен" : product || total === 0 ? "В заказе нет изделий для производства" : unsent === 0 ? (ready >= total ? "Все изделия готовы" : "Все изделия переданы — готовность отмечает цех") : null);
  const readyToShip = status === "Готов" || (product && status !== "Отгружен");
  const shipBlock = needPosted ?? (shipped ? "Заказ уже отгружен" : !readyToShip ? `Сначала производство: готово ${ready} из ${total}` : null);
  const receiptBlock = needPosted ?? ((order?.paymentState ?? "none") === "full" ? "Заказ оплачен полностью" : null);

  const workflow = isNew ? "Новый" : status;
  const title = isNew ? "Заказ покупателя (новый)" : order ? `Заказ покупателя №${order.orderNumber}` : "Заказ покупателя";
  const paid = order?.paidAmount ?? 0;
  const debt = dealer ? -dealer.balance : null;

  return (
    <Layout
      title={title}
      caption="Продажи · Заказ покупателя"
      wide
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {shipped && order?.shippedAt && (
            <span className="ues-shipped-badge">✓ Отгружен · {fmtDate(order.shippedAt)}</span>
          )}
          {(isNew || order) && (
            <span className={cn("ues-status", isNew && "is-draft", marked && "is-deleted")}>
              {isNew ? "Новый" : marked ? "Помечен на удаление" : `Проведен · ${workflow}`}
            </span>
          )}
        </div>
      }
    >
      {!isNew && (isLoading || !order) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ues-muted)]" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Панель действий */}
          <div className="ues-toolbar ues-doc-actions">
            <button type="button" className="ues-btn success" disabled={busy || locked} onClick={() => submit(true)} data-testid="button-post-close">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Провести и закрыть
            </button>
            <button type="button" className="ues-btn soft-success" disabled={busy || locked} onClick={() => submit(false)} data-testid="button-post">
              <Check className="h-4 w-4" />
              Провести
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ues-btn" disabled={!!needPosted} title={needPosted ?? "Печатные формы"}>
                  <Printer className="h-4 w-4" />
                  Печать
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => order && printInvoice(order)}>Технологическая карта (цех)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => order && printCustomerInvoice(order)}>Накладная для клиента</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ues-toolbar-sep" />
            <button
              type="button"
              className={cn("ues-btn production", unsent === 0 && total > 0 && "is-done")}
              disabled={!!productionBlock || busy}
              title={productionBlock ?? `Передать в цех ${unsent} изд.`}
              onClick={() => setSendOpen(true)}
              data-testid="button-send-production"
            >
              <span className="ues-action-icon" aria-hidden="true">⚙</span>
              {productionLabel}
            </button>
            <button
              type="button"
              className="ues-btn ship"
              disabled={!!shipBlock || busy}
              title={shipBlock ?? "Отгрузить заказ покупателю"}
              onClick={() => setStatus("Отгружен")}
              data-testid="button-ship"
            >
              <span className="ues-action-icon" aria-hidden="true">→</span>
              Отгрузить
            </button>
            <button type="button" className="ues-btn soft-success" disabled={!!receiptBlock} title={receiptBlock ?? "Приходный кассовый ордер по заказу"} onClick={toReceipt}>
              <span className="ues-action-icon" aria-hidden="true">К</span>
              К ПКО
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ues-btn">
                  Ещё
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuItem disabled={isNew} onClick={() => setCuttingOpen(true)}>
                  <Scissors className="mr-2 h-4 w-4" />
                  Раскрой ткани
                </DropdownMenuItem>
                <DropdownMenuItem disabled={product} onClick={() => setCostOpen(true)}>
                  Расчёт себестоимости
                </DropdownMenuItem>
                {!isNew && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[12px] text-[var(--ues-muted)]">Статус вручную</DropdownMenuLabel>
                    {ORDER_STATUSES.map((s) => (
                      <DropdownMenuItem key={s} disabled={s === status || !!needPosted} onClick={() => setStatus(s)}>
                        {s === status ? "✓ " : ""}
                        {s}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={marked ? "" : "text-[var(--ues-danger)]"} disabled={dirty} onClick={toggleMark}>
                      {marked ? <RotateCcw className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      {marked ? "Снять пометку удаления" : "Пометить на удаление"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ml-auto text-[12px] text-[var(--ues-muted)]">
              {dirty ? "Есть непроведённые изменения · " : ""}Ctrl+S — провести
            </span>
          </div>

          {locked && !isNew && (
            <div className="ues-doc-banner">
              {marked
                ? "Заказ помечен на удаление: он не участвует в расчётах. Снимите пометку в «Ещё», чтобы изменить."
                : "Заказ отгружен — документ закрыт для изменений. Чтобы исправить, верните статус через «Ещё → Статус вручную»."}
            </div>
          )}

          {!isNew && (
            <div className="ues-doc-tabs" role="tablist">
              <button type="button" role="tab" className={cn(view === "main" && "is-active")} onClick={() => setView("main")}>
                Основное
              </button>
              <button type="button" role="tab" className={cn(view === "related" && "is-active")} onClick={() => setView("related")}>
                Связанные документы
              </button>
            </div>
          )}

          {view === "related" && !isNew && order ? (
            <RelatedDocs order={order} related={related} onOpen={navigate} />
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Основное</div>
                  <div className="ues-doc-grid">
                    <span className="ues-doc-label">Номер</span>
                    <div className="ues-input ues-readonly h-8">{order ? order.orderNumber : "присвоится при проведении"}</div>

                    <span className="ues-doc-label">
                      Дата<span className="req"> *</span>
                    </span>
                    <input
                      type="date"
                      className={cn("ues-input h-8", form.formState.errors.date && "is-invalid")}
                      disabled={locked}
                      {...form.register("date")}
                    />

                    <span className="ues-doc-label">Дилер / покупатель</span>
                    <div>
                      <div className="flex gap-1">
                        <div className="min-w-0 flex-1">
                          <SearchableSelect
                            options={formDealers.map((d) => ({ value: d.id, label: d.fullName }))}
                            value={dealerId}
                            onValueChange={(v) => form.setValue("dealerId", v, { shouldDirty: true })}
                            placeholder="Розница (без дилера)"
                            searchPlaceholder="Поиск дилера..."
                            emptyText="Дилер не найден"
                            disabled={locked}
                            className="h-8"
                          />
                        </div>
                        {dealerId && (
                          <button type="button" className="ues-btn h-8 w-8 !px-0" title="Открыть карточку дилера" onClick={() => navigate(`/lists/dealers/${dealerId}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Popover open={quickDealer.open} onOpenChange={(open) => setQuickDealer((q) => ({ ...q, open }))}>
                          <PopoverTrigger asChild>
                            <button type="button" className="ues-btn h-8 w-8 !px-0" title="Новый дилер" disabled={locked}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 space-y-2 p-3" align="end">
                            <p className="text-sm font-semibold">Новый дилер</p>
                            <input className="ues-input h-8 w-full" placeholder="Имя дилера" value={quickDealer.name} onChange={(e) => setQuickDealer((q) => ({ ...q, name: e.target.value }))} />
                            <input className="ues-input h-8 w-full" placeholder="Телефон" value={quickDealer.phone} onChange={(e) => setQuickDealer((q) => ({ ...q, phone: e.target.value }))} />
                            <button type="button" className="ues-btn primary h-8 w-full justify-center" disabled={!quickDealer.name.trim() || createDealer.isPending} onClick={() => createDealer.mutate()}>
                              {createDealer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
                            </button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="ues-fieldset">
                  <div className="ues-fieldset-title">Исполнение</div>
                  <div className="ues-doc-grid">
                    <span className="ues-doc-label">Статус</span>
                    <div className="ues-input ues-readonly h-8 font-semibold">{workflow}</div>

                    <span className="ues-doc-label">Производство</span>
                    <div className="ues-input ues-readonly h-8">
                      {product
                        ? "Не требуется (товар)"
                        : total === 0
                          ? "—"
                          : sent === 0
                            ? "Не передано"
                            : ready >= total
                              ? `Готово ${total} из ${total}`
                              : `Готово ${ready} из ${total}${unsent ? ` · не передано ${unsent}` : ""}`}
                    </div>

                    <span className="ues-doc-label">Срочность</span>
                    <select className="ues-input h-8" value={priority} disabled={locked || product} onChange={(e) => changePriority(e.target.value)}>
                      {PRODUCTION_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>

                    <span className="ues-doc-label">Оплата</span>
                    <div className="ues-input ues-readonly h-8 tabular-nums">
                      {isNew ? "—" : `${fmtMoney(paid)} из ${fmtMoney(parseFloat(order?.salePrice?.toString() || "0"))}`}
                    </div>
                  </div>
                </section>
              </div>

              {/* Итоги (ues-customer-order-summary) */}
              <div className="ues-doc-summary">
                <div>
                  <span>Сумма документа</span>
                  <strong className="tabular-nums">
                    {editor.isManualSalePrice ? (
                      <input
                        type="number"
                        step="0.01"
                        className="ues-input h-8 w-[150px] text-right font-bold"
                        disabled={locked || product}
                        {...form.register("salePrice")}
                      />
                    ) : (
                      fmtMoney(salePrice)
                    )}
                  </strong>
                  {!locked && !product && (
                    <button
                      type="button"
                      className="ues-link-btn"
                      onClick={() => {
                        if (editor.isManualSalePrice) {
                          const auto = editor.totalOfLines();
                          if (auto > 0) form.setValue("salePrice", auto.toFixed(2), { shouldDirty: true });
                        }
                        editor.setIsManualSalePrice(!editor.isManualSalePrice);
                      }}
                    >
                      {editor.isManualSalePrice ? (
                        <>
                          <RotateCcw className="h-3 w-3" /> по строкам
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3 w-3" /> изменить
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div>
                  <span>Себестоимость</span>
                  <b className="tabular-nums">{fmtMoney(costPrice)}</b>
                </div>
                {showProfit && (
                  <div>
                    <span>Прибыль</span>
                    <b className={cn("tabular-nums", salePrice - costPrice < 0 && "text-[var(--ues-danger)]")}>{fmtMoney(salePrice - costPrice)}</b>
                  </div>
                )}
                <div>
                  <span>Долг с ожидаемыми отгрузками</span>
                  <b className={cn("tabular-nums", debt != null && debt > 0 && "text-[var(--ues-danger)]")}>
                    {debt == null ? "—" : debt < 0 ? `переплата ${fmtMoney(-debt)}` : fmtMoney(debt)}
                  </b>
                </div>
              </div>

              {product ? (
                <ProductLines order={order!} componentStock={componentStock} />
              ) : (
                <OrderLines
                  form={form}
                  fieldArray={fieldArray}
                  systems={formSystems}
                  fabrics={formFabrics}
                  calculatingSashes={editor.calculatingSashes}
                  resetToken={editor.resetToken}
                  saved={!isNew}
                  locked={locked}
                  onRemove={(i) => {
                    editor.cleanupSash(i);
                    fieldArray.remove(i);
                  }}
                />
              )}

              <div className="ues-doc-footer">
                <label>
                  <span className="ues-doc-label">Комментарий</span>
                  <textarea className="ues-input min-h-[34px] py-1.5" rows={2} placeholder="Комментарий к заказу" disabled={marked} {...form.register("comment")} />
                </label>
                <label>
                  <span className="ues-doc-label">Автор</span>
                  <div className="ues-input ues-readonly h-8">{user?.name || user?.email || "—"}</div>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sent > 0 ? "Обновить производство" : "Передать в производство"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <p>
              В цех уйдёт <b>{unsent}</b> {unsent === 1 ? "изделие" : unsent < 5 ? "изделия" : "изделий"} заказа №{order?.orderNumber}
              {sent > 0 ? ` (ещё ${sent} уже в работе)` : ""}. Готовность отмечается в разделе «Производство».
            </p>
            <label className="flex items-center gap-3">
              <span className="ues-field-label w-[90px]">Срочность</span>
              <select className="ues-input h-8 flex-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRODUCTION_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DialogFooter>
            <button type="button" className="ues-btn" onClick={() => setSendOpen(false)}>
              Отмена
            </button>
            <button type="button" className="ues-btn primary" disabled={action.isPending} onClick={sendToProduction}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Передать
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CostCalculationDialog
        open={costOpen}
        onOpenChange={setCostOpen}
        details={editor.costDetails}
        onCostUpdate={async (newCost, fabricOverrides) => {
          form.setValue("costPrice", newCost.toFixed(2), { shouldValidate: false });
          try {
            if (fabricOverrides.length) {
              await Promise.all(fabricOverrides.map((o) => apiRequest("PATCH", `/api/fabrics/${o.fabricId}`, { price: o.price.toFixed(2) })));
              queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
              queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
            }
            if (!isNew) {
              await apiRequest("PATCH", `/api/orders/${id}`, { costPrice: newCost.toFixed(2), skipStockValidation: true });
              queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            }
            toast({ title: "Себестоимость сохранена" });
          } catch (e) {
            toast({ title: "Ошибка сохранения", description: (e as Error).message, variant: "destructive" });
          }
        }}
      />

      <CuttingDialog open={cuttingOpen} onOpenChange={setCuttingOpen} orderId={id ?? null} orderNumber={order?.orderNumber} />
    </Layout>
  );
}

/** Строки заказа товара (комплектующие) — только просмотр. */
function ProductLines({ order, componentStock }: { order: OrderWithRelations; componentStock: ComponentWithStock[] }) {
  const lines = order.sashes ?? [];
  return (
    <section className="ues-erp-lines">
      <div className="ues-erp-lines-toolbar">
        <span className="ues-fieldset-title !mb-0">Товары</span>
        <span className="ues-day-meta">заказ товара: количество — в комментарии, строки меняются только пересозданием заказа</span>
      </div>
      <div className="ues-table-wrap">
        <table className="ues-table">
          <thead>
            <tr>
              <th className="w-[42px]">№</th>
              <th>Номенклатура</th>
              <th className="w-[80px]">Ед.</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((s, i) => {
              const c = componentStock.find((x) => x.id === s.componentId);
              return (
                <tr key={s.id}>
                  <td className="ues-muted">{i + 1}</td>
                  <td>{c?.name ?? "Комплектующая"}</td>
                  <td className="ues-muted">{c?.unit || "шт"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** «Связанные документы»: дерево от заказа (как в УЭС). */
function RelatedDocs({ order, related, onOpen }: { order: OrderWithRelations; related?: Related; onOpen: (to: string) => void }) {
  if (!related) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ues-muted)]" />
      </div>
    );
  }
  const p = related.production;
  const rows: { key: string; icon: string; title: string; meta: string; state: string; good?: boolean; to?: string; marked?: boolean }[] = [];
  for (const pay of related.payments) {
    const off = !!pay.deletedAt || !!pay.isDraft;
    rows.push({
      key: pay.id,
      icon: off ? "×" : "▣",
      title: "Приходный кассовый ордер",
      meta: `от ${fmtDate(pay.date)} · на сумму ${fmtMoney(parseFloat(pay.amount))}`,
      state: off ? "Не проведён" : "Проведён",
      good: !off,
      to: `/finance/doc/${pay.id}`,
      marked: off,
    });
  }
  if (p.sent > 0) {
    rows.push({
      key: "production",
      icon: "⚙",
      title: "Производство",
      meta: `передано ${p.sentAt ? new Date(p.sentAt).toLocaleDateString("ru-RU") : ""} · готово ${p.ready} из ${p.total}`,
      state: p.ready >= p.total ? "Готов" : "В производстве",
      good: p.ready >= p.total,
      to: p.ready >= p.total ? "/production/ready" : "/production",
    });
  }
  if (related.writeoff) {
    rows.push({
      key: "writeoff",
      icon: "▣",
      title: "Списание материалов (выпуск)",
      meta: `от ${fmtDate(related.writeoff.date)} · ${related.writeoff.lines} строк · на сумму ${fmtMoney(parseFloat(related.writeoff.total))}`,
      state: "Проведён",
      good: true,
      to: "/warehouse/writeoffs",
    });
  }
  if (related.shippedAt) {
    rows.push({ key: "ship", icon: "→", title: "Отгрузка покупателю", meta: `от ${fmtDate(related.shippedAt)}`, state: "Проведён", good: true });
  }

  return (
    <div className="ues-linked" role="tree">
      <div className="ues-linked-row is-root" role="treeitem" aria-selected="true">
        <span className="ues-linked-icon">▣</span>
        <b>Заказ покупателя №{order.orderNumber}</b>
        <span className="ues-muted">
          от {fmtDate(order.date)} · на сумму {fmtMoney(parseFloat(order.salePrice?.toString() || "0"))}
        </span>
        <span className="ml-auto font-semibold">{order.status || "Новый"}</span>
      </div>
      {rows.length === 0 && <div className="ues-muted px-4 py-6 text-[13px]">Связанных документов пока нет</div>}
      {rows.map((r) => (
        <div
          key={r.key}
          role="treeitem"
          tabIndex={0}
          className={cn("ues-linked-row is-child", r.to && "is-clickable", r.marked && "is-marked")}
          onDoubleClick={() => r.to && onOpen(r.to)}
          onKeyDown={(e) => e.key === "Enter" && r.to && onOpen(r.to)}
          title={r.to ? "Двойной щелчок — открыть" : undefined}
        >
          <span className={cn("ues-linked-icon", r.marked && "text-[var(--ues-danger)]")}>{r.icon}</span>
          <b>{r.title}</b>
          <span className="ues-muted">{r.meta}</span>
          <span className={cn("ml-auto font-semibold", r.good ? "text-[var(--ues-success)]" : "text-[var(--ues-muted)]")}>{r.state}</span>
        </div>
      ))}
    </div>
  );
}
