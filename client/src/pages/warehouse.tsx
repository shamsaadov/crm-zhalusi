import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type WarehouseReceipt, type Supplier, type Fabric, type Component } from "@shared/schema";
import { format } from "date-fns";

const warehouseSchema = z.object({
  supplierId: z.string().min(1, "Обязательное поле"),
  itemType: z.enum(["fabric", "component"]),
  componentId: z.string().optional(),
  fabricId: z.string().optional(),
  quantity: z.string().min(1, "Обязательное поле"),
  price: z.string().min(1, "Обязательное поле"),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
}).refine((data) => {
  if (data.itemType === "fabric" && !data.fabricId) return false;
  if (data.itemType === "component" && !data.componentId) return false;
  return true;
}, { message: "Выберите ткань или комплектующие", path: ["itemType"] });

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

interface WarehouseReceiptWithRelations extends WarehouseReceipt {
  supplier?: Supplier;
  fabric?: Fabric;
  component?: Component;
}

export default function WarehousePage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");

  const { data: receipts = [], isLoading } = useQuery<WarehouseReceiptWithRelations[]>({
    queryKey: ["/api/warehouse"],
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

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      supplierId: "",
      itemType: "fabric",
      componentId: "",
      fabricId: "",
      quantity: "",
      price: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    },
  });

  const itemType = useWatch({ control: form.control, name: "itemType" });
  const quantity = useWatch({ control: form.control, name: "quantity" });
  const price = useWatch({ control: form.control, name: "price" });

  const total = (parseFloat(quantity || "0") * parseFloat(price || "0")).toFixed(2);

  const createMutation = useMutation({
    mutationFn: (data: WarehouseFormValues) => {
      const payload = {
        ...data,
        total,
        componentId: data.itemType === "component" ? data.componentId : undefined,
        fabricId: data.itemType === "fabric" ? data.fabricId : undefined,
      };
      return apiRequest("POST", "/api/warehouse", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Успешно", description: "Поступление добавлено" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: WarehouseFormValues) => {
    createMutation.mutate(data);
  };

  const filteredReceipts = receipts.filter((r) => {
    if (supplierFilter !== "all" && r.supplierId !== supplierFilter) return false;
    if (itemTypeFilter === "fabric" && !r.fabricId) return false;
    if (itemTypeFilter === "component" && !r.componentId) return false;
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
      key: "itemType",
      header: "Тип",
      cell: (r: WarehouseReceiptWithRelations) => (
        <Badge variant="outline" className={r.fabricId ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"}>
          {r.fabricId ? "Ткань" : "Комплектующие"}
        </Badge>
      ),
    },
    {
      key: "itemName",
      header: "Наименование",
      cell: (r: WarehouseReceiptWithRelations) => r.fabric?.name || r.component?.name || "-",
    },
    {
      key: "quantity",
      header: "Количество",
      cell: (r: WarehouseReceiptWithRelations) => (
        <span className="font-mono">{r.quantity}</span>
      ),
      className: "text-right",
    },
    {
      key: "price",
      header: "Цена",
      cell: (r: WarehouseReceiptWithRelations) => (
        <span className="font-mono">{formatCurrency(r.price)}</span>
      ),
      className: "text-right",
    },
    {
      key: "total",
      header: "Итого",
      cell: (r: WarehouseReceiptWithRelations) => (
        <span className="font-mono font-medium">{formatCurrency(r.total)}</span>
      ),
      className: "text-right",
    },
  ];

  return (
    <Layout title="Склад">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-receipt">
              <Plus className="h-4 w-4 mr-2" />
              Добавить поступление
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Новое поступление</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Поставщик</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-warehouse-supplier">
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
                  name="itemType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип позиции</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="fabric" id="fabric" data-testid="radio-fabric" />
                            <Label htmlFor="fabric">Ткань</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="component" id="component" data-testid="radio-component" />
                            <Label htmlFor="component">Комплектующие</Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {itemType === "fabric" && (
                  <FormField
                    control={form.control}
                    name="fabricId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ткань</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-warehouse-fabric">
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
                )}

                {itemType === "component" && (
                  <FormField
                    control={form.control}
                    name="componentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Комплектующие</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-warehouse-component">
                              <SelectValue placeholder="Выберите комплектующие" />
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Количество</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-quantity" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Цена за ед.</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="p-3 bg-muted rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Итого:</span>
                    <span className="text-lg font-mono font-semibold" data-testid="text-total">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Дата</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-warehouse-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-warehouse-comment" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-receipt">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Добавить поступление
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <FilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateFilter
        filters={[
          {
            key: "supplier",
            label: "Поставщик",
            options: suppliers.map((s) => ({ value: s.id, label: s.name })),
            value: supplierFilter,
            onChange: setSupplierFilter,
          },
          {
            key: "itemType",
            label: "Тип позиции",
            options: [
              { value: "fabric", label: "Ткань" },
              { value: "component", label: "Комплектующие" },
            ],
            value: itemTypeFilter,
            onChange: setItemTypeFilter,
          },
        ]}
        onReset={() => {
          setDateRange({});
          setSupplierFilter("all");
          setItemTypeFilter("all");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredReceipts}
        isLoading={isLoading}
        emptyMessage="Поступления не найдены"
        getRowKey={(r) => r.id}
      />
    </Layout>
  );
}
