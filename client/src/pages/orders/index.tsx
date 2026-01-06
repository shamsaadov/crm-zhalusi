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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { ORDER_STATUSES, type Dealer, type Fabric } from "@shared/schema";
import { format } from "date-fns";

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
import { OrderForm } from "./order-form";
import { ProductForm } from "./product-form";
import { calculateCostPrice, printInvoice } from "./utils";

export default function OrdersPage() {
  const { toast } = useToast();
  const coefficientCalculator = useCoefficientCalculator();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    "all" | "sash" | "product"
  >("all");
  const [showCostCalculation, setShowCostCalculation] = useState(false);
  const [costCalculationDetails, setCostCalculationDetails] =
    useState<CostCalculationDetails | null>(null);
  const [calculatingSashes, setCalculatingSashes] = useState<Set<number>>(
    new Set()
  );

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
    queryKey: ["/api/orders", { paginated: true }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ paginated: "true", limit: "20" });
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
      // Invalidate finance queries if order was paid
      if (variables.isPaid) {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      }
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Успешно", description: "Заказ создан" });
    },
    onError: (error: Error | ApiError) => {
      if (error instanceof ApiError && error.stockError && error.errors) {
        // Show detailed stock errors
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
      // Invalidate finance queries if order was paid
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
        // Show detailed stock errors
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

    // Размножаем створки с quantity > 1
    const expandedSashes = data.sashes.flatMap((sash) => {
      const quantity = parseInt(sash.quantity || "1");
      // Создаем массив створок (quantity и coefficient не нужны в БД, но quantity нужен для типа)
      return Array(quantity)
        .fill(null)
        .map(() => ({
          width: sash.width,
          height: sash.height,
          quantity: "1", // Каждая развернутая створка = 1 шт
          systemId: sash.systemId,
          controlSide: sash.controlSide,
          fabricId: sash.fabricId,
          sashPrice: sash.sashPrice,
          sashCost: sash.sashCost,
          // coefficient не отправляем - он нужен только для UI
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
      const response = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      const fullOrder: OrderWithRelations = await response.json();
      setEditingOrder(fullOrder);

      // Группируем одинаковые створки и подсчитываем quantity
      const groupedSashes = (fullOrder.sashes || []).reduce((acc, s) => {
        const key = `${s.width}_${s.height}_${s.systemId}_${s.controlSide}_${s.fabricId}_${s.sashPrice}_${s.sashCost}`;
        const existing = acc.find((item) => item.key === key);

        if (existing) {
          existing.quantity++;
        } else {
          acc.push({
            key,
            quantity: 1,
            width: s.width?.toString() || "",
            height: s.height?.toString() || "",
            systemId: s.systemId || "",
            controlSide: s.controlSide || "",
            fabricId: s.fabricId || "",
            sashPrice: s.sashPrice?.toString() || "",
            sashCost: s.sashCost?.toString() || "",
            coefficient: "", // Будет пересчитан автоматически
            isCalculating: false,
          });
        }
        return acc;
      }, [] as Array<{ key: string; quantity: number; width: string; height: string; systemId: string; controlSide: string; fabricId: string; sashPrice: string; sashCost: string; coefficient: string; isCalculating: boolean }>);

      form.reset({
        date: fullOrder.date,
        dealerId: fullOrder.dealerId || "",
        status: fullOrder.status || "Новый",
        salePrice: fullOrder.salePrice?.toString() || "",
        costPrice: fullOrder.costPrice?.toString() || "",
        comment: fullOrder.comment || "",
        sashes: groupedSashes.map(({ key, ...sash }) => ({
          ...sash,
          quantity: sash.quantity.toString(),
          isCalculating: false,
        })) || [
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
          },
        ],
      });
      setIsDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
    }
  };

  const openDeleteDialog = (order: OrderWithRelations) => {
    setOrderToDelete(order);
    setIsDeleteDialogOpen(true);
  };

  const resetForms = () => {
    setEditingOrder(null);
    setActiveTab("order");
    form.reset({
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      isPaid: false,
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
        },
      ],
    });
    productForm.reset({
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      isPaid: false,
      components: [{ componentId: "", quantity: "1" }],
    });
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
              width: width / 1000,
              height: height / 1000,
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

              // Пересчитываем общую цену
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
  const filteredOrders = orders.filter((order) => {
    if (search && !order.orderNumber?.toString().includes(search)) return false;
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (dealerFilter !== "all" && order.dealerId !== dealerFilter) return false;
    if (dateRange.from && new Date(order.date) < dateRange.from) return false;
    if (dateRange.to && new Date(order.date) > dateRange.to) return false;
    if (orderTypeFilter !== "all" && order.orderType !== orderTypeFilter)
      return false;
    return true;
  });

  const columns = getOrderColumns({
    onView: openViewDialog,
    onEdit: openEditDialog,
    onPrint: printInvoice,
    onDelete: openDeleteDialog,
    onStatusChange: (id, status) => updateStatusMutation.mutate({ id, status }),
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
          <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? "Редактировать заказ" : "Новый заказ / товар"}
              </DialogTitle>
            </DialogHeader>

            {!editingOrder && (
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "order" | "product")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="order">Заказ (со створками)</TabsTrigger>
                  <TabsTrigger value="product">
                    Товар (комплектующие)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="order" className="mt-4">
                  <OrderForm
                    form={form}
                    fieldArray={fieldArray}
                    dealers={dealers}
                    systems={systems}
                    fabrics={fabrics}
                    fabricStock={fabricStock}
                    componentStock={componentStock}
                    isEditing={false}
                    isPending={createMutation.isPending}
                    onSubmit={onSubmit}
                    onCancel={() => setIsDialogOpen(false)}
                    onShowCostCalculation={(details) => {
                      setCostCalculationDetails(details);
                      setShowCostCalculation(true);
                    }}
                    onSashRemove={handleSashRemove}
                    calculatingSashes={calculatingSashes}
                  />
                </TabsContent>

                <TabsContent value="product" className="mt-4">
                  <ProductForm
                    form={productForm}
                    fieldArray={productFieldArray}
                    dealers={dealers}
                    componentStock={componentStock}
                    isPending={createProductMutation.isPending}
                    onSubmit={onProductSubmit}
                    onCancel={() => setIsDialogOpen(false)}
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
                isEditing={true}
                isPending={updateMutation.isPending}
                onSubmit={onSubmit}
                onCancel={() => setIsDialogOpen(false)}
                onShowCostCalculation={(details) => {
                  setCostCalculationDetails(details);
                  setShowCostCalculation(true);
                }}
                onSashRemove={handleSashRemove}
                calculatingSashes={calculatingSashes}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Tabs
        value={orderTypeFilter}
        onValueChange={(v) =>
          setOrderTypeFilter(v as "all" | "sash" | "product")
        }
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="all">Все заказы</TabsTrigger>
          <TabsTrigger value="sash">Со створками</TabsTrigger>
          <TabsTrigger value="product">Комплектующие</TabsTrigger>
        </TabsList>

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
        />

        <DataTable
          columns={columns}
          data={filteredOrders}
          isLoading={ordersLoading}
          emptyMessage="Заказы не найдены"
          getRowKey={(order) => order.id}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          loadMoreRef={loadMoreRef}
        />
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
      />
    </Layout>
  );
}
