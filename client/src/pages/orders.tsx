import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import {
  StatusBadge,
  formatCurrency,
  BalanceBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  FileText,
  Loader2,
  X,
  Info,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ORDER_STATUSES,
  CONTROL_SIDES,
  type Order,
  type OrderStatus,
  type Dealer,
  type System,
  type Fabric,
  type Color,
  type Multiplier,
  type Component,
} from "@shared/schema";
import { format } from "date-fns";

const sashSchema = z.object({
  width: z.string().min(1, "Обязательное поле"),
  height: z.string().min(1, "Обязательное поле"),
  systemId: z.string().optional(),
  systemColorId: z.string().optional(),
  controlSide: z.string().optional(),
  fabricId: z.string().optional(),
  fabricColorId: z.string().optional(),
  sashPrice: z.string().optional(),
  sashCost: z.string().optional(),
});

const orderFormSchema = z.object({
  date: z.string().min(1, "Обязательное поле"),
  dealerId: z.string().optional(),
  status: z.string().default("Новый"),
  salePrice: z.string().optional(),
  costPrice: z.string().optional(),
  comment: z.string().optional(),
  sashes: z.array(sashSchema).min(1, "Добавьте минимум одну створку"),
});

// Схема для формы добавления товара (комплектующие)
const productComponentSchema = z.object({
  componentId: z.string().min(1, "Выберите комплектующую"),
  quantity: z.string().min(1, "Укажите количество"),
});

const productFormSchema = z.object({
  date: z.string().min(1, "Обязательное поле"),
  dealerId: z.string().optional(),
  status: z.string().default("Новый"),
  salePrice: z.string().optional(),
  costPrice: z.string().optional(),
  comment: z.string().optional(),
  components: z
    .array(productComponentSchema)
    .min(1, "Добавьте минимум одну комплектующую"),
});

type SashFormValues = z.infer<typeof sashSchema>;
type OrderFormValues = z.infer<typeof orderFormSchema>;
type ProductFormValues = z.infer<typeof productFormSchema>;

interface OrderSash {
  id: string;
  orderId: string;
  width: string | null;
  height: string | null;
  systemId: string | null;
  systemColorId: string | null;
  fabricId: string | null;
  fabricColorId: string | null;
  controlSide: string | null;
  sashPrice: string | null;
  sashCost: string | null;
  system?: System;
  systemColor?: Color;
  fabric?: Fabric;
  fabricColor?: Color;
}

interface OrderWithRelations extends Order {
  dealer?: Dealer;
  dealerBalance?: number;
  sashesCount?: number;
  sashes?: OrderSash[];
}

interface StockItem {
  quantity: number;
  lastPrice: number;
  avgPrice: number;
  totalValue: number;
}

interface FabricWithStock extends Fabric {
  stock: StockItem;
}

interface ComponentWithStock extends Component {
  stock: StockItem;
}

// Компонент системы с данными о количестве и размерах
interface SystemComponentWithDetails extends Component {
  quantity?: string | null;
  sizeSource?: string | null; // "width" | "height" | null
  sizeMultiplier?: string | null;
}

