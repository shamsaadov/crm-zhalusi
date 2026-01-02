import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge, formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Eye, FileText, Loader2, X, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORDER_STATUSES, CONTROL_SIDES, type Order, type OrderStatus, type Dealer, type System, type Fabric, type Color } from "@shared/schema";
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

type SashFormValues = z.infer<typeof sashSchema>;
type OrderFormValues = z.infer<typeof orderFormSchema>;

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

export default function OrdersPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithRelations | null>(null);
  const [viewingOrder, setViewingOrder] = useState<OrderWithRelations | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderWithRelations | null>(null);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderWithRelations[]>({
    queryKey: ["/api/orders"],
  });

  const { data: dealers = [] } = useQuery<Dealer[]>({
    queryKey: ["/api/dealers"],
  });

  const { data: systems = [] } = useQuery<System[]>({
    queryKey: ["/api/systems"],
  });

  const { data: fabrics = [] } = useQuery<Fabric[]>({
    queryKey: ["/api/fabrics"],
  });

  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const { data: stockData } = useQuery<{ fabrics: FabricWithStock[] }>({
    queryKey: ["/api/stock"],
  });

  const fabricStock = stockData?.fabrics || [];

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
      sashes: [{ width: "", height: "", systemId: "", systemColorId: "", controlSide: "", fabricId: "", fabricColorId: "", sashPrice: "", sashCost: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "sashes",
  });

  const createMutation = useMutation({
    mutationFn: (data: OrderFormValues) => apiRequest("POST", "/api/orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Успешно", description: "Заказ создан" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
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
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
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
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
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
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: OrderFormValues) => {
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openViewDialog = async (order: OrderWithRelations) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, { credentials: "include" });
      const fullOrder = await response.json();
      setViewingOrder(fullOrder);
      setIsViewDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
    }
  };

  const openEditDialog = async (order: OrderWithRelations) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, { credentials: "include" });
      const fullOrder: OrderWithRelations = await response.json();
      setEditingOrder(fullOrder);
      form.reset({
        date: fullOrder.date,
        dealerId: fullOrder.dealerId || "",
        status: fullOrder.status || "Новый",
        salePrice: fullOrder.salePrice?.toString() || "",
        costPrice: fullOrder.costPrice?.toString() || "",
        comment: fullOrder.comment || "",
        sashes: fullOrder.sashes?.map(s => ({
          width: s.width?.toString() || "",
          height: s.height?.toString() || "",
          systemId: s.systemId || "",
          systemColorId: s.systemColorId || "",
          controlSide: s.controlSide || "",
          fabricId: s.fabricId || "",
          fabricColorId: s.fabricColorId || "",
          sashPrice: s.sashPrice?.toString() || "",
          sashCost: s.sashCost?.toString() || "",
        })) || [{ width: "", height: "", systemId: "", systemColorId: "", controlSide: "", fabricId: "", fabricColorId: "", sashPrice: "", sashCost: "" }],
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
            <tr><td>Заказ #${order.orderNumber}</td><td>${order.sashesCount || 1}</td><td>${formatCurrency(order.salePrice)}</td></tr>
          </table>
          <p class="total">Итого к оплате: ${formatCurrency(order.salePrice)}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

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
        <span className="font-mono" data-testid={`text-order-number-${order.id}`}>
          {order.orderNumber}
        </span>
      ),
    },
    {
      key: "date",
      header: "Дата",
      cell: (order: OrderWithRelations) => format(new Date(order.date), "dd.MM.yyyy"),
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
          onValueChange={(value) => updateStatusMutation.mutate({ id: order.id, status: value })}
        >
          <SelectTrigger className="w-[140px]" data-testid={`select-status-${order.id}`}>
            <StatusBadge status={order.status as OrderStatus || "Новый"} />
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
        <BalanceBadge balance={parseFloat(order.dealerDebt?.toString() || "0")} />
      ),
      className: "text-right",
    },
    {
      key: "profit",
      header: "Прибыль",
      cell: (order: OrderWithRelations) => {
        const profit = (parseFloat(order.salePrice?.toString() || "0") - parseFloat(order.costPrice?.toString() || "0"));
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
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingOrder(null);
            form.reset({
              date: format(new Date(), "yyyy-MM-dd"),
              dealerId: "",
              status: "Новый",
              salePrice: "",
              costPrice: "",
              comment: "",
              sashes: [{ width: "", height: "", systemId: "", systemColorId: "", controlSide: "", fabricId: "", fabricColorId: "", sashPrice: "", sashCost: "" }],
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-order">
              <Plus className="h-4 w-4 mr-2" />
              Добавить заказ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOrder ? "Редактировать заказ" : "Новый заказ"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дата</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-order-date" />
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                        <Select onValueChange={field.onChange} value={field.value}>
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

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Створки</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ width: "", height: "", systemId: "", systemColorId: "", controlSide: "", fabricId: "", fabricColorId: "", sashPrice: "", sashCost: "" })}
                      data-testid="button-add-sash"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить створку
                    </Button>
                  </div>

                  {fields.map((field, index) => (
                    <Card key={field.id}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">Створка {index + 1}</CardTitle>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              data-testid={`button-remove-sash-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-4 gap-4">
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.width`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ширина</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid={`input-sash-width-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.height`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Высота</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid={`input-sash-height-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.sashPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Цена</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid={`input-sash-price-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.sashCost`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Себестоимость</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid={`input-sash-cost-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-5 gap-4">
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.systemId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Система</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-sash-system-${index}`}>
                                      <SelectValue placeholder="Система" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {systems.map((system) => (
                                      <SelectItem key={system.id} value={system.id}>
                                        {system.name}
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
                            name={`sashes.${index}.systemColorId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Цвет системы</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-sash-system-color-${index}`}>
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
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.fabricId`}
                            render={({ field }) => {
                              const selectedFabricInfo = fabricStock.find(f => f.id === field.value);
                              return (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-1">
                                    Ткань
                                    {field.value && selectedFabricInfo && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button size="icon" variant="ghost" className="h-5 w-5" type="button" data-testid={`button-fabric-info-${index}`}>
                                            <Info className="h-3 w-3" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64" align="start">
                                          <div className="space-y-2 text-sm">
                                            <p className="font-medium">{selectedFabricInfo.name}</p>
                                            {selectedFabricInfo.category && <p className="text-muted-foreground">Категория: {selectedFabricInfo.category}</p>}
                                            {selectedFabricInfo.width && <p className="text-muted-foreground">Ширина: {selectedFabricInfo.width} м</p>}
                                            <Separator />
                                            <div className="grid grid-cols-2 gap-2">
                                              <div>
                                                <p className="text-muted-foreground">Остаток</p>
                                                <p className="font-medium">{selectedFabricInfo.stock.quantity.toFixed(2)}</p>
                                              </div>
                                              <div>
                                                <p className="text-muted-foreground">Посл. цена</p>
                                                <p className="font-medium">{formatCurrency(selectedFabricInfo.stock.lastPrice)}</p>
                                              </div>
                                              <div>
                                                <p className="text-muted-foreground">Ср. цена</p>
                                                <p className="font-medium">{formatCurrency(selectedFabricInfo.stock.avgPrice)}</p>
                                              </div>
                                              <div>
                                                <p className="text-muted-foreground">Сумма</p>
                                                <p className="font-medium">{formatCurrency(selectedFabricInfo.stock.totalValue)}</p>
                                              </div>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid={`select-sash-fabric-${index}`}>
                                        <SelectValue placeholder="Ткань" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {fabrics.map((fabric) => (
                                        <SelectItem key={fabric.id} value={fabric.id}>
                                          {fabric.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.fabricColorId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Цвет ткани</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-sash-fabric-color-${index}`}>
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
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`sashes.${index}.controlSide`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Управление</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-sash-control-${index}`}>
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
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="salePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Общая цена продажи</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-sale-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="costPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Общая себестоимость</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-cost-price" />
                        </FormControl>
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
                        <Textarea {...field} data-testid="input-comment" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-order">
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingOrder ? "Сохранить" : "Создать"}
                  </Button>
                </div>
              </form>
            </Form>
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
            options: ORDER_STATUSES.map(s => ({ value: s, label: s })),
            onChange: setStatusFilter,
          },
          {
            key: "dealer",
            label: "Дилер",
            value: dealerFilter,
            options: dealers.map(d => ({ value: d.id, label: d.fullName })),
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
                  <p className="font-medium">{format(new Date(viewingOrder.date), "dd.MM.yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Дилер</p>
                  <p className="font-medium">{viewingOrder.dealer?.fullName || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <StatusBadge status={viewingOrder.status as OrderStatus || "Новый"} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Долг дилера</p>
                  <BalanceBadge balance={parseFloat(viewingOrder.dealerDebt?.toString() || "0")} />
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Створки ({viewingOrder.sashes?.length || 0})</h4>
                {viewingOrder.sashes?.map((sash, idx) => (
                  <Card key={sash.id} className="mb-2">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Размеры:</span> {sash.width}x{sash.height}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Система:</span> {sash.system?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ткань:</span> {sash.fabric?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Цена:</span> {formatCurrency(sash.sashPrice)}
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
                  <p className="font-medium">{formatCurrency(viewingOrder.salePrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Себестоимость</p>
                  <p className="font-medium">{formatCurrency(viewingOrder.costPrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Прибыль</p>
                  <BalanceBadge balance={parseFloat(viewingOrder.salePrice?.toString() || "0") - parseFloat(viewingOrder.costPrice?.toString() || "0")} />
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
          <p>Вы уверены, что хотите удалить заказ #{orderToDelete?.orderNumber}? Это действие необратимо.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Отмена</Button>
            <Button 
              variant="destructive" 
              onClick={() => orderToDelete && deleteMutation.mutate(orderToDelete.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
