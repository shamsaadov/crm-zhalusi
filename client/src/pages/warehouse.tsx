import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, Eye, Trash2, X, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type WarehouseReceipt, type Supplier, type Fabric, type Component } from "@shared/schema";
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
  const [viewingReceipt, setViewingReceipt] = useState<WarehouseReceiptWithRelations | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<WarehouseReceiptWithRelations | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [search, setSearch] = useState("");

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
      const res = await fetch(`/api/warehouse?${params}`, { credentials: "include" });
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

  const { data: stockData, isLoading: stockLoading } = useQuery<{ fabrics: FabricWithStock[]; components: ComponentWithStock[] }>({
    queryKey: ["/api/stock"],
  });

  const fabricStock = stockData?.fabrics || [];
  const componentStock = stockData?.components || [];

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      supplierId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
      items: [{ itemType: "fabric", componentId: "", fabricId: "", quantity: "", price: "", total: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });

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
        items: data.items.map(item => ({
          itemType: item.itemType,
          componentId: item.itemType === "component" ? item.componentId : undefined,
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
        items: [{ itemType: "fabric", componentId: "", fabricId: "", quantity: "", price: "", total: "" }],
      });
      toast({ title: "Успешно", description: "Поступление добавлено" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
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
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: WarehouseFormValues) => {
    createMutation.mutate(data);
  };

  const openViewDialog = async (receipt: WarehouseReceiptWithRelations) => {
    try {
      const response = await fetch(`/api/warehouse/${receipt.id}`, { credentials: "include" });
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

  const fetchPreviousPrice = async (itemType: string, itemId: string, index: number) => {
    if (!itemId) return;
    try {
      const response = await fetch(`/api/warehouse/previous-price?itemType=${itemType}&itemId=${itemId}`, { credentials: "include" });
      const data = await response.json();
      if (data.price) {
        form.setValue(`items.${index}.price`, data.price);
      }
    } catch {
      // Ignore errors
    }
  };

  const filteredReceipts = receipts.filter((r) => {
    if (supplierFilter !== "all" && r.supplierId !== supplierFilter) return false;
    if (dateRange.from && new Date(r.date) < dateRange.from) return false;
    if (dateRange.to && new Date(r.date) > dateRange.to) return false;
    return true;
  });

  const columns = [
    {
      key: "date",
      header: "Дата",
      cell: (r: WarehouseReceiptWithRelations) => format(new Date(r.date), "dd.MM.yyyy"),
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
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            form.reset({
              supplierId: "",
              date: format(new Date(), "yyyy-MM-dd"),
              comment: "",
              items: [{ itemType: "fabric", componentId: "", fabricId: "", quantity: "", price: "", total: "" }],
            });
          }
        }}>
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Поставщик</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-supplier">
                              <SelectValue placeholder="Выберите поставщика" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          <Input type="date" {...field} data-testid="input-date" />
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
                      onClick={() => append({ itemType: "fabric", componentId: "", fabricId: "", quantity: "", price: "", total: "" })}
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
                          <CardTitle className="text-sm">Позиция {index + 1}</CardTitle>
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
                                    <RadioGroupItem value="fabric" id={`fabric-${index}`} />
                                    <Label htmlFor={`fabric-${index}`}>Ткань</Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="component" id={`component-${index}`} />
                                    <Label htmlFor={`component-${index}`}>Комплектующие</Label>
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
                                  <Select 
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      fetchPreviousPrice("fabric", value, index);
                                    }} 
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger data-testid={`select-fabric-${index}`}>
                                        <SelectValue placeholder="Выберите ткань" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {fabrics.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
                                  <Select 
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      fetchPreviousPrice("component", value, index);
                                    }} 
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger data-testid={`select-component-${index}`}>
                                        <SelectValue placeholder="Выберите" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {components.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
                                  <Input type="number" step="0.01" {...field} data-testid={`input-quantity-${index}`} />
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
                                  <Input type="number" step="0.01" {...field} data-testid={`input-price-${index}`} />
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
                                  <Input {...field} disabled className="bg-muted" data-testid={`input-total-${index}`} />
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
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit">
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
          <TabsTrigger value="receipts" data-testid="tab-receipts">Поступления</TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-stock">Остатки</TabsTrigger>
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
                options: suppliers.map(s => ({ value: s.id, label: s.name })),
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
              Ткани ({fabricStock.filter(f => f.stock.quantity > 0).length})
            </h3>
            {fabricStock.filter(f => f.stock.quantity > 0).length === 0 ? (
              <p className="text-muted-foreground text-sm">Нет тканей с остатком</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Наименование</th>
                      <th className="text-left py-2 px-3 font-medium w-24">Категория</th>
                      <th className="text-right py-2 px-3 font-medium w-24">Остаток</th>
                      <th className="text-right py-2 px-3 font-medium w-28">Цена</th>
                      <th className="text-right py-2 px-3 font-medium w-32">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fabricStock.filter(f => f.stock.quantity > 0).map((fabric) => (
                      <tr key={fabric.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-1.5 px-3">{fabric.name}</td>
                        <td className="py-1.5 px-3">
                          {fabric.category && <Badge variant="outline" className="text-xs py-0">{fabric.category}</Badge>}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono">{fabric.stock.quantity.toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{formatCurrency(fabric.stock.lastPrice)}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-medium">{formatCurrency(fabric.stock.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 border-t">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-right font-medium">Итого:</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {formatCurrency(fabricStock.filter(f => f.stock.quantity > 0).reduce((sum, f) => sum + f.stock.totalValue, 0))}
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
              Комплектующие ({componentStock.filter(c => c.stock.quantity > 0).length})
            </h3>
            {componentStock.filter(c => c.stock.quantity > 0).length === 0 ? (
              <p className="text-muted-foreground text-sm">Нет комплектующих с остатком</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Наименование</th>
                      <th className="text-left py-2 px-3 font-medium w-20">Ед.</th>
                      <th className="text-right py-2 px-3 font-medium w-24">Остаток</th>
                      <th className="text-right py-2 px-3 font-medium w-28">Цена</th>
                      <th className="text-right py-2 px-3 font-medium w-32">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {componentStock.filter(c => c.stock.quantity > 0).map((component) => (
                      <tr key={component.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-1.5 px-3">{component.name}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{component.unit || "-"}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{component.stock.quantity.toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{formatCurrency(component.stock.lastPrice)}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-medium">{formatCurrency(component.stock.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 border-t">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-right font-medium">Итого:</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {formatCurrency(componentStock.filter(c => c.stock.quantity > 0).reduce((sum, c) => sum + c.stock.totalValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Поступление от {viewingReceipt && format(new Date(viewingReceipt.date), "dd.MM.yyyy")}</DialogTitle>
          </DialogHeader>
          {viewingReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Поставщик</p>
                  <p className="font-medium">{viewingReceipt.supplier?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Сумма</p>
                  <p className="font-medium">{formatCurrency(viewingReceipt.total)}</p>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Позиции ({viewingReceipt.items?.length || 0})</h4>
                {viewingReceipt.items?.map((item, idx) => (
                  <Card key={item.id} className="mb-2">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Позиция:</span>{" "}
                          {item.fabric?.name || item.component?.name || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Кол-во:</span> {item.quantity}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Цена:</span> {formatCurrency(item.price)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Сумма:</span> {formatCurrency(item.total)}
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
          <p>Вы уверены, что хотите удалить это поступление? Это действие необратимо.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => receiptToDelete && deleteMutation.mutate(receiptToDelete.id)}
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
