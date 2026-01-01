import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge, formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORDER_STATUSES, CONTROL_SIDES, type Order, type OrderStatus, type Dealer, type System, type Fabric, type Color } from "@shared/schema";
import { format } from "date-fns";

const orderFormSchema = z.object({
  date: z.string().min(1, "Обязательное поле"),
  width: z.string().min(1, "Обязательное поле"),
  height: z.string().min(1, "Обязательное поле"),
  systemId: z.string().optional(),
  systemColorId: z.string().optional(),
  controlSide: z.string().optional(),
  fabricId: z.string().optional(),
  fabricColorId: z.string().optional(),
  sashesCount: z.string().optional(),
  dealerId: z.string().optional(),
  status: z.string().default("Новый"),
  salePrice: z.string().optional(),
  costPrice: z.string().optional(),
  comment: z.string().optional(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface OrderWithRelations extends Order {
  dealer?: Dealer;
  system?: System;
  fabric?: Fabric;
  dealerBalance?: number;
}

export default function OrdersPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithRelations | null>(null);
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

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      width: "",
      height: "",
      systemId: "",
      systemColorId: "",
      controlSide: "",
      fabricId: "",
      fabricColorId: "",
      sashesCount: "1",
      dealerId: "",
      status: "Новый",
      salePrice: "",
      costPrice: "",
      comment: "",
    },
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
    mutationFn: ({ id, data }: { id: string; data: Partial<OrderFormValues> }) =>
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

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/orders/${id}`, { status }),
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

  const openEditDialog = (order: OrderWithRelations) => {
    setEditingOrder(order);
    form.reset({
      date: order.date,
      width: order.width?.toString() || "",
      height: order.height?.toString() || "",
      systemId: order.systemId || "",
      systemColorId: order.systemColorId || "",
      controlSide: order.controlSide || "",
      fabricId: order.fabricId || "",
      fabricColorId: order.fabricColorId || "",
      sashesCount: order.sashesCount?.toString() || "1",
      dealerId: order.dealerId || "",
      status: order.status || "Новый",
      salePrice: order.salePrice?.toString() || "",
      costPrice: order.costPrice?.toString() || "",
      comment: order.comment || "",
    });
    setIsDialogOpen(true);
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
      cell: (order: OrderWithRelations) => (
        <div className="flex flex-col">
          <span>{order.dealer?.fullName || "-"}</span>
          {order.dealerBalance !== undefined && (
            <BalanceBadge balance={order.dealerBalance} className="text-xs" />
          )}
        </div>
      ),
    },
    {
      key: "system",
      header: "Система",
      cell: (order: OrderWithRelations) => order.system?.name || "-",
    },
    {
      key: "fabric",
      header: "Ткань",
      cell: (order: OrderWithRelations) => order.fabric?.name || "-",
    },
    {
      key: "dimensions",
      header: "Размеры (Ш×В)",
      cell: (order: OrderWithRelations) => (
        <span className="font-mono">
          {order.width}×{order.height}
        </span>
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
          <SelectTrigger className="w-[130px]" data-testid={`select-status-${order.id}`}>
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
      key: "costPrice",
      header: "Себестоимость",
      cell: (order: OrderWithRelations) => (
        <span className="font-mono">{formatCurrency(order.costPrice)}</span>
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
        <Button
          size="icon"
          variant="ghost"
          onClick={() => openEditDialog(order)}
          data-testid={`button-edit-${order.id}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
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
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-order">
              <Plus className="h-4 w-4 mr-2" />
              Добавить заказ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOrder ? "Редактировать заказ" : "Новый заказ"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="width"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ширина</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-width" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="height"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Высота</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-height" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="systemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Система</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-system">
                              <SelectValue placeholder="Выберите систему" />
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
                    name="systemColorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Цвет системы</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-system-color">
                              <SelectValue placeholder="Выберите цвет" />
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fabricId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ткань</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-fabric">
                              <SelectValue placeholder="Выберите ткань" />
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
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fabricColorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Цвет ткани</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-fabric-color">
                              <SelectValue placeholder="Выберите цвет" />
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
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="controlSide"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сторона управления</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-control-side">
                              <SelectValue placeholder="Выберите" />
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
                  <FormField
                    control={form.control}
                    name="sashesCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Кол-во створок</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} data-testid="input-sashes" />
                        </FormControl>
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="salePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Цена продажи</FormLabel>
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
                        <FormLabel>Себестоимость</FormLabel>
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
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
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
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateFilter
        filters={[
          {
            key: "status",
            label: "Статус",
            options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            key: "dealer",
            label: "Дилер",
            options: dealers.map((d) => ({ value: d.id, label: d.fullName })),
            value: dealerFilter,
            onChange: setDealerFilter,
          },
        ]}
        onReset={() => {
          setSearch("");
          setDateRange({});
          setStatusFilter("all");
          setDealerFilter("all");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredOrders}
        isLoading={ordersLoading}
        emptyMessage="Заказы не найдены"
        getRowKey={(order) => order.id}
      />
    </Layout>
  );
}
