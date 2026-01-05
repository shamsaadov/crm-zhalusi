import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, Eye, Trash2, X, Package, Pencil, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  type WarehouseReceipt,
  type Supplier,
  type Fabric,
  type Component,
} from "@shared/schema";
import { format } from "date-fns";

const itemSchema = z.object({
  itemType: z.enum(["fabric", "component"]),
  componentId: z.string().optional(),
  fabricId: z.string().optional(),
  quantity: z.string().min(1, "Обязательное поле"),
  price: z.string().min(1, "Обязательное поле"),
  total: z.string().optional(),
});

const warehouseSchema = z.object({
  supplierId: z.string().min(1, "Обязательное поле"),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
  items: z.array(itemSchema).min(1, "Добавьте минимум одну позицию"),
});

const inventoryAdjustmentSchema = z.object({
  newQuantity: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
});

type InventoryAdjustmentFormValues = z.infer<typeof inventoryAdjustmentSchema>;

type ItemFormValues = z.infer<typeof itemSchema>;
type WarehouseFormValues = z.infer<typeof warehouseSchema>;

interface ReceiptItem {
  id: string;
  receiptId: string;
  itemType: string;
  fabricId: string | null;
  componentId: string | null;
  quantity: string | null;
  price: string | null;
  total: string | null;
  fabric?: Fabric;
  component?: Component;
}