interface SystemWithComponents extends System {
  components?: SystemComponentWithDetails[];
  multiplier?: Multiplier;
}

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
  const [showCostCalculation, setShowCostCalculation] = useState(false);
  const [costCalculationDetails, setCostCalculationDetails] = useState<{
    totalCost: number;
    sashDetails: Array<{
      index: number;
      width: number;
      height: number;
      fabricName: string;
      fabricType: string;
      fabricAvgPrice: number;
      fabricCost: number;
      fabricMultiplier: number;
      componentsCost: number;
      componentsDetails: Array<{
        name: string;
        unit: string;
        quantity: number;
        sizeSource: string | null;
        sizeMultiplier: number;
        sizeValue: number;
        avgPrice: number;
        totalPrice: number;
        formula: string;
      }>;
      sashCost: number;
    }>;
  } | null>(null);

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

  // Форма для добавления товара (комплектующие)
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

  // Мутация для создания заказа товара (комплектующие)
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

  // Функция расчета себестоимости
  const calculateCostPrice = (sashesData: typeof fields) => {
    let totalCost = 0;
    const sashDetails: typeof costCalculationDetails extends {
      sashDetails: infer T;
    } | null
      ? T
      : never = [];

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
      const componentsDetails: Array<{
        name: string;
        unit: string;
        quantity: number;
        sizeSource: string | null;
        sizeMultiplier: number;
        sizeValue: number;
        avgPrice: number;
        totalPrice: number;
        formula: string;
      }> = [];
      let fabricName = "";
      let fabricType = "roll";
      let fabricAvgPrice = 0;

      if (width > 0 && height > 0) {
        // Расчет размеров в метрах
        const widthM = width / 1000;
        const heightM = height / 1000;
        const areaM2 = widthM * heightM;

        // Себестоимость ткани: площадь × средняя цена ткани × множитель типа ткани
        if (fabricId) {
          const fabric = fabricStock.find((f) => f.id === fabricId);
          if (fabric) {
            fabricName = fabric.name;
            fabricType = fabric.fabricType || "roll";
            fabricAvgPrice = fabric.stock.avgPrice;

            // Множитель зависит от типа ткани: zebra = 2, roll = 1
            fabricMultiplier = fabricType === "zebra" ? 2 : 1;

            if (fabric.stock.avgPrice > 0) {
              fabricCost = areaM2 * fabric.stock.avgPrice * fabricMultiplier;
              sashCost += fabricCost;
            }
          }
        }

        // Себестоимость комплектующих системы
        if (systemId) {
          const system = systems.find((s) => s.id === systemId);
          console.log("🔍 Расчёт себестоимости для системы:", system?.name);
          console.log("   Размеры створки:", { widthM, heightM, areaM2 });
          console.log(
            "   Компоненты системы:",
            system?.components?.length || 0,
            "шт."
          );
          if (system && system.components) {
            for (const component of system.components) {
              const compStock = componentStock.find(
                (c) => c.id === component.id
              );
              console.log("   📦 Компонент:", component.name);
              console.log("      → Настройки в системе:", {
                quantity: component.quantity,
                sizeSource: component.sizeSource,
                sizeMultiplier: component.sizeMultiplier,
              });
              console.log("      → Данные склада:", {
                unit: compStock?.unit,
                avgPrice: compStock?.stock.avgPrice,
              });
              if (compStock && compStock.stock.avgPrice > 0) {
                // Получаем данные из системы комплектующих
                const quantity = parseFloat(component.quantity || "1");
                const sizeSource = component.sizeSource || null;
                const sizeMultiplier = parseFloat(
                  component.sizeMultiplier || "1"
                );
                const unit = compStock.unit || "шт";

                let sizeValue = 1;
                let componentPrice = 0;
                let formula = "";

                // Проверяем, является ли комплектующая метровой (м, пм, п.м., м.п.)
                const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
                  unit.toLowerCase()
                );

                // Логика расчета в зависимости от единицы измерения и sizeSource
                if (isMetric && sizeSource) {
                  // Для метровых комплектующих (труба, профиль и т.д.)
                  // Используем ширину или высоту в зависимости от sizeSource
                  if (sizeSource === "width") {
                    sizeValue = widthM;
                  } else if (sizeSource === "height") {
                    sizeValue = heightM;
                  }
                  // Формула: avgPrice × sizeValue × sizeMultiplier × quantity
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
                  // Метровая комплектующая без указания sizeSource - предполагаем ширину
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
                  // Для штучных комплектующих (заглушки, крепления и т.д.)
                  // Формула: avgPrice × quantity
                  componentPrice = compStock.stock.avgPrice * quantity;
                  formula = `${compStock.stock.avgPrice.toFixed(
                    2
                  )} × ${quantity}шт`;
                }

                console.log(
                  "      → Расчёт:",
                  formula,
                  "=",
                  componentPrice.toFixed(2)
                );

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

  // Автоматический расчет себестоимости на основе створок (ткань + комплектующие системы)
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      // Отслеживаем изменения в створках (ширина, высота, ткань, система)
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

        // Обновляем детали расчета
        setCostCalculationDetails({ totalCost, sashDetails });

        // Обновляем общую себестоимость, если она изменилась
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

  // Автоматический расчет себестоимости для формы товара
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

  // Автоматический расчет цены продажи на основе системы, коэффициентов и множителя
  useEffect(() => {
    const subscription = form.watch(async (value, { name }) => {
      // Отслеживаем изменения в створках (ширина, высота, система, ткань)
      if (
        name &&
        name.includes("sashes") &&
        (name.includes("width") ||
          name.includes("height") ||
          name.includes("systemId") ||
          name.includes("fabricId"))
      ) {
        const sashes = value.sashes || [];

        // Используем Promise.all для параллельных запросов
        const sashPrices = await Promise.all(
          sashes.map(async (sash, index) => {
            if (!sash) return 0;

            const width = parseFloat(sash.width || "0");
            const height = parseFloat(sash.height || "0");
            const systemId = sash.systemId;
            const fabricId = sash.fabricId;

            if (width > 0 && height > 0 && systemId && fabricId) {
              // Находим систему
              const system = systems.find((s) => s.id === systemId);
              const fabric = fabrics.find((f) => f.id === fabricId);

              if (system && system.systemKey && fabric && fabric.category) {
                try {
                  // Получаем коэффициент из API
                  const response = await fetch("/api/coefficients/calculate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      systemKey: system.systemKey,
                      category: fabric.category,
                      width: width / 1000, // мм в метры
                      height: height / 1000,
                    }),
                  });

                  if (response.ok) {
                    const data = await response.json();
                    const coefficient = data.coefficient;

                    // Используем множитель системы (уже загружен с API)
                    const multiplier = system.multiplier;

                    if (coefficient) {
                      // Вычисляем цену створки: коэффициент × множитель
                      const multiplierValue = multiplier
                        ? parseFloat(multiplier.value?.toString() || "1")
                        : 1;
                      const sashPrice = coefficient * multiplierValue;

                      // Обновляем цену створки в форме
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

        // Суммируем все цены створок
        const totalPrice = sashPrices.reduce((sum, price) => sum + price, 0);

        // Обновляем общую цену продажи
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
    return true;
  });

  const columns = [
    {
      key: "orderNumber",
      header: "№",
      cell: (order: OrderWithRelations) => (
        <span
          className="font-mono"
          data-testid={`text-order-number-${order.id}`}
        >
          {order.orderNumber}
        </span>
      ),
    },
    {
      key: "date",
      header: "Дата",
      cell: (order: OrderWithRelations) =>
        format(new Date(order.date), "dd.MM.yyyy"),
    },
    {
      key: "dealer",
      header: "Дилер",
      cell: (order: OrderWithRelations) => order.dealer?.fullName || "-",
    },
    {
      key: "sashesCount",
      header: "Створок",
      cell: (order: OrderWithRelations) => (
        <Badge variant="secondary">{order.sashesCount || 0}</Badge>
      ),
    },
    {
      key: "status",
      header: "Статус",
      cell: (order: OrderWithRelations) => (
        <Select
          value={order.status || "Новый"}
          onValueChange={(value) =>
            updateStatusMutation.mutate({ id: order.id, status: value })
          }
        >
          <SelectTrigger
            className="w-[140px]"
            data-testid={`select-status-${order.id}`}
          >
            <StatusBadge status={(order.status as OrderStatus) || "Новый"} />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <StatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "salePrice",
      header: "Продажа",
      cell: (order: OrderWithRelations) => (
        <span className="font-mono">{formatCurrency(order.salePrice)}</span>
      ),
      className: "text-right",
    },
    {
      key: "dealerDebt",
      header: "Долг дилера",
      cell: (order: OrderWithRelations) => (
        <BalanceBadge
          balance={parseFloat(order.dealerDebt?.toString() || "0")}
        />
      ),
      className: "text-right",
    },
    {
      key: "profit",
      header: "Прибыль",
      cell: (order: OrderWithRelations) => {
        const profit =
          parseFloat(order.salePrice?.toString() || "0") -
          parseFloat(order.costPrice?.toString() || "0");
        return <BalanceBadge balance={profit} />;
      },
      className: "text-right",
    },
    {
      key: "actions",
      header: "",
      cell: (order: OrderWithRelations) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openViewDialog(order)}
            data-testid={`button-view-${order.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openEditDialog(order)}
            data-testid={`button-edit-${order.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => printInvoice(order)}
            data-testid={`button-invoice-${order.id}`}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openDeleteDialog(order)}
            data-testid={`button-delete-${order.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Заказы">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
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
            }
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
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-3 gap-3">
                        <FormField
                          control={form.control}
                          name="date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Дата</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  {...field}
                                  data-testid="input-order-date"
                                />
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
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-dealer">
                                    <SelectValue placeholder="Выберите дилера" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {dealers.map((dealer) => (
                                    <SelectItem
                                      key={dealer.id}
                                      value={dealer.id}
                                    >
                                      {dealer.fullName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-order-status">
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

                        {fields.map((field, index) => (
                          <div
                            key={field.id}
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
                                  <FormLabel className="text-xs">
                                    Ширина
                                  </FormLabel>
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
                                  <FormLabel className="text-xs">
                                    Высота
                                  </FormLabel>
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
                              render={({ field }) => {
                                const selectedSystem = systems.find(
                                  (s) => s.id === field.value
                                );
                                const currentWidth = form.watch(
                                  `sashes.${index}.width`
                                );
                                const currentHeight = form.watch(
                                  `sashes.${index}.height`
                                );
                                const currentFabricId = form.watch(
                                  `sashes.${index}.fabricId`
                                );
                                const currentSashPrice = form.watch(
                                  `sashes.${index}.sashPrice`
                                );
                                const currentFabric = fabrics.find(
                                  (f) => f.id === currentFabricId
                                );

                                const widthM =
                                  parseFloat(currentWidth || "0") / 1000;
                                const heightM =
                                  parseFloat(currentHeight || "0") / 1000;
                                const sashPriceNum = parseFloat(
                                  currentSashPrice || "0"
                                );

                                return (
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
                                              data-testid={`button-system-info-${index}`}
                                            >
                                              <Info className="h-3 w-3" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent
                                            className="w-72"
                                            align="start"
                                          >
                                            <div className="space-y-2 text-sm">
                                              <p className="font-medium">
                                                {selectedSystem.name}
                                              </p>
                                              {selectedSystem.systemKey && (
                                                <p className="text-muted-foreground">
                                                  Ключ:{" "}
                                                  {selectedSystem.systemKey}
                                                </p>
                                              )}
                                              <Separator />
                                              <div>
                                                <p className="text-muted-foreground">
                                                  Комплектующие
                                                </p>
                                                <p className="font-medium">
                                                  {selectedSystem.components
                                                    ?.length || 0}{" "}
                                                  шт.
                                                </p>
                                                {selectedSystem.components &&
                                                  selectedSystem.components
                                                    .length > 0 && (
                                                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                                      {selectedSystem.components
                                                        .slice(0, 5)
                                                        .map((comp) => (
                                                          <li key={comp.id}>
                                                            • {comp.name}
                                                          </li>
                                                        ))}
                                                      {selectedSystem.components
                                                        .length > 5 && (
                                                        <li>
                                                          ... и ещё{" "}
                                                          {selectedSystem
                                                            .components.length -
                                                            5}
                                                        </li>
                                                      )}
                                                    </ul>
                                                  )}
                                              </div>
                                              <Separator />
                                              <div>
                                                <p className="text-muted-foreground">
                                                  Параметры расчёта
                                                </p>
                                                <div className="grid grid-cols-2 gap-1 mt-1">
                                                  <p className="text-xs">
                                                    Ширина: {widthM.toFixed(2)}{" "}
                                                    м
                                                  </p>
                                                  <p className="text-xs">
                                                    Высота: {heightM.toFixed(2)}{" "}
                                                    м
                                                  </p>
                                                  <p className="text-xs">
                                                    Категория:{" "}
                                                    {currentFabric?.category ||
                                                      "—"}
                                                  </p>
                                                  <p className="text-xs">
                                                    Площадь:{" "}
                                                    {(widthM * heightM).toFixed(
                                                      2
                                                    )}{" "}
                                                    м²
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
                                                      {formatCurrency(
                                                        sashPriceNum
                                                      )}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                      (коэффициент × множитель)
                                                    </p>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      )}
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger
                                          className="h-9"
                                          data-testid={`select-sash-system-${index}`}
                                        >
                                          <SelectValue placeholder="Система" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {systems.map((system) => (
                                          <SelectItem
                                            key={system.id}
                                            value={system.id}
                                          >
                                            {system.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                );
                              }}
                            />
                            <FormField
                              control={form.control}
                              name={`sashes.${index}.systemColorId`}
                              render={({ field }) => (
                                <FormItem className="flex-1 min-w-[100px]">
                                  <FormLabel className="text-xs">
                                    Цвет сист.
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        className="h-9"
                                        data-testid={`select-sash-system-color-${index}`}
                                      >
                                        <SelectValue placeholder="Цвет" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {colors.map((color) => (
                                        <SelectItem
                                          key={color.id}
                                          value={color.id}
                                        >
                                          {color.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`sashes.${index}.fabricId`}
                              render={({ field }) => {
                                const selectedFabricInfo = fabricStock.find(
                                  (f) => f.id === field.value
                                );
                                return (
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
                                              data-testid={`button-fabric-info-${index}`}
                                            >
                                              <Info className="h-3 w-3" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent
                                            className="w-64"
                                            align="start"
                                          >
                                            <div className="space-y-2 text-sm">
                                              <p className="font-medium">
                                                {selectedFabricInfo.name}
                                              </p>
                                              {selectedFabricInfo.category && (
                                                <p className="text-muted-foreground">
                                                  Категория:{" "}
                                                  {selectedFabricInfo.category}
                                                </p>
                                              )}
                                              {selectedFabricInfo.width && (
                                                <p className="text-muted-foreground">
                                                  Ширина:{" "}
                                                  {selectedFabricInfo.width} м
                                                </p>
                                              )}
                                              <Separator />
                                              <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                  <p className="text-muted-foreground">
                                                    Остаток
                                                  </p>
                                                  <p className="font-medium">
                                                    {selectedFabricInfo.stock.quantity.toFixed(
                                                      2
                                                    )}
                                                  </p>
                                                </div>
                                                <div>
                                                  <p className="text-muted-foreground">
                                                    Посл. цена
                                                  </p>
                                                  <p className="font-medium">
                                                    {formatCurrency(
                                                      selectedFabricInfo.stock
                                                        .lastPrice
                                                    )}
                                                  </p>
                                                </div>
                                                <div>
                                                  <p className="text-muted-foreground">
                                                    Ср. цена
                                                  </p>
                                                  <p className="font-medium">
                                                    {formatCurrency(
                                                      selectedFabricInfo.stock
                                                        .avgPrice
                                                    )}
                                                  </p>
                                                </div>
                                                <div>
                                                  <p className="text-muted-foreground">
                                                    Сумма
                                                  </p>
                                                  <p className="font-medium">
                                                    {formatCurrency(
                                                      selectedFabricInfo.stock
                                                        .totalValue
                                                    )}
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      )}
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger
                                          className="h-9"
                                          data-testid={`select-sash-fabric-${index}`}
                                        >
                                          <SelectValue placeholder="Ткань" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {fabrics.map((fabric) => (
                                          <SelectItem
                                            key={fabric.id}
                                            value={fabric.id}
                                          >
                                            {fabric.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                );
                              }}
                            />
                            <FormField
                              control={form.control}
                              name={`sashes.${index}.fabricColorId`}
                              render={({ field }) => (
                                <FormItem className="flex-1 min-w-[100px]">
                                  <FormLabel className="text-xs">
                                    Цвет ткани
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        className="h-9"
                                        data-testid={`select-sash-fabric-color-${index}`}
                                      >
                                        <SelectValue placeholder="Цвет" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {colors.map((color) => (
                                        <SelectItem
                                          key={color.id}
                                          value={color.id}
                                        >
                                          {color.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`sashes.${index}.controlSide`}
                              render={({ field }) => (
                                <FormItem className="flex-1 min-w-[90px]">
                                  <FormLabel className="text-xs">
                                    Управление
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        className="h-9"
                                        data-testid={`select-sash-control-${index}`}
                                      >
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
                                data-testid={`button-remove-sash-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}

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
                          data-testid="button-add-sash"
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
                                  data-testid="input-sale-price"
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
                                    const { totalCost, sashDetails } =
                                      calculateCostPrice(
                                        sashes as typeof fields
                                      );
                                    setCostCalculationDetails({
                                      totalCost,
                                      sashDetails,
                                    });
                                    setShowCostCalculation(true);
                                  }}
                                  data-testid="button-show-cost-calculation"
                                >
                                  🧪 Тест расчета
                                </Button>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  data-testid="input-cost-price"
                                  className="bg-muted"
                                  readOnly
                                />
                              </FormControl>
                              <p className="text-xs text-muted-foreground">
                                Ткань (площадь × ср. цена × множитель) +
                                комплектующие
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
                              <Textarea
                                {...field}
                                rows={2}
                                data-testid="input-comment"
                              />
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
                          disabled={createMutation.isPending}
                          data-testid="button-submit-order"
                        >
                          {createMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Создать
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="product" className="mt-4">
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
                                <Input
                                  type="date"
                                  {...field}
                                  data-testid="input-product-date"
                                />
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
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-product-dealer">
                                    <SelectValue placeholder="Выберите дилера" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {dealers.map((dealer) => (
                                    <SelectItem
                                      key={dealer.id}
                                      value={dealer.id}
                                    >
                                      {dealer.fullName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-product-status">
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
                                    <FormLabel className="text-xs">
                                      Комплектующая
                                    </FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger
                                          className="h-9"
                                          data-testid={`select-product-component-${index}`}
                                        >
                                          <SelectValue placeholder="Выберите комплектующую" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {componentStock.map((component) => (
                                          <SelectItem
                                            key={component.id}
                                            value={component.id}
                                          >
                                            <div className="flex items-center justify-between w-full gap-2">
                                              <span>{component.name}</span>
                                              <span className="text-xs text-muted-foreground">
                                                ({component.unit || "шт"}) —
                                                ост:{" "}
                                                {component.stock.quantity.toFixed(
                                                  1
                                                )}
                                              </span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
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
                                        data-testid={`input-product-quantity-${index}`}
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
                                    {formatCurrency(
                                      selectedComponent.stock.avgPrice
                                    )}
                                  </span>
                                  <span className="font-medium text-foreground">
                                    Сумма:{" "}
                                    {formatCurrency(
                                      selectedComponent.stock.avgPrice *
                                        parseFloat(
                                          productForm.watch(
                                            `components.${index}.quantity`
                                          ) || "0"
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
                                  data-testid={`button-remove-product-component-${index}`}
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
                          data-testid="button-add-product-component"
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
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  data-testid="input-product-sale-price"
                                />
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
                                  data-testid="input-product-cost-price"
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
                              <Textarea
                                {...field}
                                rows={2}
                                data-testid="input-product-comment"
                              />
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
                          disabled={createProductMutation.isPending}
                          data-testid="button-submit-product"
                        >
                          {createProductMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Создать
                        </Button>
                      </div>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            )}

            {/* Форма редактирования заказа (без табов) */}
            {editingOrder && (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-3 gap-3">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-order-date"
                            />
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-dealer">
                                <SelectValue placeholder="Выберите дилера" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {dealers.map((dealer) => (
                                <SelectItem key={dealer.id} value={dealer.id}>
                                  {dealer.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-order-status">
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

                    {fields.map((field, index) => (
                      <div
                        key={field.id}
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
                          render={({ field }) => {
                            const selectedSystem = systems.find(
                              (s) => s.id === field.value
                            );
                            const currentWidth = form.watch(
                              `sashes.${index}.width`
                            );
                            const currentHeight = form.watch(
                              `sashes.${index}.height`
                            );
                            const currentFabricId = form.watch(
                              `sashes.${index}.fabricId`
                            );
                            const currentSashPrice = form.watch(
                              `sashes.${index}.sashPrice`
                            );
                            const currentFabric = fabrics.find(
                              (f) => f.id === currentFabricId
                            );

                            const widthM =
                              parseFloat(currentWidth || "0") / 1000;
                            const heightM =
                              parseFloat(currentHeight || "0") / 1000;
                            const sashPriceNum = parseFloat(
                              currentSashPrice || "0"
                            );

                            return (
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
                                          data-testid={`button-system-info-${index}`}
                                        >
                                          <Info className="h-3 w-3" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        className="w-72"
                                        align="start"
                                      >
                                        <div className="space-y-2 text-sm">
                                          <p className="font-medium">
                                            {selectedSystem.name}
                                          </p>
                                          {selectedSystem.systemKey && (
                                            <p className="text-muted-foreground">
                                              Ключ: {selectedSystem.systemKey}
                                            </p>
                                          )}
                                          <Separator />
                                          <div>
                                            <p className="text-muted-foreground">
                                              Комплектующие
                                            </p>
                                            <p className="font-medium">
                                              {selectedSystem.components
                                                ?.length || 0}{" "}
                                              шт.
                                            </p>
                                            {selectedSystem.components &&
                                              selectedSystem.components.length >
                                                0 && (
                                                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                                  {selectedSystem.components
                                                    .slice(0, 5)
                                                    .map((comp) => (
                                                      <li key={comp.id}>
                                                        • {comp.name}
                                                      </li>
                                                    ))}
                                                  {selectedSystem.components
                                                    .length > 5 && (
                                                    <li>
                                                      ... и ещё{" "}
                                                      {selectedSystem.components
                                                        .length - 5}
                                                    </li>
                                                  )}
                                                </ul>
                                              )}
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
                                                Категория:{" "}
                                                {currentFabric?.category || "—"}
                                              </p>
                                              <p className="text-xs">
                                                Площадь:{" "}
                                                {(widthM * heightM).toFixed(2)}{" "}
                                                м²
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
                                                <p className="text-xs text-muted-foreground">
                                                  (коэффициент × множитель)
                                                </p>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger
                                      className="h-9"
                                      data-testid={`select-sash-system-${index}`}
                                    >
                                      <SelectValue placeholder="Система" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {systems.map((system) => (
                                      <SelectItem
                                        key={system.id}
                                        value={system.id}
                                      >
                                        {system.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name={`sashes.${index}.systemColorId`}
                          render={({ field }) => (
                            <FormItem className="flex-1 min-w-[100px]">
                              <FormLabel className="text-xs">
                                Цвет сист.
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    className="h-9"
                                    data-testid={`select-sash-system-color-${index}`}
                                  >
                                    <SelectValue placeholder="Цвет" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {colors.map((color) => (
                                    <SelectItem key={color.id} value={color.id}>
                                      {color.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`sashes.${index}.fabricId`}
                          render={({ field }) => {
                            const selectedFabricInfo = fabricStock.find(
                              (f) => f.id === field.value
                            );
                            return (
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
                                          data-testid={`button-fabric-info-${index}`}
                                        >
                                          <Info className="h-3 w-3" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        className="w-64"
                                        align="start"
                                      >
                                        <div className="space-y-2 text-sm">
                                          <p className="font-medium">
                                            {selectedFabricInfo.name}
                                          </p>
                                          {selectedFabricInfo.category && (
                                            <p className="text-muted-foreground">
                                              Категория:{" "}
                                              {selectedFabricInfo.category}
                                            </p>
                                          )}
                                          {selectedFabricInfo.width && (
                                            <p className="text-muted-foreground">
                                              Ширина: {selectedFabricInfo.width}{" "}
                                              м
                                            </p>
                                          )}
                                          <Separator />
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <p className="text-muted-foreground">
                                                Остаток
                                              </p>
                                              <p className="font-medium">
                                                {selectedFabricInfo.stock.quantity.toFixed(
                                                  2
                                                )}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-muted-foreground">
                                                Посл. цена
                                              </p>
                                              <p className="font-medium">
                                                {formatCurrency(
                                                  selectedFabricInfo.stock
                                                    .lastPrice
                                                )}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-muted-foreground">
                                                Ср. цена
                                              </p>
                                              <p className="font-medium">
                                                {formatCurrency(
                                                  selectedFabricInfo.stock
                                                    .avgPrice
                                                )}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-muted-foreground">
                                                Сумма
                                              </p>
                                              <p className="font-medium">
                                                {formatCurrency(
                                                  selectedFabricInfo.stock
                                                    .totalValue
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger
                                      className="h-9"
                                      data-testid={`select-sash-fabric-${index}`}
                                    >
                                      <SelectValue placeholder="Ткань" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {fabrics.map((fabric) => (
                                      <SelectItem
                                        key={fabric.id}
                                        value={fabric.id}
                                      >
                                        {fabric.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name={`sashes.${index}.fabricColorId`}
                          render={({ field }) => (
                            <FormItem className="flex-1 min-w-[100px]">
                              <FormLabel className="text-xs">
                                Цвет ткани
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    className="h-9"
                                    data-testid={`select-sash-fabric-color-${index}`}
                                  >
                                    <SelectValue placeholder="Цвет" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {colors.map((color) => (
                                    <SelectItem key={color.id} value={color.id}>
                                      {color.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`sashes.${index}.controlSide`}
                          render={({ field }) => (
                            <FormItem className="flex-1 min-w-[90px]">
                              <FormLabel className="text-xs">
                                Управление
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    className="h-9"
                                    data-testid={`select-sash-control-${index}`}
                                  >
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
                            data-testid={`button-remove-sash-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}

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
                      data-testid="button-add-sash"
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
                              data-testid="input-sale-price"
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
                                const { totalCost, sashDetails } =
                                  calculateCostPrice(sashes as typeof fields);
                                setCostCalculationDetails({
                                  totalCost,
                                  sashDetails,
                                });
                                setShowCostCalculation(true);
                              }}
                              data-testid="button-show-cost-calculation"
                            >
                              🧪 Тест расчета
                            </Button>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-cost-price"
                              className="bg-muted"
                              readOnly
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Ткань (площадь × ср. цена × множитель) +
                            комплектующие
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
                          <Textarea
                            {...field}
                            rows={2}
                            data-testid="input-comment"
                          />
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
                      disabled={updateMutation.isPending}
                      data-testid="button-submit-order"
                    >
                      {updateMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Сохранить
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

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

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Заказ #{viewingOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          {viewingOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Дата</p>
                  <p className="font-medium">
                    {format(new Date(viewingOrder.date), "dd.MM.yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Дилер</p>
                  <p className="font-medium">
                    {viewingOrder.dealer?.fullName || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <StatusBadge
                    status={(viewingOrder.status as OrderStatus) || "Новый"}
                  />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Долг дилера</p>
                  <BalanceBadge
                    balance={parseFloat(
                      viewingOrder.dealerDebt?.toString() || "0"
                    )}
                  />
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">
                  Створки ({viewingOrder.sashes?.length || 0})
                </h4>
                {viewingOrder.sashes?.map((sash, idx) => (
                  <Card key={sash.id} className="mb-2">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Размеры:
                          </span>{" "}
                          {sash.width}x{sash.height}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Система:
                          </span>{" "}
                          {sash.system?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ткань:</span>{" "}
                          {sash.fabric?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Цена:</span>{" "}
                          {formatCurrency(sash.sashPrice)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Продажа</p>
                  <p className="font-medium">
                    {formatCurrency(viewingOrder.salePrice)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Себестоимость</p>
                  <p className="font-medium">
                    {formatCurrency(viewingOrder.costPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Прибыль</p>
                  <BalanceBadge
                    balance={
                      parseFloat(viewingOrder.salePrice?.toString() || "0") -
                      parseFloat(viewingOrder.costPrice?.toString() || "0")
                    }
                  />
                </div>
              </div>
              {viewingOrder.comment && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Комментарий</p>
                    <p>{viewingOrder.comment}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить заказ?</DialogTitle>
          </DialogHeader>
          <p>
            Вы уверены, что хотите удалить заказ #{orderToDelete?.orderNumber}?
            Это действие необратимо.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                orderToDelete && deleteMutation.mutate(orderToDelete.id)
              }
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог с деталями расчета себестоимости */}
      <Dialog open={showCostCalculation} onOpenChange={setShowCostCalculation}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🧪 Тест расчета себестоимости</DialogTitle>
          </DialogHeader>
          {costCalculationDetails && (
            <div className="space-y-4">
              <Card className="bg-primary/10 border-primary">
                <CardContent className="py-4 space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Общая формула:
                    </p>
                    <p className="font-mono text-sm mt-1">
                      Себестоимость = Ткань + Комплектующие
                    </p>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm font-medium">📦 Расчет ткани:</p>
                    <p className="font-mono text-xs mt-1">
                      Площадь(м²) × Цена_ткани × Множитель_типа
                    </p>
                    <ul className="text-sm ml-4 mt-1">
                      <li>
                        • <Badge variant="secondary">Зебра</Badge> → множитель ={" "}
                        <span className="font-bold text-orange-600">2</span>
                      </li>
                      <li>
                        • <Badge variant="outline">Рулон</Badge> → множитель ={" "}
                        <span className="font-bold">1</span>
                      </li>
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm font-medium">
                      🔧 Расчет комплектующих:
                    </p>
                    <ul className="text-sm ml-4 mt-1 space-y-1">
                      <li>
                        • Если единица <Badge variant="outline">м</Badge> /{" "}
                        <Badge variant="outline">пм</Badge>:
                        <p className="font-mono text-xs ml-2">
                          Цена × Размер(ширина/высота) × Множитель × Кол-во
                        </p>
                        <p className="text-xs text-muted-foreground ml-2">
                          (если не указан размер — используется ширина)
                        </p>
                      </li>
                      <li>
                        • Если единица <Badge variant="outline">шт</Badge> или{" "}
                        <Badge variant="outline">упак</Badge>:
                        <p className="font-mono text-xs ml-2">Цена × Кол-во</p>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {costCalculationDetails.sashDetails.length === 0 ? (
                <Card>
                  <CardContent className="py-4">
                    <p className="text-muted-foreground text-center">
                      Нет данных для расчета. Заполните ширину, высоту, ткань и
                      систему для створок.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                costCalculationDetails.sashDetails.map((sash) => (
                  <Card key={sash.index}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">
                        Створка #{sash.index}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Размеры:
                          </span>{" "}
                          <span className="font-mono">
                            {sash.width} × {sash.height} мм
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Площадь:
                          </span>{" "}
                          <span className="font-mono">
                            {(
                              (sash.width / 1000) *
                              (sash.height / 1000)
                            ).toFixed(4)}{" "}
                            м²
                          </span>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <p className="text-sm font-medium mb-2">📦 Ткань:</p>
                        <div className="bg-muted/50 rounded p-2 text-sm space-y-1">
                          <div className="flex justify-between">
                            <span>Название:</span>
                            <span className="font-medium">
                              {sash.fabricName || "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Тип:</span>
                            <span>
                              {sash.fabricType === "zebra" ? (
                                <Badge variant="secondary">Зебра</Badge>
                              ) : (
                                <Badge variant="outline">Рулон</Badge>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Ср. цена (за м²):</span>
                            <span className="font-mono">
                              {formatCurrency(sash.fabricAvgPrice)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Множитель типа:</span>
                            <span className="font-bold text-orange-600">
                              ×{sash.fabricMultiplier}
                            </span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-medium">
                            <span>Формула:</span>
                            <span className="font-mono text-xs">
                              {(
                                (sash.width / 1000) *
                                (sash.height / 1000)
                              ).toFixed(4)}{" "}
                              × {sash.fabricAvgPrice.toFixed(2)} ×{" "}
                              {sash.fabricMultiplier}
                            </span>
                          </div>
                          <div className="flex justify-between font-medium text-primary">
                            <span>Стоимость ткани:</span>
                            <span className="font-mono">
                              {formatCurrency(sash.fabricCost)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">
                          🔧 Комплектующие:
                        </p>
                        <div className="bg-muted/50 rounded p-2 text-sm space-y-2">
                          {sash.componentsDetails.length > 0 ? (
                            <>
                              {sash.componentsDetails.map((comp, idx) => (
                                <div
                                  key={idx}
                                  className="border-b border-muted pb-2 last:border-0 last:pb-0"
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="font-medium">
                                        {comp.name}
                                      </span>
                                      <div className="text-xs text-muted-foreground">
                                        <Badge
                                          variant="outline"
                                          className="mr-1"
                                        >
                                          {comp.unit}
                                        </Badge>
                                        {["м", "пм", "п.м.", "м.п."].includes(
                                          comp.unit.toLowerCase()
                                        ) &&
                                          comp.sizeValue > 0 && (
                                            <span>
                                              {comp.sizeSource
                                                ? `по ${
                                                    comp.sizeSource === "width"
                                                      ? "ширине"
                                                      : "высоте"
                                                  }`
                                                : "по ширине (авто)"}
                                              : {comp.sizeValue.toFixed(3)}м
                                            </span>
                                          )}
                                        {comp.quantity !== 1 && (
                                          <span className="ml-1">
                                            × {comp.quantity} шт
                                          </span>
                                        )}
                                        {comp.sizeMultiplier !== 1 && (
                                          <span className="ml-1 text-orange-600">
                                            множ: ×{comp.sizeMultiplier}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="font-mono font-medium">
                                      {formatCurrency(comp.totalPrice)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                                    {comp.formula} ={" "}
                                    {formatCurrency(comp.totalPrice)}
                                  </div>
                                  {/* Отладочная информация */}
                                  <div className="text-[10px] text-muted-foreground/50 mt-1 font-mono bg-muted/30 rounded px-1">
                                    [API: qty={comp.quantity}, src=
                                    {comp.sizeSource || "null"}, mult=
                                    {comp.sizeMultiplier}]
                                  </div>
                                </div>
                              ))}
                              <Separator className="my-2" />
                              <div className="flex justify-between font-medium text-primary">
                                <span>Итого комплектующие:</span>
                                <span className="font-mono">
                                  {formatCurrency(sash.componentsCost)}
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              Нет комплектующих
                            </span>
                          )}
                        </div>
                      </div>

                      <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                        <CardContent className="py-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">
                              Себестоимость створки:
                            </span>
                            <span className="font-mono text-lg font-bold text-green-700 dark:text-green-400">
                              {formatCurrency(sash.sashCost)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">
                            = {formatCurrency(sash.fabricCost)} (ткань) +{" "}
                            {formatCurrency(sash.componentsCost)} (компл.)
                          </p>
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>
                ))
              )}

              <Card className="bg-primary text-primary-foreground">
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">
                      ИТОГО СЕБЕСТОИМОСТЬ:
                    </span>
                    <span className="font-mono text-2xl font-bold">
                      {formatCurrency(costCalculationDetails.totalCost)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowCostCalculation(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
