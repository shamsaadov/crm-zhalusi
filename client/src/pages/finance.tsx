import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FINANCE_TYPES, type FinanceOperation, type Dealer, type Supplier, type Cashbox, type ExpenseType } from "@shared/schema";
import { format } from "date-fns";

const incomeSchema = z.object({
  amount: z.string().min(1, "Обязательное поле"),
  cashboxId: z.string().min(1, "Обязательное поле"),
  dealerId: z.string().optional(),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
});

const expenseSchema = z.object({
  amount: z.string().min(1, "Обязательное поле"),
  cashboxId: z.string().min(1, "Обязательное поле"),
  expenseTypeId: z.string().optional(),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
});

const supplierPaymentSchema = z.object({
  amount: z.string().min(1, "Обязательное поле"),
  cashboxId: z.string().min(1, "Обязательное поле"),
  supplierId: z.string().min(1, "Обязательное поле"),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
});

const transferSchema = z.object({
  amount: z.string().min(1, "Обязательное поле"),
  fromCashboxId: z.string().min(1, "Обязательное поле"),
  toCashboxId: z.string().min(1, "Обязательное поле"),
  date: z.string().min(1, "Обязательное поле"),
  comment: z.string().optional(),
});

interface FinanceOperationWithRelations extends FinanceOperation {
  dealer?: Dealer;
  supplier?: Supplier;
  cashbox?: Cashbox;
  fromCashbox?: Cashbox;
  toCashbox?: Cashbox;
  expenseType?: ExpenseType;
}

const typeLabels: Record<string, string> = {
  income: "Приход",
  expense: "Расход",
  supplier_payment: "Оплата поставщику",
  transfer: "Перемещение",
};

