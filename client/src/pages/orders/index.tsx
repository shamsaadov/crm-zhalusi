import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { type Dealer, type Cashbox } from "@shared/schema";
import { format } from "date-fns";

import type {
  OrderWithRelations,
  FabricWithStock,
  ComponentWithStock,
} from "./types";
import { productFormSchema, type ProductFormValues } from "./schemas";
import { OrdersJournal } from "./journal";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { CuttingDialog } from "./cutting-dialog";
import { ProductForm } from "./product-form";
import { printInvoice, printCustomerInvoice } from "./utils";
import { AppMeasurementsTab } from "./app-measurements-tab";
import { MEASUREMENT_KEY } from "./document";

const emptyProduct = (): ProductFormValues => ({
  date: format(new Date(), "yyyy-MM-dd"),
  dealerId: "",
  status: "Новый",
  salePrice: "",
  costPrice: "",
  comment: "",
  isPaid: false,
  cashboxId: "",
  components: [{ componentId: "", quantity: "1" }],
});

// Журнал «Заказы покупателей» (ЗП). Документ открывается отдельной страницей
// (/orders/doc/:id, /orders/new); здесь — только окно заказа товара.
export default function OrdersPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProductOpen, setIsProductOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderWithRelations | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  // Показывать помеченные на удаление заказы (с крестиком), как в журналах УЭС.
  const [showMarked, setShowMarked] = useState(false);
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    "all" | "sash" | "product" | "app"
  >("all");
  const [showCuttingDialog, setShowCuttingDialog] = useState(false);
  const [cuttingOrderId, setCuttingOrderId] = useState<string | null>(null);
  const [cuttingOrderNumber, setCuttingOrderNumber] = useState<number | undefined>();
  const [showProfit, setShowProfit] = useState(() => sessionStorage.getItem("forsa-show-profit") === "true");
  const [profitPasswordInput, setProfitPasswordInput] = useState("");
  const [profitUnlocking, setProfitUnlocking] = useState(false);

  // Data fetching
  const {
    data: ordersData,
    isLoading: ordersLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{
    data: OrderWithRelations[];
    nextCursor: string | null;
    hasMore: boolean;
  }>({
    queryKey: [
      "/api/orders",
      {
        paginated: true,
        status: statusFilter,
        dealerId: dealerFilter,
        from: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "",
        to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "",
        search: debouncedSearch,
        orderType: orderTypeFilter,
        showMarked,
      },
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ paginated: "true", limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dealerFilter !== "all") params.set("dealerId", dealerFilter);
      if (dateRange.from)
        params.set("from", format(dateRange.from, "yyyy-MM-dd"));
      if (dateRange.to) params.set("to", format(dateRange.to, "yyyy-MM-dd"));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (orderTypeFilter !== "all") params.set("orderType", orderTypeFilter);
      if (showMarked) params.set("deleted", "include");
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/orders?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const orders = useMemo(() => {
    return ordersData?.pages.flatMap((page) => page.data) ?? [];
  }, [ordersData]);

  const { loadMoreRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const { data: dealers = [] } = useQuery<(Dealer & { balance: number })[]>({
    queryKey: ["/api/dealers"],
  });
  const { data: stockData } = useQuery<{
    fabrics: FabricWithStock[];
    components: ComponentWithStock[];
  }>({
    queryKey: ["/api/stock"],
  });
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({
    queryKey: ["/api/cashboxes"],
  });

  // Pending app-measurements count for the tab badge
  const { data: appMeasurements = [] } = useQuery<{ id: string; status: string | null; orderId: string | null }[]>({
    queryKey: ["/api/app-measurements"],
  });
  const pendingAppCount = appMeasurements.filter(
    (m) => m.status === "pending" && !m.orderId
  ).length;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/app-measurements"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/dealers"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/systems"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/stock"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const fabricStock = stockData?.fabrics || [];

  // В новом заказе товара помеченные на удаление записи не предлагаем.
  const formDealers = dealers.filter((x) => !x.deletedAt);
  const formCashboxes = cashboxes.filter((x) => !x.deletedAt);
  const componentStock = stockData?.components || [];

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: emptyProduct(),
  });

  const productFieldArray = useFieldArray({
    control: productForm.control,
    name: "components",
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
      setIsDeleteDialogOpen(false);
      setOrderToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/deletions"] });
      for (const k of ["/api/reports/pnl", "/api/reports/balance", "/api/reports/settlements", "/api/warehouse/writeoffs"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast({ title: "Заказ помечен на удаление" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
      for (const k of ["/api/reports/pnl", "/api/reports/balance", "/api/reports/settlements", "/api/warehouse/writeoffs"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast({ title: "Статус обновлен" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: (data: ProductFormValues) =>
      apiRequest("POST", "/api/orders/product", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
      if (variables.isPaid) {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      }
      setIsProductOpen(false);
      productForm.reset();
      toast({ title: "Успешно", description: "Заказ товара создан" });
    },
    onError: (error: Error | ApiError) => {
      if (error instanceof ApiError && error.stockError && error.errors) {
        toast({
          title: "Недостаточно товара на складе",
          description: error.errors.join("\n"),
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Ошибка",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const openDeleteDialog = (order: OrderWithRelations) => {
    setOrderToDelete(order);
    setIsDeleteDialogOpen(true);
  };

  // /orders?open=<id> и ?edit=<id> (ссылки из отчётов, канбана, списаний) → документ заказа.
  const urlSearch = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(urlSearch);
    const id = params.get("open") || params.get("edit");
    if (id) setLocation(`/orders/doc/${id}`, { replace: true });
  }, [urlSearch, setLocation]);

  // Auto-calculate product cost price effect
  useEffect(() => {
    const subscription = productForm.watch((value, { name }) => {
      if (name && name.includes("components")) {
        const components = value.components || [];
        let totalCost = 0;

        for (const comp of components) {
          if (comp && comp.componentId && comp.quantity) {
            const compStock = componentStock.find(
              (c) => c.id === comp.componentId
            );
            if (compStock?.stock?.avgPrice && compStock.stock.avgPrice > 0) {
              const qty = parseFloat(comp.quantity || "0");
              totalCost += compStock.stock.avgPrice * qty;
            }
          }
        }

        const currentCostPrice = parseFloat(value.costPrice || "0");
        if (Math.abs(totalCost - currentCostPrice) > 0.01) {
          productForm.setValue("costPrice", totalCost.toFixed(2), {
            shouldValidate: false,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [productForm, componentStock]);

  // Filtering
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const handleUnlockProfit = async () => {
    setProfitUnlocking(true);
    try {
      const res = await fetch("/api/verify-report-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: profitPasswordInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setShowProfit(true);
        sessionStorage.setItem("forsa-show-profit", "true");
        setProfitPasswordInput("");
      } else {
        toast({ title: "Неверный пароль", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка проверки", variant: "destructive" });
    }
    setProfitUnlocking(false);
  };

  return (
    <Layout
      title="Заказы покупателей"
      caption="Журнал документов · ЗП"
      wide
      actions={!showProfit ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Прибыль
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Введите пароль</p>
                <Input
                  type="password"
                  placeholder="Пароль"
                  value={profitPasswordInput}
                  onChange={(e) => setProfitPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlockProfit()}
                  className="h-8"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={profitUnlocking || !profitPasswordInput}
                  onClick={handleUnlockProfit}
                >
                  Показать
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-green-600"
            onClick={() => {
              setShowProfit(false);
              sessionStorage.removeItem("forsa-show-profit");
            }}
          >
            <Unlock className="h-3.5 w-3.5" />
            Скрыть прибыль
          </Button>
        )}
    >
      <Dialog open={isProductOpen} onOpenChange={setIsProductOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Заказ товара (комплектующие)</DialogTitle>
          </DialogHeader>
          <ProductForm
            form={productForm}
            fieldArray={productFieldArray}
            dealers={formDealers}
            componentStock={componentStock}
            cashboxes={formCashboxes}
            isPending={createProductMutation.isPending}
            onSubmit={(data) => createProductMutation.mutate(data)}
            onCancel={() => setIsProductOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <OrdersJournal
        orders={orders}
        isLoading={ordersLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        loadMoreRef={loadMoreRef}
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        dealerFilter={dealerFilter}
        onDealerFilterChange={setDealerFilter}
        orderTypeFilter={orderTypeFilter}
        onOrderTypeFilterChange={setOrderTypeFilter}
        pendingAppCount={pendingAppCount}
        dealers={dealers}
        fabricStock={fabricStock}
        showProfit={showProfit}
        onCreate={() => setLocation("/orders/new")}
        onCreateProduct={() => {
          productForm.reset(emptyProduct());
          setIsProductOpen(true);
        }}
        onOpen={(o) => setLocation(`/orders/doc/${o.id}`)}
        onSendToProduction={async (list) => {
          let sent = 0;
          for (const o of list) {
            try {
              const r = await (await apiRequest("POST", `/api/orders/${o.id}/production/send`, {})).json();
              sent += r.sent ?? 0;
            } catch (e) {
              toast({ title: `Заказ №${o.orderNumber}`, description: (e as Error).message, variant: "destructive" });
            }
          }
          for (const k of ["/api/orders", "/api/production", "/api/dealers", "/api/dashboard"]) {
            queryClient.invalidateQueries({ queryKey: [k] });
          }
          if (sent) toast({ title: `Передано в производство: ${sent} изд.` });
        }}
        onCutting={(order) => {
          setCuttingOrderId(order.id);
          setCuttingOrderNumber(order.orderNumber);
          setShowCuttingDialog(true);
        }}
        onWorkshopPrint={printInvoice}
        onCustomerPrint={printCustomerInvoice}
        onDelete={openDeleteDialog}
        onStatusChange={(id, status) => updateStatusMutation.mutateAsync({ id, status }).catch(() => undefined)}
        onReceipt={(order) => {
          // ПКО по заказу: дилер, остаток к оплате и номер заказа в комментарии
          // (по комментарию оплата розничного заказа находит свой заказ).
          const rest = Math.max(0, parseFloat(order.salePrice?.toString() || "0") - (order.paidAmount ?? 0));
          const q = new URLSearchParams({
            operationType: "Оплата от покупателя",
            amount: rest.toFixed(2),
            comment: `Оплата заказа №${order.orderNumber}`,
          });
          if (order.dealerId) q.set("dealerId", order.dealerId);
          setLocation(`/finance/new/income?${q}`);
        }}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        showMarked={showMarked}
        onShowMarkedChange={setShowMarked}
        onRestore={async (order) => {
          try {
            await apiRequest("POST", `/api/deletions/orders/${order.id}/restore`);
            for (const k of ["/api/orders", "/api/stock", "/api/dealers", "/api/deletions", "/api/dashboard", "/api/reports/pnl", "/api/reports/balance", "/api/reports/settlements", "/api/warehouse/writeoffs"]) {
              queryClient.invalidateQueries({ queryKey: [k] });
            }
            toast({ title: `Пометка с заказа №${order.orderNumber} снята` });
          } catch (e) {
            toast({ title: "Ошибка", description: (e as Error).message, variant: "destructive" });
          }
        }}
        appTab={
          <AppMeasurementsTab
            onConvertToOrder={(m) => {
              // Документ ЗП заберёт замер из sessionStorage и заполнит створки.
              sessionStorage.setItem(MEASUREMENT_KEY, JSON.stringify(m));
              setLocation(`/orders/new?measurement=${m.id}`);
            }}
          />
        }
      />

      <DeleteOrderDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        order={orderToDelete}
        onConfirm={() =>
          orderToDelete && deleteMutation.mutate(orderToDelete.id)
        }
        isPending={deleteMutation.isPending}
      />

      <CuttingDialog
        open={showCuttingDialog}
        onOpenChange={setShowCuttingDialog}
        orderId={cuttingOrderId}
        orderNumber={cuttingOrderNumber}
      />
    </Layout>
  );
}
