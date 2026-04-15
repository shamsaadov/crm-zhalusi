import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { useCoefficientCalculator } from "@/hooks/use-coefficient-calculator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import {
  ORDER_STATUSES,
  type Dealer,
  type Fabric,
  type Cashbox,
} from "@shared/schema";
import { format } from "date-fns";

import type { Measurement, MeasurementSash } from "@shared/schema";
import type {
  OrderWithRelations,
  FabricWithStock,
  ComponentWithStock,
  SystemWithComponents,
  CostCalculationDetails,
} from "./types";
import {
  orderFormSchema,
  productFormSchema,
  type OrderFormValues,
  type ProductFormValues,
} from "./schemas";
import { getOrderColumns } from "./order-columns";
import { ViewOrderDialog } from "./view-order-dialog";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { CostCalculationDialog } from "./cost-calculation-dialog";
import { CuttingDialog } from "./cutting-dialog";
import { OrderForm } from "./order-form";
import { ProductForm } from "./product-form";
import {
  calculateCostPrice,
  printInvoice,
  printCustomerInvoice,
} from "./utils";
import { AppMeasurementsTab } from "./app-measurements-tab";
import { normalizeSashRooms } from "./normalize-sash-rooms";

export default function OrdersPage() {
  const { toast } = useToast();
  const coefficientCalculator = useCoefficientCalculator();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editFromUrl, setEditFromUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"order" | "product">("order");
  const [editingOrder, setEditingOrder] = useState<OrderWithRelations | null>(
    null
  );
  const [viewingOrder, setViewingOrder] = useState<OrderWithRelations | null>(
    null
  );
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderWithRelations | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    "all" | "sash" | "product" | "app"
  >("all");
  const [convertingMeasurementId, setConvertingMeasurementId] = useState<string | null>(null);
  const [showCostCalculation, setShowCostCalculation] = useState(false);
  const [costCalculationDetails, setCostCalculationDetails] =
    useState<CostCalculationDetails | null>(null);
  const [showCuttingDialog, setShowCuttingDialog] = useState(false);
  const [cuttingOrderId, setCuttingOrderId] = useState<string | null>(null);
  const [cuttingOrderNumber, setCuttingOrderNumber] = useState<number | undefined>();
  const [calculatingSashes, setCalculatingSashes] = useState<Set<number>>(
    new Set()
  );
  const [isManualSalePrice, setIsManualSalePrice] = useState(false);
  const [resetToken, setResetToken] = useState(0);
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
  const { data: systems = [] } = useQuery<SystemWithComponents[]>({
    queryKey: ["/api/systems"],
  });
  const { data: fabrics = [] } = useQuery<Fabric[]>({
    queryKey: ["/api/fabrics"],
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

  const fabricStock = stockData?.fabrics || [];
  const componentStock = stockData?.components || [];

  // Form setup
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      isPaid: false,
      cashboxId: "",
      sashes: [
        {
          width: "",
          height: "",
          quantity: "1",
          systemId: "",
          controlSide: "",
          fabricId: "",
          sashPrice: "",
          sashCost: "",
          coefficient: "",
          room: 1,
          roomName: "",
        },
      ],
    },
  });

  const fieldArray = useFieldArray({
    control: form.control,
    name: "sashes",
  });

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      isPaid: false,
      cashboxId: "",
      components: [{ componentId: "", quantity: "1" }],
    },
  });

  const productFieldArray = useFieldArray({
    control: productForm.control,
    name: "components",
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: OrderFormValues) =>
      apiRequest("POST", "/api/orders", data),
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
      // If converting from measurement, mark it
      if (convertingMeasurementId) {
        apiRequest("POST", `/api/app-measurements/${convertingMeasurementId}/convert`).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["/api/app-measurements"] });
        setConvertingMeasurementId(null);
      }
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Успешно", description: "Заказ создан" });
    },
    onError: (error: Error | ApiError) => {
      if (error instanceof ApiError && error.stockError && error.errors) {
        toast({
          title: "Недостаточно материалов на складе",
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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: OrderFormValues }) =>
      apiRequest("PATCH", `/api/orders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
      setIsDialogOpen(false);
      setEditingOrder(null);
      form.reset();
      toast({ title: "Успешно", description: "Заказ обновлен" });
    },
    onError: (error: Error | ApiError) => {
      if (error instanceof ApiError && error.stockError && error.errors) {
        toast({
          title: "Недостаточно материалов на складе",
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
      toast({ title: "Успешно", description: "Заказ удален" });
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
      setIsDialogOpen(false);
      productForm.reset();
      setActiveTab("order");
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

  // Handlers
  const handleSashRemove = useCallback(
    (index: number) => {
      // Очищаем состояние калькулятора для удалённой створки и всех последующих
      // (т.к. индексы сдвигаются после удаления)
      const sashes = form.getValues("sashes");
      for (let i = index; i < sashes.length; i++) {
        coefficientCalculator.cleanupSash(`sash-${i}`);
      }
    },
    [form, coefficientCalculator]
  );

  const onSubmit = (data: OrderFormValues) => {
    // Проверка на отсутствующие коэффициенты (только если система вообще не найдена)
    const invalidSashes = data.sashes.filter((sash) => {
      const width = parseFloat(sash.width || "0");
      const height = parseFloat(sash.height || "0");
      const sashPrice = parseFloat(sash.sashPrice || "0");
      const hasAllData =
        width > 0 && height > 0 && sash.systemId && sash.fabricId;
      return hasAllData && sashPrice === 0;
    });

    if (invalidSashes.length > 0) {
      toast({
        title: "Невозможно создать заказ",
        description: `Обнаружены створки с отсутствующим коэффициентом (${invalidSashes.length} шт.). Система не найдена в файле коэффициентов. Проверьте настройку system_key в справочнике систем.`,
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    // Если включен ручной ввод цены, распределяем её по створкам пропорционально
    let sashesWithDistributedPrice = data.sashes;
    if (isManualSalePrice) {
      const manualSalePrice = parseFloat(data.salePrice || "0");

      // Считаем автоматическую сумму цен створок (с учётом количества)
      const autoTotalPrice = data.sashes.reduce((sum, sash) => {
        const price = parseFloat(sash.sashPrice || "0");
        const qty = parseFloat(sash.quantity || "1");
        return sum + price * qty;
      }, 0);

      console.log("[SUBMIT] isManualSalePrice:", isManualSalePrice);
      console.log("[SUBMIT] manualSalePrice:", manualSalePrice);
      console.log("[SUBMIT] autoTotalPrice:", autoTotalPrice);

      if (manualSalePrice > 0 && autoTotalPrice > 0) {
        // Распределяем пропорционально автоматическим ценам
        const ratio = manualSalePrice / autoTotalPrice;
        console.log("[SUBMIT] ratio:", ratio);
        sashesWithDistributedPrice = data.sashes.map((sash, idx) => {
          const autoPrice = parseFloat(sash.sashPrice || "0");
          const newPrice = autoPrice * ratio;
          console.log(
            `[SUBMIT] sash ${idx}: autoPrice=${autoPrice}, newPrice=${newPrice}`
          );
          return {
            ...sash,
            sashPrice: newPrice.toFixed(2),
          };
        });
      } else if (manualSalePrice > 0) {
        // Если нет автоматических цен, распределяем равномерно по количеству
        const totalQuantity = data.sashes.reduce((sum, sash) => {
          return sum + parseFloat(sash.quantity || "1");
        }, 0);

        if (totalQuantity > 0) {
          const pricePerUnit = manualSalePrice / totalQuantity;
          console.log(
            "[SUBMIT] distributing evenly, pricePerUnit:",
            pricePerUnit
          );
          sashesWithDistributedPrice = data.sashes.map((sash) => ({
            ...sash,
            sashPrice: pricePerUnit.toFixed(2),
          }));
        }
      }
      console.log(
        "[SUBMIT] sashesWithDistributedPrice:",
        sashesWithDistributedPrice
      );
    }

    // Размножаем створки с quantity > 1
    const expandedSashes = sashesWithDistributedPrice.flatMap((sash) => {
      const quantity = parseInt(sash.quantity || "1");
      return Array(quantity)
        .fill(null)
        .map(() => ({
          width: sash.width,
          height: sash.height,
          quantity: "1",
          systemId: sash.systemId,
          controlSide: sash.controlSide,
          fabricId: sash.fabricId,
          sashPrice: sash.sashPrice,
          sashCost: sash.sashCost,
          coefficient: sash.coefficient,
          room: sash.room || 1,
          roomName: sash.roomName || undefined,
          // Preserve mobile-app fallback fields through edit round-trips
          systemName: (sash as any).systemName || undefined,
          systemType: (sash as any).systemType || undefined,
          category: (sash as any).category || undefined,
          fabricName: (sash as any).fabricName || undefined,
        }));
    });

    const dataToSubmit = {
      ...data,
      sashes: expandedSashes,
    };

    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const onProductSubmit = (data: ProductFormValues) => {
    createProductMutation.mutate(data);
  };

  const openViewDialog = async (order: OrderWithRelations) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      const fullOrder = await response.json();
      setViewingOrder(fullOrder);
      setIsViewDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
    }
  };

  const openEditDialog = async (order: OrderWithRelations) => {
    try {
      // Авто-режим цены — пересчёт работает автоматически
      setIsManualSalePrice(false);

      const response = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      const fullOrder: OrderWithRelations = await response.json();

      console.log("[Edit Order] Loaded order data:", {
        isPaid: fullOrder.isPaid,
        cashboxId: fullOrder.cashboxId,
        orderNumber: fullOrder.orderNumber,
      });

      setEditingOrder(fullOrder);

      // Каждая створка — отдельная строка, без группировки
      const rawSashesData = (fullOrder.sashes || []).map((s) => ({
        width: s.width != null ? parseFloat(s.width.toString()).toString() : "",
        height: s.height != null ? parseFloat(s.height.toString()).toString() : "",
        systemId: s.systemId || "",
        controlSide: s.controlSide || "",
        fabricId: s.fabricId || "",
        sashPrice: s.sashPrice != null ? parseFloat(s.sashPrice.toString()).toString() : "",
        sashCost: s.sashCost != null ? parseFloat(s.sashCost.toString()).toString() : "",
        coefficient: (s as any).coefficient != null ? parseFloat((s as any).coefficient.toString()).toString() : "",
        isCalculating: false,
        quantity: "1",
        room: (s as any).room || 1,
        roomName: (s as any).roomName || "",
        // Preserve mobile-app fallback fields so they survive edit round-trips
        systemName: s.systemName || "",
        systemType: s.systemType || "",
        category: s.category || "",
        fabricName: s.fabricName || "",
      }));
      const sashesData = normalizeSashRooms(rawSashesData);

      form.reset({
        date: fullOrder.date,
        dealerId: fullOrder.dealerId || "",
        status: fullOrder.status || "Новый",
        salePrice: fullOrder.salePrice != null ? parseFloat(fullOrder.salePrice.toString()).toString() : "",
        costPrice: fullOrder.costPrice != null ? parseFloat(fullOrder.costPrice.toString()).toString() : "",
        comment: fullOrder.comment || "",
        isPaid: fullOrder.isPaid || false,
        cashboxId: fullOrder.cashboxId || "",
        sashes:
          sashesData.length > 0
            ? sashesData
            : [
                {
                  width: "",
                  height: "",
                  quantity: "1",
                  systemId: "",
                  controlSide: "",
                  fabricId: "",
                  sashPrice: "",
                  sashCost: "",
                  coefficient: "",
                  isCalculating: false,
                  room: 1,
                  roomName: "",
                },
              ],
      });
      setResetToken((t) => t + 1);

      // Пересчитываем коэффициенты ТОЛЬКО для створок, у которых нет сохранённого коэффициента
      // НО НЕ МЕНЯЕМ sashPrice и salePrice - они уже сохранены в базе
      setTimeout(() => {
        sashesData.forEach((sash, index) => {
          // Если коэффициент уже есть из БД - пропускаем пересчёт
          if (sash.coefficient && parseFloat(sash.coefficient) > 0) return;

          const width = parseFloat(sash.width || "0");
          const height = parseFloat(sash.height || "0");
          const systemId = sash.systemId;
          const fabricId = sash.fabricId;

          if (width > 0 && height > 0 && systemId && fabricId) {
            const system = systems.find((s) => s.id === systemId);
            const fabric = fabrics.find((f) => f.id === fabricId);

            if (system && system.systemKey && fabric && fabric.category) {
              const sashId = `sash-${index}`;
              setCalculatingSashes((prev) => new Set(prev).add(index));

              coefficientCalculator.calculate(
                {
                  systemKey: system.systemKey,
                  category: fabric.category,
                  width: width / 100,
                  height: height / 100,
                },
                (data) => {
                  // Только обновляем коэффициент для отображения
                  form.setValue(
                    `sashes.${index}.coefficient`,
                    data.coefficient.toFixed(2),
                    { shouldValidate: false }
                  );

                  setCalculatingSashes((prev) => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                  });

                  // НЕ пересчитываем sashPrice и salePrice при редактировании
                  // Они уже сохранены в базе данных
                },
                (error) => {
                  console.error("Ошибка при расчете коэффициента:", error);
                  setCalculatingSashes((prev) => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                  });
                },
                100, // Минимальный debounce при загрузке
                sashId
              );
            }
          }
        });
      }, 100);

      setIsDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
    }
  };

  const openDeleteDialog = (order: OrderWithRelations) => {
    setOrderToDelete(order);
    setIsDeleteDialogOpen(true);
  };

  // Handle ?edit=orderId from URL (e.g. from kanban)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId && !editFromUrl) {
      setEditFromUrl(editId);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      // Open edit dialog
      (async () => {
        try {
          const response = await fetch(`/api/orders/${editId}`, { credentials: "include" });
          const fullOrder: OrderWithRelations = await response.json();
          openEditDialog(fullOrder);
        } catch {
          toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
        }
      })();
    }
  }, []);

  const resetForms = () => {
    setEditingOrder(null);
    setActiveTab("order");
    setIsManualSalePrice(false);
    form.reset({
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      isPaid: false,
      cashboxId: "",
      sashes: [
        {
          width: "",
          height: "",
          quantity: "1",
          systemId: "",
          controlSide: "",
          fabricId: "",
          sashPrice: "",
          sashCost: "",
          coefficient: "",
          room: 1,
          roomName: "",
        },
      ],
    });
    setResetToken((t) => t + 1);
    productForm.reset({
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
  };

  // Open order form pre-filled from app measurement
  const openFromMeasurement = (measurement: Measurement & { sashes: MeasurementSash[]; dealerName?: string }) => {
    setEditingOrder(null);
    setConvertingMeasurementId(measurement.id);
    setActiveTab("order");
    setIsManualSalePrice(true); // keep coefficient from mobile

    const clientParts = [measurement.clientName, measurement.clientPhone].filter(Boolean);
    const commentLines = [
      clientParts.length > 0 ? `Клиент: ${clientParts.join(", ")}` : null,
      measurement.address ? `Адрес: ${measurement.address}` : null,
      measurement.comment ? `Примечание: ${measurement.comment}` : null,
    ].filter(Boolean).join("\n");

    // App systemType → CRM systemKey mapping (reverse of _systemKeyToType in mobile app)
    const typeToKey: Record<string, string> = {
      "mini-rulons": "mini_roll",
      "mini-zebra": "mini_zebra",
      "uni-1": "uni1_roll",
      "uni-1-zebra": "uni1_zebra",
      "uni-2": "uni2_roll",
      "uni-2-zebra": "uni2_zebra",
    };

    const findSystemId = (s: MeasurementSash): string => {
      // 1. Direct ID match (app loaded systems from server → systemName is UUID)
      if (s.systemName) {
        const byId = systems.find((sys) => sys.id === s.systemName);
        if (byId) return byId.id;
      }
      // 2. Match by systemType → systemKey
      if (s.systemType) {
        const crmKey = typeToKey[s.systemType] || s.systemType.replace(/-/g, "_");
        const byKey = systems.find((sys) => sys.systemKey === crmKey);
        if (byKey) return byKey.id;
      }
      return "";
    };

    const findFabricId = (fabricName: string | null | undefined): string => {
      if (!fabricName) return "";
      // Exact match
      const exact = fabrics.find((f) => f.name === fabricName);
      if (exact) return exact.id;
      // Strip "(colorName)" suffix from app's displayName: "Fabric (White)" → "Fabric"
      const base = fabricName.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (base !== fabricName) {
        const byBase = fabrics.find((f) => f.name === base);
        if (byBase) return byBase.id;
      }
      // Case-insensitive fallback
      const lower = fabricName.toLowerCase();
      const ci = fabrics.find((f) => f.name.toLowerCase() === lower);
      if (ci) return ci.id;
      return "";
    };

    // Calculate actual sale price: coefficient × dealer's workshop rate
    const dealer = dealers.find((d) => d.id === measurement.dealerId);
    const rateRulon = parseFloat(dealer?.workshopRateRulon?.toString() || "28");
    const rateZebra = parseFloat(dealer?.workshopRateZebra?.toString() || "28");

    const rawSashes = (measurement.sashes || []).map((s) => {
      const coef = s.coefficient != null ? parseFloat(s.coefficient.toString()) : 0;
      const isZebra = (s.systemType || "").includes("zebra");
      const price = coef * (isZebra ? rateZebra : rateRulon);
      return {
        width: s.width != null ? parseFloat(s.width.toString()).toString() : "",
        height: s.height != null ? parseFloat(s.height.toString()).toString() : "",
        quantity: "1",
        systemId: findSystemId(s),
        controlSide: s.control === "Л" ? "ЛР" : (s.control || ""),
        fabricId: (s as any).fabric?.id || findFabricId(s.fabricName),
        sashPrice: price > 0 ? price.toFixed(2) : "",
        sashCost: "",
        coefficient: coef > 0 ? coef.toString() : "",
        room: s.room || 1,
        roomName: s.roomName || "",
      };
    });
    const sashes = normalizeSashRooms(rawSashes);

    let calculatedPrice = 0;
    for (const s of measurement.sashes || []) {
      const coef = parseFloat(s.coefficient?.toString() || "0");
      const isZebra = (s.systemType || "").includes("zebra");
      calculatedPrice += coef * (isZebra ? rateZebra : rateRulon);
    }

    form.reset({
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: measurement.dealerId || "",
      status: "Новый",
      salePrice: calculatedPrice > 0 ? calculatedPrice.toFixed(2) : "",
      costPrice: "",
      comment: commentLines,
      isPaid: false,
      cashboxId: "",
      sashes: sashes.length > 0 ? sashes : [{ width: "", height: "", quantity: "1", systemId: "", controlSide: "", fabricId: "", sashPrice: "", sashCost: "", coefficient: "", room: 1, roomName: "" }],
    });
    setResetToken((t) => t + 1);

    setIsDialogOpen(true);
  };

  // Auto-calculate cost price effect
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (!name) return;

      // Только реагируем на изменения связанные с sashes
      const isRelevantChange =
        name.includes("sashes") &&
        (name.includes("width") ||
          name.includes("height") ||
          name.includes("fabricId") ||
          name.includes("systemId") ||
          name.includes("quantity"));

      if (!isRelevantChange) return;

      const sashes = value.sashes || [];

      // Используем данные напрямую из value, а не из form.getValues
      const { totalCost, sashDetails } = calculateCostPrice(
        sashes as {
          width?: string;
          height?: string;
          fabricId?: string;
          systemId?: string;
          quantity?: string;
        }[],
        (i) =>
          sashes[i] as
            | {
                width?: string;
                height?: string;
                fabricId?: string;
                systemId?: string;
                quantity?: string;
              }
            | undefined,
        fabricStock,
        componentStock,
        systems
      );

      setCostCalculationDetails({ totalCost, sashDetails });

      const currentCostPrice = parseFloat(value.costPrice || "0");
      if (totalCost > 0 && Math.abs(totalCost - currentCostPrice) > 0.01) {
        form.setValue("costPrice", totalCost.toFixed(2), {
          shouldValidate: false,
        });
      }

      // При изменении количества пересчитываем цену продажи (без повторного запроса коэффициента)
      if (name.includes("quantity")) {
        const totalPrice = sashes.reduce((sum: number, s: any) => {
          const price = parseFloat(s?.sashPrice || "0");
          const qty = parseFloat(s?.quantity || "1");
          return sum + price * qty;
        }, 0);

        if (totalPrice > 0) {
          form.setValue("salePrice", totalPrice.toFixed(2), {
            shouldValidate: false,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, fabricStock, componentStock, systems]);

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

  // Auto-calculate sale price from coefficients effect (optimized)
  // Рассчитывать только для конкретной изменённой створки, а не для всех
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      console.log("[DEBUG] watch triggered, name:", name);

      if (!name || !name.includes("sashes")) return;

      // Проверяем, что изменилось одно из полей, влияющих на расчёт
      const isRelevantField =
        name.includes("width") ||
        name.includes("height") ||
        name.includes("systemId") ||
        name.includes("fabricId");

      if (!isRelevantField) {
        console.log("[DEBUG] not relevant field:", name);
        return;
      }

      // Извлекаем индекс створки из имени поля (формат: "sashes.0.width")
      const match = name.match(/^sashes\.(\d+)\./);
      if (!match) {
        console.log("[DEBUG] no match for sash index");
        return;
      }

      const index = parseInt(match[1], 10);
      const sashes = value.sashes || [];
      const rawSash = sashes[index];

      if (!rawSash) {
        console.log("[DEBUG] no sash at index", index);
        return;
      }

      // Клонируем данные створки чтобы избежать работы с Proxy
      const sash = {
        width: rawSash.width,
        height: rawSash.height,
        systemId: rawSash.systemId,
        fabricId: rawSash.fabricId,
        quantity: rawSash.quantity,
      };

      const width = parseFloat(sash.width || "0");
      const height = parseFloat(sash.height || "0");
      const systemId = sash.systemId;
      const fabricId = sash.fabricId;

      console.log("[DEBUG] parsed values:", {
        width,
        height,
        systemId,
        fabricId,
      });

      // Рассчитываем коэффициент (асинхронно с debounce)
      if (width > 0 && height > 0 && systemId && fabricId) {
        const system = systems.find((s) => s.id === systemId);
        const fabric = fabrics.find((f) => f.id === fabricId);

        console.log(
          "[DEBUG] found system:",
          system?.name,
          "systemKey:",
          system?.systemKey
        );
        console.log(
          "[DEBUG] found fabric:",
          fabric?.name,
          "category:",
          fabric?.category
        );

        if (system && system.systemKey && fabric && fabric.category) {
          console.log("[DEBUG] calling coefficientCalculator.calculate");
          // Используем уникальный sashId для отдельного debounce каждой створки
          const sashId = `sash-${index}`;

          // Устанавливаем состояние загрузки (через React state, не через form)
          setCalculatingSashes((prev) => new Set(prev).add(index));

          coefficientCalculator.calculate(
            {
              systemKey: system.systemKey,
              category: fabric.category,
              width: width / 100,
              height: height / 100,
            },
            (data) => {
              // Проверяем, что створка ещё существует
              const currentSashes = form.getValues("sashes");
              if (!currentSashes[index]) return;

              // Успешно получен коэффициент
              const multiplier = system.multiplier;
              const multiplierValue = multiplier
                ? parseFloat(multiplier.value?.toString() || "1")
                : 1;
              const sashPrice = data.coefficient * multiplierValue;

              // Сохраняем коэффициент
              form.setValue(
                `sashes.${index}.coefficient`,
                data.coefficient.toFixed(2),
                { shouldValidate: false }
              );

              // Сохраняем цену
              form.setValue(`sashes.${index}.sashPrice`, sashPrice.toFixed(2), {
                shouldValidate: false,
              });

              // Убираем состояние загрузки
              setCalculatingSashes((prev) => {
                const next = new Set(prev);
                next.delete(index);
                return next;
              });

              // Показываем предупреждение только один раз при fallback
              if (data.isFallbackCategory && data.warning) {
                console.warn(`[Заказ] ${data.warning}`);
              }

              // Пересчитываем общую цену всегда при изменении коэффициента
              // (isManualSalePrice не блокирует — ручной режим только для редактирования поля)
              {
                const allSashes = form.getValues("sashes");
                const totalPrice = allSashes.reduce((sum, s) => {
                  const price = parseFloat(s.sashPrice || "0");
                  const qty = parseFloat(s.quantity || "1");
                  return sum + price * qty;
                }, 0);

                if (totalPrice > 0) {
                  form.setValue("salePrice", totalPrice.toFixed(2), {
                    shouldValidate: false,
                  });
                }
              }
            },
            (error) => {
              // Проверяем, что створка ещё существует
              const currentSashes = form.getValues("sashes");
              if (!currentSashes[index]) return;

              // Ошибка при расчете
              console.error("Ошибка при расчете коэффициента:", error);
              setCalculatingSashes((prev) => {
                const next = new Set(prev);
                next.delete(index);
                return next;
              });
              form.setValue(`sashes.${index}.sashPrice`, "0", {
                shouldValidate: false,
              });
              form.setValue(`sashes.${index}.coefficient`, "", {
                shouldValidate: false,
              });
            },
            800, // Debounce 800ms
            sashId // Уникальный ID для отдельного debounce
          );
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      coefficientCalculator.cleanup();
    };
  }, [
    form,
    systems,
    fabrics,
    fabricStock,
    componentStock,
    coefficientCalculator,
  ]);

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

  const columns = getOrderColumns({
    onWorkshopPrint: printInvoice,
    onCustomerPrint: printCustomerInvoice,
    onCutting: (order: OrderWithRelations) => {
      setCuttingOrderId(order.id);
      setCuttingOrderNumber(order.orderNumber);
      setShowCuttingDialog(true);
    },
    onDelete: openDeleteDialog,
    onStatusChange: (id, status) => updateStatusMutation.mutate({ id, status }),
    showProfit,
  });

  return (
    <Layout title="Заказы">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForms();
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-order">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? "Редактировать заказ" : "Новый заказ / товар"}
              </DialogTitle>
            </DialogHeader>

            {!editingOrder && (
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "order" | "product")}
                className="w-full min-h-0 flex-1 flex flex-col"
              >
                <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
                  <TabsTrigger value="order">Заказ (со створками)</TabsTrigger>
                  <TabsTrigger value="product">
                    Товар (комплектующие)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="order" className="mt-4 min-h-0 flex-1 flex flex-col">
                  <OrderForm
                    form={form}
                    fieldArray={fieldArray}
                    dealers={dealers}
                    systems={systems}
                    fabrics={fabrics}
                    fabricStock={fabricStock}
                    componentStock={componentStock}
                    cashboxes={cashboxes}
                    isEditing={false}
                    isPending={createMutation.isPending}
                    resetToken={resetToken}
                    onSubmit={onSubmit}
                    onCancel={() => { resetForms(); setIsDialogOpen(false); }}
                    onShowCostCalculation={(details) => {
                      setCostCalculationDetails(details);
                      setShowCostCalculation(true);
                    }}
                    onSashRemove={handleSashRemove}
                    calculatingSashes={calculatingSashes}
                    isManualSalePrice={isManualSalePrice}
                    onManualSalePriceChange={setIsManualSalePrice}
                  />
                </TabsContent>

                <TabsContent value="product" className="mt-4 min-h-0 flex-1 flex flex-col">
                  <ProductForm
                    form={productForm}
                    fieldArray={productFieldArray}
                    dealers={dealers}
                    componentStock={componentStock}
                    cashboxes={cashboxes}
                    isPending={createProductMutation.isPending}
                    onSubmit={onProductSubmit}
                    onCancel={() => { resetForms(); setIsDialogOpen(false); }}
                  />
                </TabsContent>
              </Tabs>
            )}

            {editingOrder && (
              <OrderForm
                form={form}
                fieldArray={fieldArray}
                dealers={dealers}
                systems={systems}
                fabrics={fabrics}
                fabricStock={fabricStock}
                componentStock={componentStock}
                cashboxes={cashboxes}
                isEditing={true}
                isPending={updateMutation.isPending}
                resetToken={resetToken}
                onSubmit={onSubmit}
                onCancel={() => { resetForms(); setIsDialogOpen(false); }}
                onShowCostCalculation={(details) => {
                  setCostCalculationDetails(details);
                  setShowCostCalculation(true);
                }}
                onSashRemove={handleSashRemove}
                calculatingSashes={calculatingSashes}
                isManualSalePrice={isManualSalePrice}
                onManualSalePriceChange={setIsManualSalePrice}
              />
            )}
          </DialogContent>
        </Dialog>

        {!showProfit ? (
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
      </div>

      <Tabs
        value={orderTypeFilter}
        onValueChange={(v) =>
          setOrderTypeFilter(v as "all" | "sash" | "product" | "app")
        }
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="all">Все заказы</TabsTrigger>
          <TabsTrigger value="sash">Со створками</TabsTrigger>
          <TabsTrigger value="product">Комплектующие</TabsTrigger>
          <TabsTrigger value="app" className="relative">
            Из приложения
            {pendingAppCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {pendingAppCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {orderTypeFilter === "app" ? (
          <AppMeasurementsTab onConvertToOrder={openFromMeasurement} />
        ) : (
          <>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Поиск по номеру..."
              showDateFilter
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              filters={[
                {
                  key: "status",
                  label: "Статус",
                  value: statusFilter,
                  options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
                  onChange: setStatusFilter,
                },
                {
                  key: "dealer",
                  label: "Дилер",
                  value: dealerFilter,
                  options: dealers.map((d) => ({ value: d.id, label: d.fullName })),
                  onChange: setDealerFilter,
                },
              ]}
              onReset={() => {
                setSearch("");
                setDateRange({});
                setStatusFilter("all");
                setDealerFilter("all");
                setOrderTypeFilter("all");
              }}
            />

            <DataTable
              columns={columns}
              data={orders}
              isLoading={ordersLoading}
              emptyMessage="Заказы не найдены"
              getRowKey={(order) => order.id}
              onRowDoubleClick={openEditDialog}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              loadMoreRef={loadMoreRef}
            />
          </>
        )}
      </Tabs>

      <ViewOrderDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        order={viewingOrder}
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

      <CostCalculationDialog
        open={showCostCalculation}
        onOpenChange={setShowCostCalculation}
        details={costCalculationDetails}
        onCostUpdate={(newCost) => {
          form.setValue("costPrice", newCost.toFixed(2), { shouldValidate: false });
        }}
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