const typeColors: Record<string, string> = {
  income: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  supplier_payment: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  transfer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export default function FinancePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("income");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [typeFilter, setTypeFilter] = useState("all");
  const [cashboxFilter, setCashboxFilter] = useState("all");

  const { data: operations = [], isLoading } = useQuery<FinanceOperationWithRelations[]>({
    queryKey: ["/api/finance"],
  });

  const { data: cashboxes = [] } = useQuery<Cashbox[]>({
    queryKey: ["/api/cashboxes"],
  });

  const { data: dealers = [] } = useQuery<Dealer[]>({
    queryKey: ["/api/dealers"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: expenseTypes = [] } = useQuery<ExpenseType[]>({
    queryKey: ["/api/expense-types"],
  });

  const incomeForm = useForm({
    resolver: zodResolver(incomeSchema),
    defaultValues: { amount: "", cashboxId: "", dealerId: "", date: format(new Date(), "yyyy-MM-dd"), comment: "" },
  });

  const expenseForm = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: { amount: "", cashboxId: "", expenseTypeId: "", date: format(new Date(), "yyyy-MM-dd"), comment: "" },
  });

  const supplierForm = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: { amount: "", cashboxId: "", supplierId: "", date: format(new Date(), "yyyy-MM-dd"), comment: "" },
  });

  const transferForm = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: { amount: "", fromCashboxId: "", toCashboxId: "", date: format(new Date(), "yyyy-MM-dd"), comment: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; [key: string]: unknown }) => apiRequest("POST", "/api/finance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      setIsDialogOpen(false);
      incomeForm.reset();
      expenseForm.reset();
      supplierForm.reset();
      transferForm.reset();
      toast({ title: "Успешно", description: "Операция создана" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const onSubmitIncome = (data: z.infer<typeof incomeSchema>) => {
    createMutation.mutate({ type: "income", ...data });
  };

  const onSubmitExpense = (data: z.infer<typeof expenseSchema>) => {
    createMutation.mutate({ type: "expense", ...data });
  };

  const onSubmitSupplierPayment = (data: z.infer<typeof supplierPaymentSchema>) => {
    createMutation.mutate({ type: "supplier_payment", ...data });
  };

  const onSubmitTransfer = (data: z.infer<typeof transferSchema>) => {
    createMutation.mutate({ type: "transfer", ...data });
  };

  const filteredOperations = operations.filter((op) => {
    if (typeFilter !== "all" && op.type !== typeFilter) return false;
    if (cashboxFilter !== "all" && op.cashboxId !== cashboxFilter && op.fromCashboxId !== cashboxFilter && op.toCashboxId !== cashboxFilter) return false;
    if (dateRange.from && new Date(op.date) < dateRange.from) return false;
    if (dateRange.to && new Date(op.date) > dateRange.to) return false;
    return true;
  });

  const columns = [
    {
      key: "date",
      header: "Дата",
      cell: (op: FinanceOperationWithRelations) => format(new Date(op.date), "dd.MM.yyyy"),
    },
    {
      key: "type",
      header: "Тип",
      cell: (op: FinanceOperationWithRelations) => (
        <Badge variant="outline" className={typeColors[op.type]} data-testid={`badge-type-${op.id}`}>
          {typeLabels[op.type]}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Сумма",
      cell: (op: FinanceOperationWithRelations) => (
        <span className={`font-mono ${op.type === "income" ? "text-green-600 dark:text-green-400" : op.type === "expense" || op.type === "supplier_payment" ? "text-red-600 dark:text-red-400" : ""}`}>
          {op.type === "income" ? "+" : op.type === "expense" || op.type === "supplier_payment" ? "-" : ""}
          {formatCurrency(op.amount)}
        </span>
      ),
      className: "text-right",
    },
    {
      key: "cashbox",
      header: "Касса",
      cell: (op: FinanceOperationWithRelations) => {
        if (op.type === "transfer") {
          return (
            <span className="text-sm">
              {op.fromCashbox?.name} → {op.toCashbox?.name}
            </span>
          );
        }
        return op.cashbox?.name || "-";
      },
    },
    {
      key: "counterparty",
      header: "Контрагент",
      cell: (op: FinanceOperationWithRelations) => {
        if (op.dealer) return op.dealer.fullName;
        if (op.supplier) return op.supplier.name;
        if (op.expenseType) return op.expenseType.name;
        return "-";
      },
    },
    {
      key: "comment",
      header: "Комментарий",
      cell: (op: FinanceOperationWithRelations) => (
        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">
          {op.comment || "-"}
        </span>
      ),
    },
  ];

  return (
    <Layout title="Финансы">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-operation">
              <Plus className="h-4 w-4 mr-2" />
              Добавить операцию
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Новая операция</DialogTitle>
            </DialogHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="income" className="gap-1">
                  <ArrowUpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Приход</span>
                </TabsTrigger>
                <TabsTrigger value="expense" className="gap-1">
                  <ArrowDownCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Расход</span>
                </TabsTrigger>
                <TabsTrigger value="supplier" className="gap-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Поставщик</span>
                </TabsTrigger>
                <TabsTrigger value="transfer" className="gap-1">
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Перемещение</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="income">
                <Form {...incomeForm}>
                  <form onSubmit={incomeForm.handleSubmit(onSubmitIncome)} className="space-y-4">
                    <FormField
                      control={incomeForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-income-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={incomeForm.control}
                      name="cashboxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Касса</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-income-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={incomeForm.control}
                      name="dealerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дилер (опционально)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-income-dealer">
                                <SelectValue placeholder="Выберите дилера" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {dealers.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.fullName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={incomeForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-income-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={incomeForm.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Комментарий</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-income-comment" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-income">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Добавить приход
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="expense">
                <Form {...expenseForm}>
                  <form onSubmit={expenseForm.handleSubmit(onSubmitExpense)} className="space-y-4">
                    <FormField
                      control={expenseForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-expense-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={expenseForm.control}
                      name="cashboxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Касса</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={expenseForm.control}
                      name="expenseTypeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Вид расхода</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-type">
                                <SelectValue placeholder="Выберите вид" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {expenseTypes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={expenseForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-expense-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={expenseForm.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Комментарий</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-expense-comment" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-expense">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Добавить расход
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="supplier">
                <Form {...supplierForm}>
                  <form onSubmit={supplierForm.handleSubmit(onSubmitSupplierPayment)} className="space-y-4">
                    <FormField
                      control={supplierForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-supplier-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={supplierForm.control}
                      name="cashboxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Касса</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-supplier-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={supplierForm.control}
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
                      control={supplierForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-supplier-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={supplierForm.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Комментарий</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-supplier-comment" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-supplier">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Оплатить поставщику
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="transfer">
                <Form {...transferForm}>
                  <form onSubmit={transferForm.handleSubmit(onSubmitTransfer)} className="space-y-4">
                    <FormField
                      control={transferForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} data-testid="input-transfer-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={transferForm.control}
                      name="fromCashboxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Из кассы</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-from-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={transferForm.control}
                      name="toCashboxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>В кассу</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-to-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={transferForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-transfer-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={transferForm.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Комментарий</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-transfer-comment" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-transfer">
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Переместить
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <FilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateFilter
        filters={[
          {
            key: "type",
            label: "Тип операции",
            options: FINANCE_TYPES.map((t) => ({ value: t, label: typeLabels[t] })),
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            key: "cashbox",
            label: "Касса",
            options: cashboxes.map((c) => ({ value: c.id, label: c.name })),
            value: cashboxFilter,
            onChange: setCashboxFilter,
          },
        ]}
        onReset={() => {
          setDateRange({});
          setTypeFilter("all");
          setCashboxFilter("all");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredOperations}
        isLoading={isLoading}
        emptyMessage="Операции не найдены"
        getRowKey={(op) => op.id}
      />
    </Layout>
  );
}
