import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Loader2, X, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ORDER_STATUSES,
  CONTROL_SIDES,
  type Dealer,
  type Fabric,
  type Color,
} from "@shared/schema";
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

export default function OrdersPage() {
  const { toast } = useToast();
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

  const { data: dealers = [] } = useQuery<Dealer[]>({
    queryKey: ["/api/dealers"],
  });

  const { data: systems = [] } = useQuery<SystemWithComponents[]>({
    queryKey: ["/api/systems"],
  });

  const { data: fabrics = [] } = useQuery<Fabric[]>({
    queryKey: ["/api/fabrics"],
  });

  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const { data: stockData } = useQuery<{
    fabrics: FabricWithStock[];
    components: ComponentWithStock[];
  }>({
    queryKey: ["/api/stock"],
  });

  const fabricStock = stockData?.fabrics || [];
  const componentStock = stockData?.components || [];

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      sashes: [
        {
          width: "",
          height: "",
          systemId: "",
          systemColorId: "",
          controlSide: "",
          fabricId: "",
          fabricColorId: "",
          sashPrice: "",
          sashCost: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
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
      components: [
        {
          componentId: "",
          quantity: "1",
        },
      ],
    },
  });

  const {
    fields: productComponentFields,
    append: appendProductComponent,
    remove: removeProductComponent,
  } = useFieldArray({
    control: productForm.control,
    name: "components",
  });

  const createMutation = useMutation({
    mutationFn: (data: OrderFormValues) =>
      apiRequest("POST", "/api/orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Успешно", description: "Заказ создан" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
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
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsDialogOpen(false);
      productForm.reset();
      setActiveTab("order");
      toast({ title: "Успешно", description: "Заказ товара создан" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OrderFormValues) => {
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, data });
    } else {
      createMutation.mutate(data);
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
      form.reset({
        date: fullOrder.date,
        dealerId: fullOrder.dealerId || "",
        status: fullOrder.status || "Новый",
        salePrice: fullOrder.salePrice?.toString() || "",
        costPrice: fullOrder.costPrice?.toString() || "",
        comment: fullOrder.comment || "",
        sashes: fullOrder.sashes?.map((s) => ({
          width: s.width?.toString() || "",
          height: s.height?.toString() || "",
          systemId: s.systemId || "",
          systemColorId: s.systemColorId || "",
          controlSide: s.controlSide || "",
          fabricId: s.fabricId || "",
          fabricColorId: s.fabricColorId || "",
          sashPrice: s.sashPrice?.toString() || "",
          sashCost: s.sashCost?.toString() || "",
        })) || [
          {
            width: "",
            height: "",
            systemId: "",
            systemColorId: "",
            controlSide: "",
            fabricId: "",
            fabricColorId: "",
            sashPrice: "",
            sashCost: "",
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

  const printInvoice = (order: OrderWithRelations) => {
    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Счет #${order.orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f5f5f5; }
            .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Счет #${order.orderNumber}</h1>
          <p>Дата: ${format(new Date(order.date), "dd.MM.yyyy")}</p>
          <p>Дилер: ${order.dealer?.fullName || "-"}</p>
          <table>
            <tr><th>Позиция</th><th>Створки</th><th>Сумма</th></tr>
            <tr><td>Заказ #${order.orderNumber}</td><td>${
      order.sashesCount || 1
    }</td><td>${formatCurrency(order.salePrice)}</td></tr>
          </table>
          <p class="total">Итого к оплате: ${formatCurrency(
            order.salePrice
          )}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const calculateCostPrice = (sashesData: typeof fields) => {
    let totalCost = 0;
    const sashDetails: CostCalculationDetails["sashDetails"] = [];

    for (let i = 0; i < sashesData.length; i++) {
      const sash = form.getValues(`sashes.${i}`);
      if (!sash) continue;

      const width = parseFloat(sash.width || "0");
      const height = parseFloat(sash.height || "0");
      const fabricId = sash.fabricId;
      const systemId = sash.systemId;

      let sashCost = 0;
      let fabricCost = 0;
      let fabricMultiplier = 1;
      let componentsCost = 0;
      const componentsDetails: CostCalculationDetails["sashDetails"][0]["componentsDetails"] =
        [];
      let fabricName = "";
      let fabricType = "roll";
      let fabricAvgPrice = 0;

      if (width > 0 && height > 0) {
        const widthM = width / 1000;
        const heightM = height / 1000;
        const areaM2 = widthM * heightM;

        if (fabricId) {
          const fabric = fabricStock.find((f) => f.id === fabricId);
          if (fabric) {
            fabricName = fabric.name;
            fabricType = fabric.fabricType || "roll";
            fabricAvgPrice = fabric.stock.avgPrice;
            fabricMultiplier = fabricType === "zebra" ? 2 : 1;

            if (fabric.stock.avgPrice > 0) {
              fabricCost = areaM2 * fabric.stock.avgPrice * fabricMultiplier;
              sashCost += fabricCost;
            }
          }
        }

        if (systemId) {
          const system = systems.find((s) => s.id === systemId);
          if (system && system.components) {
            for (const component of system.components) {
              const compStock = componentStock.find(
                (c) => c.id === component.id
              );
              if (compStock && compStock.stock.avgPrice > 0) {
                const quantity = parseFloat(component.quantity || "1");
                const sizeSource = component.sizeSource || null;
                const sizeMultiplier = parseFloat(
                  component.sizeMultiplier || "1"
                );
                const unit = compStock.unit || "шт";

                let sizeValue = 1;
                let componentPrice = 0;
                let formula = "";

                const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
                  unit.toLowerCase()
                );

                if (isMetric && sizeSource) {
                  if (sizeSource === "width") {
                    sizeValue = widthM;
                  } else if (sizeSource === "height") {
                    sizeValue = heightM;
                  }
                  componentPrice =
                    compStock.stock.avgPrice *
                    sizeValue *
                    sizeMultiplier *
                    quantity;
                  formula = `${compStock.stock.avgPrice.toFixed(
                    2
                  )} × ${sizeValue.toFixed(
                    3
                  )}м × ${sizeMultiplier} × ${quantity}`;
                } else if (isMetric && !sizeSource) {
                  sizeValue = widthM;
                  componentPrice =
                    compStock.stock.avgPrice *
                    sizeValue *
                    sizeMultiplier *
                    quantity;
                  formula = `${compStock.stock.avgPrice.toFixed(
                    2
                  )} × ${sizeValue.toFixed(
                    3
                  )}м (ширина) × ${sizeMultiplier} × ${quantity}`;
                } else {
                  componentPrice = compStock.stock.avgPrice * quantity;
                  formula = `${compStock.stock.avgPrice.toFixed(
                    2
                  )} × ${quantity}шт`;
                }

                componentsCost += componentPrice;
                componentsDetails.push({
                  name: compStock.name,
                  unit,
                  quantity,
                  sizeSource,
                  sizeMultiplier,
                  sizeValue,
                  avgPrice: compStock.stock.avgPrice,
                  totalPrice: componentPrice,
                  formula,
                });
              }
            }
            sashCost += componentsCost;
          }
        }

        totalCost += sashCost;

        sashDetails.push({
          index: i + 1,
          width,
          height,
          fabricName,
          fabricType,
          fabricAvgPrice,
          fabricCost,
          fabricMultiplier,
          componentsCost,
          componentsDetails,
          sashCost,
        });
      }
    }

    return { totalCost, sashDetails };
  };

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (
        name &&
        name.includes("sashes") &&
        (name.includes("width") ||
          name.includes("height") ||
          name.includes("fabricId") ||
          name.includes("systemId"))
      ) {
        const sashes = value.sashes || [];
        const { totalCost, sashDetails } = calculateCostPrice(
          sashes as typeof fields
        );

        setCostCalculationDetails({ totalCost, sashDetails });

        const currentCostPrice = parseFloat(value.costPrice || "0");
        if (totalCost > 0 && Math.abs(totalCost - currentCostPrice) > 0.01) {
          form.setValue("costPrice", totalCost.toFixed(2), {
            shouldValidate: false,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, fabricStock, componentStock, systems]);

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
            if (compStock && compStock.stock.avgPrice > 0) {
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

  useEffect(() => {
    const subscription = form.watch(async (value, { name }) => {
      if (
        name &&
        name.includes("sashes") &&
        (name.includes("width") ||
          name.includes("height") ||
          name.includes("systemId") ||
          name.includes("fabricId"))
      ) {
        const sashes = value.sashes || [];

        const sashPrices = await Promise.all(
          sashes.map(async (sash, index) => {
            if (!sash) return 0;

            const width = parseFloat(sash.width || "0");
            const height = parseFloat(sash.height || "0");
            const systemId = sash.systemId;
            const fabricId = sash.fabricId;

            if (width > 0 && height > 0 && systemId && fabricId) {
              const system = systems.find((s) => s.id === systemId);
              const fabric = fabrics.find((f) => f.id === fabricId);

              if (system && system.systemKey && fabric && fabric.category) {
                try {
                  const response = await fetch("/api/coefficients/calculate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      systemKey: system.systemKey,
                      category: fabric.category,
                      width: width / 1000,
                      height: height / 1000,
                    }),
                  });

                  if (response.ok) {
                    const data = await response.json();
                    const coefficient = data.coefficient;
                    const multiplier = system.multiplier;

                    if (coefficient) {
                      const multiplierValue = multiplier
                        ? parseFloat(multiplier.value?.toString() || "1")
                        : 1;
                      const sashPrice = coefficient * multiplierValue;

                      form.setValue(
                        `sashes.${index}.sashPrice`,
                        sashPrice.toFixed(2),
                        { shouldValidate: false }
                      );

                      return sashPrice;
                    }
                  }
                } catch (error) {
                  console.error("Ошибка при расчете коэффициента:", error);
                }
              }
            }
            return 0;
          })
        );

        const totalPrice = sashPrices.reduce((sum, price) => sum + price, 0);

        if (totalPrice > 0) {
          form.setValue("salePrice", totalPrice.toFixed(2), {
            shouldValidate: false,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, systems, fabrics]);

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
      sashes: [
        {
          width: "",
          height: "",
          systemId: "",
          systemColorId: "",
          controlSide: "",
          fabricId: "",
          fabricColorId: "",
          sashPrice: "",
          sashCost: "",
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
      components: [
        {
          componentId: "",
          quantity: "1",
        },
      ],
    });
  };

  const renderSashFields = (index: number, isEditing: boolean) => {
    const selectedSystem = systems.find(
      (s) => s.id === form.watch(`sashes.${index}.systemId`)
    );
    const currentWidth = form.watch(`sashes.${index}.width`);
    const currentHeight = form.watch(`sashes.${index}.height`);
    const currentFabricId = form.watch(`sashes.${index}.fabricId`);
    const currentSashPrice = form.watch(`sashes.${index}.sashPrice`);
    const currentFabric = fabrics.find((f) => f.id === currentFabricId);
    const selectedFabricInfo = fabricStock.find(
      (f) => f.id === currentFabricId
    );

    const widthM = parseFloat(currentWidth || "0") / 1000;
    const heightM = parseFloat(currentHeight || "0") / 1000;
    const sashPriceNum = parseFloat(currentSashPrice || "0");

    return (
      <div
        key={fields[index]?.id}
        className="flex items-end gap-2 p-3 border rounded-lg bg-muted/30"
      >
        <span className="text-sm font-medium text-muted-foreground pb-2 min-w-[24px]">
          {index + 1}.
        </span>
        <FormField
          control={form.control}
          name={`sashes.${index}.width`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[70px]">
              <FormLabel className="text-xs">Ширина</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="мм"
                  className="h-9"
                  {...field}
                  data-testid={`input-sash-width-${index}`}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.height`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[70px]">
              <FormLabel className="text-xs">Высота</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="мм"
                  className="h-9"
                  {...field}
                  data-testid={`input-sash-height-${index}`}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.systemId`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[120px]">
              <FormLabel className="text-xs flex items-center gap-1">
                Система
                {field.value && selectedSystem && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-4 w-4"
                        type="button"
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="start">
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">{selectedSystem.name}</p>
                        {selectedSystem.systemKey && (
                          <p className="text-muted-foreground">
                            Ключ: {selectedSystem.systemKey}
                          </p>
                        )}
                        <Separator />
                        <div>
                          <p className="text-muted-foreground">Комплектующие</p>
                          <p className="font-medium">
                            {selectedSystem.components?.length || 0} шт.
                          </p>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-muted-foreground">
                            Параметры расчёта
                          </p>
                          <div className="grid grid-cols-2 gap-1 mt-1">
                            <p className="text-xs">
                              Ширина: {widthM.toFixed(2)} м
                            </p>
                            <p className="text-xs">
                              Высота: {heightM.toFixed(2)} м
                            </p>
                            <p className="text-xs">
                              Категория: {currentFabric?.category || "—"}
                            </p>
                            <p className="text-xs">
                              Площадь: {(widthM * heightM).toFixed(2)} м²
                            </p>
                          </div>
                        </div>
                        {sashPriceNum > 0 && (
                          <>
                            <Separator />
                            <div className="bg-muted/50 rounded p-2">
                              <p className="text-muted-foreground text-xs">
                                Расчётная цена створки
                              </p>
                              <p className="font-bold text-lg text-primary">
                                {formatCurrency(sashPriceNum)}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </FormLabel>
              <SearchableSelect
                options={systems.map((system) => ({
                  value: system.id,
                  label: system.name,
                }))}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Система"
                searchPlaceholder="Поиск системы..."
                emptyText="Система не найдена"
                className="h-9"
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.systemColorId`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[100px]">
              <FormLabel className="text-xs">Цвет сист.</FormLabel>
              <SearchableSelect
                options={colors.map((color) => ({
                  value: color.id,
                  label: color.name,
                }))}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Цвет"
                searchPlaceholder="Поиск цвета..."
                emptyText="Цвет не найден"
                className="h-9"
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.fabricId`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[120px]">
              <FormLabel className="text-xs flex items-center gap-1">
                Ткань
                {field.value && selectedFabricInfo && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-4 w-4"
                        type="button"
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="start">
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">{selectedFabricInfo.name}</p>
                        {selectedFabricInfo.category && (
                          <p className="text-muted-foreground">
                            Категория: {selectedFabricInfo.category}
                          </p>
                        )}
                        <Separator />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-muted-foreground">Остаток</p>
                            <p className="font-medium">
                              {selectedFabricInfo.stock.quantity.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Ср. цена</p>
                            <p className="font-medium">
                              {formatCurrency(
                                selectedFabricInfo.stock.avgPrice
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </FormLabel>
              <SearchableSelect
                options={fabrics.map((fabric) => ({
                  value: fabric.id,
                  label: fabric.name,
                }))}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Ткань"
                searchPlaceholder="Поиск ткани..."
                emptyText="Ткань не найдена"
                className="h-9"
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.fabricColorId`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[100px]">
              <FormLabel className="text-xs">Цвет ткани</FormLabel>
              <SearchableSelect
                options={colors.map((color) => ({
                  value: color.id,
                  label: color.name,
                }))}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Цвет"
                searchPlaceholder="Поиск цвета..."
                emptyText="Цвет не найден"
                className="h-9"
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`sashes.${index}.controlSide`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-[90px]">
              <FormLabel className="text-xs">Управление</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Сторона" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CONTROL_SIDES.map((side) => (
                    <SelectItem key={side} value={side}>
                      {side}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        {fields.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => remove(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  const renderOrderForm = (isEditing: boolean) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дата</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dealerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дилер</FormLabel>
                <SearchableSelect
                  options={dealers.map((dealer) => ({
                    value: dealer.id,
                    label: dealer.fullName,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Выберите дилера"
                  searchPlaceholder="Поиск дилера..."
                  emptyText="Дилер не найден"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Статус</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Створки
              <Badge variant="secondary" className="ml-2">
                {fields.length}
              </Badge>
            </h3>
          </div>

          {fields.map((_, index) => renderSashFields(index, isEditing))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const firstSash = form.getValues("sashes.0");
              append({
                width: "",
                height: "",
                systemId: firstSash?.systemId || "",
                systemColorId: firstSash?.systemColorId || "",
                controlSide: "",
                fabricId: firstSash?.fabricId || "",
                fabricColorId: firstSash?.fabricColorId || "",
                sashPrice: "",
                sashCost: "",
              });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить створку
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="salePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена продажи (авто)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="bg-muted"
                    readOnly
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Коэффициент × множитель системы
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="costPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Себестоимость (авто)
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      const sashes = form.getValues("sashes");
                      const { totalCost, sashDetails } = calculateCostPrice(
                        sashes as typeof fields
                      );
                      setCostCalculationDetails({ totalCost, sashDetails });
                      setShowCostCalculation(true);
                    }}
                  >
                    🧪 Тест расчета
                  </Button>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="bg-muted"
                    readOnly
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Ткань (площадь × ср. цена × множитель) + комплектующие
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Комментарий</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDialogOpen(false)}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={
              isEditing ? updateMutation.isPending : createMutation.isPending
            }
          >
            {(isEditing
              ? updateMutation.isPending
              : createMutation.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {isEditing ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </form>
    </Form>
  );

  const renderProductForm = () => (
    <Form {...productForm}>
      <form
        onSubmit={productForm.handleSubmit(onProductSubmit)}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={productForm.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дата</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={productForm.control}
            name="dealerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дилер</FormLabel>
                <SearchableSelect
                  options={dealers.map((dealer) => ({
                    value: dealer.id,
                    label: dealer.fullName,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Выберите дилера"
                  searchPlaceholder="Поиск дилера..."
                  emptyText="Дилер не найден"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={productForm.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Статус</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Комплектующие
              <Badge variant="secondary" className="ml-2">
                {productComponentFields.length}
              </Badge>
            </h3>
          </div>

          {productComponentFields.map((field, index) => {
            const selectedComponentId = productForm.watch(
              `components.${index}.componentId`
            );
            const selectedComponent = componentStock.find(
              (c) => c.id === selectedComponentId
            );

            return (
              <div
                key={field.id}
                className="flex items-end gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <span className="text-sm font-medium text-muted-foreground pb-2 min-w-[24px]">
                  {index + 1}.
                </span>
                <FormField
                  control={productForm.control}
                  name={`components.${index}.componentId`}
                  render={({ field }) => (
                    <FormItem className="flex-[3]">
                      <FormLabel className="text-xs">Комплектующая</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={componentStock.map((component) => ({
                            value: component.id,
                            label: component.name,
                            secondaryLabel: `(${
                              component.unit || "шт"
                            }) — ост: ${component.stock.quantity.toFixed(1)}`,
                          }))}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Выберите комплектующую"
                          searchPlaceholder="Поиск комплектующей..."
                          emptyText="Комплектующая не найдена"
                          className="h-9"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={productForm.control}
                  name={`components.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[100px]">
                      <FormLabel className="text-xs">
                        Количество{" "}
                        {selectedComponent?.unit
                          ? `(${selectedComponent.unit})`
                          : ""}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Кол-во"
                          className="h-9"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedComponent && (
                  <div className="flex flex-col text-xs text-muted-foreground pb-2">
                    <span>
                      Ср. цена:{" "}
                      {formatCurrency(selectedComponent.stock.avgPrice)}
                    </span>
                    <span className="font-medium text-foreground">
                      Сумма:{" "}
                      {formatCurrency(
                        selectedComponent.stock.avgPrice *
                          parseFloat(
                            productForm.watch(`components.${index}.quantity`) ||
                              "0"
                          )
                      )}
                    </span>
                  </div>
                )}
                {productComponentFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => removeProductComponent(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              appendProductComponent({
                componentId: "",
                quantity: "1",
              });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить комплектующую
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={productForm.control}
            name="salePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена продажи</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={productForm.control}
            name="costPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Себестоимость</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="bg-muted"
                    readOnly
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Сумма по комплектующим × ср. цена
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={productForm.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Комментарий</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDialogOpen(false)}
          >
            Отмена
          </Button>
          <Button type="submit" disabled={createProductMutation.isPending}>
            {createProductMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Создать
          </Button>
        </div>
      </form>
    </Form>
  );

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
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
                  {renderOrderForm(false)}
                </TabsContent>

                <TabsContent value="product" className="mt-4">
                  {renderProductForm()}
                </TabsContent>
              </Tabs>
            )}

            {editingOrder && renderOrderForm(true)}
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