interface WarehouseReceiptWithRelations extends WarehouseReceipt {
  supplier?: Supplier;
  supplierBalance?: number;
  itemsCount?: number;
  items?: ReceiptItem[];
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

export default function WarehousePage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] =
    useState<WarehouseReceiptWithRelations | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] =
    useState<WarehouseReceiptWithRelations | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [search, setSearch] = useState("");
  
  // Inventory adjustment state
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<{
    type: "fabric" | "component";
    id: string;
    name: string;
    currentQuantity: number;
    unit?: string;
  } | null>(null);

  const {
    data: receiptsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{
    data: WarehouseReceiptWithRelations[];
    nextCursor: string | null;
    hasMore: boolean;
  }>({
    queryKey: ["/api/warehouse", { paginated: true }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ paginated: "true", limit: "20" });
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/warehouse?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const receipts = useMemo(() => {
    return receiptsData?.pages.flatMap((page) => page.data) ?? [];
  }, [receiptsData]);

  const { loadMoreRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: fabrics = [] } = useQuery<Fabric[]>({
    queryKey: ["/api/fabrics"],
  });

  const { data: components = [] } = useQuery<Component[]>({
    queryKey: ["/api/components"],
  });

  const { data: stockData, isLoading: stockLoading } = useQuery<{
    fabrics: FabricWithStock[];
    components: ComponentWithStock[];
  }>({
    queryKey: ["/api/stock"],
  });

  const fabricStock = stockData?.fabrics || [];
  const componentStock = stockData?.components || [];

  // Fetch inventory adjustments (writeoffs and receipts without order/supplier)
  const { data: adjustments = [] } = useQuery<{
    id: string;
    type: "increase" | "decrease";
    itemType: string;
    itemName: string;
    quantity: string;
    date: string;
    comment: string | null;
  }[]>({
    queryKey: ["/api/stock/adjustments"],
  });

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      supplierId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
      items: [
        {
          itemType: "fabric",
          componentId: "",
          fabricId: "",
          quantity: "",
          price: "",
          total: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });

  // Inventory adjustment form
  const adjustmentForm = useForm<InventoryAdjustmentFormValues>({
    resolver: zodResolver(inventoryAdjustmentSchema),
    defaultValues: {
      newQuantity: "",
      comment: "",
    },
  });

  useEffect(() => {
    watchedItems?.forEach((item, index) => {
      const qty = parseFloat(item.quantity || "0");
      const price = parseFloat(item.price || "0");
      const total = (qty * price).toFixed(2);
      if (item.total !== total) {
        form.setValue(`items.${index}.total`, total);
      }
    });
  }, [watchedItems, form]);

  const createMutation = useMutation({
    mutationFn: (data: WarehouseFormValues) => {
      const payload = {
        ...data,
        items: data.items.map((item) => ({
          itemType: item.itemType,
          componentId:
            item.itemType === "component" ? item.componentId : undefined,
          fabricId: item.itemType === "fabric" ? item.fabricId : undefined,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
      };
      return apiRequest("POST", "/api/warehouse", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      setIsDialogOpen(false);
      form.reset({
        supplierId: "",
        date: format(new Date(), "yyyy-MM-dd"),
        comment: "",
        items: [
          {
            itemType: "fabric",
            componentId: "",
            fabricId: "",
            quantity: "",
            price: "",
            total: "",
          },
        ],
      });
      toast({ title: "Успешно", description: "Поступление добавлено" });
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
    mutationFn: (id: string) => apiRequest("DELETE", `/api/warehouse/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      setIsDeleteDialogOpen(false);
      setReceiptToDelete(null);
      toast({ title: "Успешно", description: "Поступление удалено" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Inventory adjustment mutation
  const inventoryAdjustmentMutation = useMutation({
    mutationFn: (data: {
      itemType: "fabric" | "component";
      itemId: string;
      newQuantity: string;
      currentQuantity: number;
      comment?: string;
    }) => apiRequest("POST", "/api/stock/adjustment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse"] });
      setIsAdjustmentDialogOpen(false);
      setAdjustmentItem(null);
      adjustmentForm.reset();
      toast({ title: "Успешно", description: "Остаток скорректирован" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: WarehouseFormValues) => {
    createMutation.mutate(data);
  };

  const openViewDialog = async (receipt: WarehouseReceiptWithRelations) => {
    try {
      const response = await fetch(`/api/warehouse/${receipt.id}`, {
        credentials: "include",
      });
      const fullReceipt = await response.json();
      setViewingReceipt(fullReceipt);
      setIsViewDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    }
  };

  const openDeleteDialog = (receipt: WarehouseReceiptWithRelations) => {
    setReceiptToDelete(receipt);
    setIsDeleteDialogOpen(true);
  };

  const openAdjustmentDialog = (
    type: "fabric" | "component",
    item: FabricWithStock | ComponentWithStock
  ) => {
    setAdjustmentItem({
      type,
      id: item.id,
      name: item.name,
      currentQuantity: item.stock.quantity,
      unit: type === "component" ? (item as ComponentWithStock).unit || "шт" : "м²",
    });
    adjustmentForm.reset({
      newQuantity: item.stock.quantity.toFixed(2),
      comment: "",
    });
    setIsAdjustmentDialogOpen(true);
  };

  const onAdjustmentSubmit = (data: InventoryAdjustmentFormValues) => {
    if (adjustmentItem) {
      inventoryAdjustmentMutation.mutate({
        itemType: adjustmentItem.type,
        itemId: adjustmentItem.id,
        newQuantity: data.newQuantity,
        currentQuantity: adjustmentItem.currentQuantity,
        comment: data.comment,
      });
    }
  };

  const fetchPreviousPrice = async (
    itemType: string,
    itemId: string,
    index: number
  ) => {
    if (!itemId) return;
    try {
      const response = await fetch(
        `/api/warehouse/previous-price?itemType=${itemType}&itemId=${itemId}`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (data.price) {
        form.setValue(`items.${index}.price`, data.price);
      }
    } catch {
      // Ignore errors
    }
  };

  const filteredReceipts = receipts.filter((r) => {
    if (supplierFilter !== "all" && r.supplierId !== supplierFilter)
      return false;
    if (dateRange.from && new Date(r.date) < dateRange.from) return false;
    if (dateRange.to && new Date(r.date) > dateRange.to) return false;
    return true;
  });

  const columns = [
    {
      key: "date",
      header: "Дата",
      cell: (r: WarehouseReceiptWithRelations) =>
        format(new Date(r.date), "dd.MM.yyyy"),
    },
    {
      key: "supplier",
      header: "Поставщик",
      cell: (r: WarehouseReceiptWithRelations) => r.supplier?.name || "-",
    },
    {
      key: "itemsCount",
      header: "Позиций",
      cell: (r: WarehouseReceiptWithRelations) => (
        <Badge variant="secondary">{r.itemsCount || 0}</Badge>
      ),
    },
    {
      key: "total",
      header: "Сумма",
      cell: (r: WarehouseReceiptWithRelations) => (
        <span className="font-mono">{formatCurrency(r.total)}</span>
      ),
      className: "text-right",
    },
    {
      key: "supplierDebt",
      header: "Долг поставщику",
      cell: (r: WarehouseReceiptWithRelations) => (
        <BalanceBadge balance={-(r.supplierBalance || 0)} />
      ),
      className: "text-right",
    },
    {
      key: "comment",
      header: "Комментарий",
      cell: (r: WarehouseReceiptWithRelations) => (
        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">
          {r.comment || "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (r: WarehouseReceiptWithRelations) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openViewDialog(r)}
            data-testid={`button-view-${r.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openDeleteDialog(r)}
            data-testid={`button-delete-${r.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Склад">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              form.reset({
                supplierId: "",
                date: format(new Date(), "yyyy-MM-dd"),
                comment: "",
                items: [
                  {
                    itemType: "fabric",
                    componentId: "",
                    fabricId: "",
                    quantity: "",
                    price: "",
                    total: "",
                  },
                ],
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-receipt">
              <Plus className="h-4 w-4 mr-2" />
              Добавить поступление
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новое поступление</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Поставщик</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={suppliers.map((supplier) => ({
                              value: supplier.id,
                              label: supplier.name,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Выберите поставщика"
                            searchPlaceholder="Поиск поставщика..."
                            emptyText="Поставщик не найден"
                            data-testid="select-supplier"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                            data-testid="input-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Позиции</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        append({
                          itemType: "fabric",
                          componentId: "",
                          fabricId: "",
                          quantity: "",
                          price: "",
                          total: "",
                        })
                      }
                      data-testid="button-add-item"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить позицию
                    </Button>
                  </div>

                  {fields.map((field, index) => (
                    <Card key={field.id}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">
                            Позиция {index + 1}
                          </CardTitle>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              data-testid={`button-remove-item-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`items.${index}.itemType`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Тип</FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  className="flex gap-4"
                                >
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="fabric"
                                      id={`fabric-${index}`}
                                    />
                                    <Label htmlFor={`fabric-${index}`}>
                                      Ткань
                                    </Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                      value="component"
                                      id={`component-${index}`}
                                    />
                                    <Label htmlFor={`component-${index}`}>
                                      Комплектующие
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-4 gap-4">
                          {watchedItems?.[index]?.itemType === "fabric" ? (
                            <FormField
                              control={form.control}
                              name={`items.${index}.fabricId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ткань</FormLabel>
                                  <FormControl>
                                    <SearchableSelect
                                      options={fabrics.map((fabric) => ({
                                        value: fabric.id,
                                        label: fabric.name,
                                      }))}
                                      value={field.value}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        fetchPreviousPrice(
                                          "fabric",
                                          value,
                                          index
                                        );
                                      }}
                                      placeholder="Выберите ткань"
                                      searchPlaceholder="Поиск ткани..."
                                      emptyText="Ткань не найдена"
                                      data-testid={`select-fabric-${index}`}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          ) : (
                            <FormField
                              control={form.control}
                              name={`items.${index}.componentId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Комплектующие</FormLabel>
                                  <FormControl>
                                    <SearchableSelect
                                      options={components.map((component) => ({
                                        value: component.id,
                                        label: component.name,
                                      }))}
                                      value={field.value}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        fetchPreviousPrice(
                                          "component",
                                          value,
                                          index
                                        );
                                      }}
                                      placeholder="Выберите комплектующую"
                                      searchPlaceholder="Поиск комплектующей..."
                                      emptyText="Комплектующая не найдена"
                                      data-testid={`select-component-${index}`}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Кол-во</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`items.${index}.price`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Цена</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    data-testid={`input-price-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`items.${index}.total`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Сумма</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    disabled
                                    className="bg-muted"
                                    data-testid={`input-total-${index}`}
                                  />
                                </FormControl>
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
                    data-testid="button-submit"
                  >
                    {createMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Добавить
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="receipts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receipts" data-testid="tab-receipts">
            Поступления
          </TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-stock">
            Остатки
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receipts" className="space-y-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Поиск..."
            showDateFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filters={[
              {
                key: "supplier",
                label: "Поставщик",
                value: supplierFilter,
                options: suppliers.map((s) => ({ value: s.id, label: s.name })),
                onChange: setSupplierFilter,
              },
            ]}
          />

          <DataTable
            columns={columns}
            data={filteredReceipts}
            isLoading={isLoading}
            emptyMessage="Поступления не найдены"
            getRowKey={(r) => r.id}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            loadMoreRef={loadMoreRef}
          />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          {stockLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Ткани ({fabricStock.length})
                </h3>
                {fabricStock.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Нет тканей
                  </p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">
                            Наименование
                          </th>
                          <th className="text-left py-2 px-3 font-medium w-24">
                            Категория
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-24">
                            Остаток
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-28">
                            Цена
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-32">
                            Сумма
                          </th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {fabricStock.map((fabric) => (
                          <tr
                            key={fabric.id}
                            className={`hover:bg-muted/30 transition-colors ${fabric.stock.quantity <= 0 ? "text-muted-foreground" : ""}`}
                          >
                            <td className="py-1.5 px-3">{fabric.name}</td>
                            <td className="py-1.5 px-3">
                              {fabric.category && (
                                <Badge
                                  variant="outline"
                                  className="text-xs py-0"
                                >
                                  {fabric.category}
                                </Badge>
                              )}
                            </td>
                            <td className={`py-1.5 px-3 text-right font-mono ${fabric.stock.quantity < 0 ? "text-destructive" : ""}`}>
                              {fabric.stock.quantity.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono">
                              {formatCurrency(fabric.stock.lastPrice)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-medium">
                              {formatCurrency(
                                fabric.stock.quantity > 0
                                  ? fabric.stock.quantity * fabric.stock.lastPrice
                                  : 0
                              )}
                            </td>
                            <td className="py-1.5 px-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openAdjustmentDialog("fabric", fabric)}
                                title="Корректировка остатка"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 border-t">
                        <tr>
                          <td
                            colSpan={5}
                            className="py-2 px-3 text-right font-medium"
                          >
                            Итого:
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {formatCurrency(
                              fabricStock
                                .filter((f) => f.stock.quantity > 0)
                                .reduce((sum, f) => sum + f.stock.quantity * f.stock.lastPrice, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Комплектующие ({componentStock.length})
                </h3>
                {componentStock.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Нет комплектующих
                  </p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">
                            Наименование
                          </th>
                          <th className="text-left py-2 px-3 font-medium w-20">
                            Ед.
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-24">
                            Остаток
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-28">
                            Цена
                          </th>
                          <th className="text-right py-2 px-3 font-medium w-32">
                            Сумма
                          </th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {componentStock.map((component) => (
                          <tr
                            key={component.id}
                            className={`hover:bg-muted/30 transition-colors ${component.stock.quantity <= 0 ? "text-muted-foreground" : ""}`}
                          >
                            <td className="py-1.5 px-3">{component.name}</td>
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {component.unit || "-"}
                            </td>
                            <td className={`py-1.5 px-3 text-right font-mono ${component.stock.quantity < 0 ? "text-destructive" : ""}`}>
                              {component.stock.quantity.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono">
                              {formatCurrency(component.stock.lastPrice)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-medium">
                              {formatCurrency(
                                component.stock.quantity > 0
                                  ? component.stock.quantity * component.stock.lastPrice
                                  : 0
                              )}
                            </td>
                            <td className="py-1.5 px-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openAdjustmentDialog("component", component)}
                                title="Корректировка остатка"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 border-t">
                        <tr>
                          <td
                            colSpan={5}
                            className="py-2 px-3 text-right font-medium"
                          >
                            Итого:
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {formatCurrency(
                              componentStock
                                .filter((c) => c.stock.quantity > 0)
                                .reduce((sum, c) => sum + c.stock.quantity * c.stock.lastPrice, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Adjustments History */}
              {adjustments.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2 text-muted-foreground">
                    <History className="h-4 w-4" />
                    История корректировок ({adjustments.length})
                  </h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">Дата</th>
                          <th className="text-left py-2 px-3 font-medium">Позиция</th>
                          <th className="text-right py-2 px-3 font-medium w-28">Изменение</th>
                          <th className="text-left py-2 px-3 font-medium">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {adjustments.map((adj) => (
                          <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {format(new Date(adj.date), "dd.MM.yyyy")}
                            </td>
                            <td className="py-1.5 px-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs py-0">
                                  {adj.itemType === "fabric" ? "Ткань" : "Компл."}
                                </Badge>
                                {adj.itemName}
                              </div>
                            </td>
                            <td className={`py-1.5 px-3 text-right font-mono ${
                              adj.type === "increase" ? "text-green-600" : "text-red-600"
                            }`}>
                              {adj.type === "increase" ? "+" : "-"}{parseFloat(adj.quantity).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {adj.comment || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Поступление от{" "}
              {viewingReceipt &&
                format(new Date(viewingReceipt.date), "dd.MM.yyyy")}
            </DialogTitle>
          </DialogHeader>
          {viewingReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Поставщик</p>
                  <p className="font-medium">
                    {viewingReceipt.supplier?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Сумма</p>
                  <p className="font-medium">
                    {formatCurrency(viewingReceipt.total)}
                  </p>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">
                  Позиции ({viewingReceipt.items?.length || 0})
                </h4>
                {viewingReceipt.items?.map((item, idx) => (
                  <Card key={item.id} className="mb-2">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Позиция:
                          </span>{" "}
                          {item.fabric?.name || item.component?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Кол-во:</span>{" "}
                          {item.quantity}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Цена:</span>{" "}
                          {formatCurrency(item.price)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Сумма:</span>{" "}
                          {formatCurrency(item.total)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {viewingReceipt.comment && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Комментарий</p>
                    <p>{viewingReceipt.comment}</p>
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
            <DialogTitle>Удалить поступление?</DialogTitle>
          </DialogHeader>
          <p>
            Вы уверены, что хотите удалить это поступление? Это действие
            необратимо.
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
                receiptToDelete && deleteMutation.mutate(receiptToDelete.id)
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

      {/* Inventory Adjustment Dialog */}
      <Dialog
        open={isAdjustmentDialogOpen}
        onOpenChange={(open) => {
          setIsAdjustmentDialogOpen(open);
          if (!open) {
            setAdjustmentItem(null);
            adjustmentForm.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Корректировка остатка</DialogTitle>
          </DialogHeader>
          {adjustmentItem && (
            <Form {...adjustmentForm}>
              <form
                onSubmit={adjustmentForm.handleSubmit(onAdjustmentSubmit)}
                className="space-y-4"
              >
                <div className="p-3 bg-muted rounded-md">
                  <p className="font-medium">{adjustmentItem.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Текущий остаток: {adjustmentItem.currentQuantity.toFixed(2)} {adjustmentItem.unit}
                  </p>
                </div>
                
                <FormField
                  control={adjustmentForm.control}
                  name="newQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Фактический остаток ({adjustmentItem.unit})</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          {...field} 
                          placeholder="Введите фактическое количество"
                        />
                      </FormControl>
                      <FormMessage />
                      {field.value && (
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            const diff = parseFloat(field.value) - adjustmentItem.currentQuantity;
                            if (diff === 0) return "Без изменений";
                            return diff > 0 
                              ? <span className="text-green-600">Приход: +{diff.toFixed(2)} {adjustmentItem.unit}</span>
                              : <span className="text-red-600">Списание: {diff.toFixed(2)} {adjustmentItem.unit}</span>;
                          })()}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={adjustmentForm.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Причина корректировки (инвентаризация, пересчёт...)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAdjustmentDialogOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="submit"
                    disabled={inventoryAdjustmentMutation.isPending}
                  >
                    {inventoryAdjustmentMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Сохранить
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
