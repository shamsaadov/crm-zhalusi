import { useState, useMemo, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  CreditCard,
  Edit,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  type FinanceOperation,
  type Dealer,
  type Supplier,
  type Cashbox,
  type ExpenseType,
} from "@shared/schema";
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
  income:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  supplier_payment:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  transfer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export default function FinancePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("income");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOperation, setEditingOperation] =
    useState<FinanceOperationWithRelations | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [typeFilter, setTypeFilter] = useState("all");
  const [cashboxFilter, setCashboxFilter] = useState("all");
  const [showDrafts, setShowDrafts] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [operationToDelete, setOperationToDelete] =
    useState<FinanceOperationWithRelations | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{
    dealerName: string;
    brand: string;
    date: string;
    amount: string;
    debt: string;
    cashbox: string;
  } | null>(null);

  const {
    data: operationsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{
    data: FinanceOperationWithRelations[];
    nextCursor: string | null;
    hasMore: boolean;
  }>({
    queryKey: [
      "/api/finance",
      {
        paginated: true,
        includeDrafts: showDrafts,
        type: typeFilter,
        cashboxId: cashboxFilter,
        from: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "",
        to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "",
        search: debouncedSearch,
      },
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        paginated: "true",
        limit: "20",
        includeDrafts: String(showDrafts),
        draftsOnly: String(showDrafts),
      });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (cashboxFilter !== "all") params.set("cashboxId", cashboxFilter);
      if (dateRange.from)
        params.set("from", format(dateRange.from, "yyyy-MM-dd"));
      if (dateRange.to) params.set("to", format(dateRange.to, "yyyy-MM-dd"));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/finance?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const operations = useMemo(() => {
    return operationsData?.pages.flatMap((page) => page.data) ?? [];
  }, [operationsData]);

  const { loadMoreRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const { data: cashboxes = [] } = useQuery<Cashbox[]>({
    queryKey: ["/api/cashboxes"],
  });

  const { data: dealers = [] } = useQuery<(Dealer & { balance: number })[]>({
    queryKey: ["/api/dealers"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: expenseTypes = [] } = useQuery<ExpenseType[]>({
    queryKey: ["/api/expense-types"],
  });

  const brandName = user?.name || user?.email || "Пользователь";

  const incomeForm = useForm({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      amount: "",
      cashboxId: "",
      dealerId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    },
  });

  const expenseForm = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: "",
      cashboxId: "",
      expenseTypeId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    },
  });

  const supplierForm = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      amount: "",
      cashboxId: "",
      supplierId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    },
  });

  const transferForm = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      amount: "",
      fromCashboxId: "",
      toCashboxId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; [key: string]: unknown }) =>
      apiRequest("POST", "/api/finance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setIsDialogOpen(false);
      resetForms();
      toast({ title: "Успешно", description: "Операция создана" });
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
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/finance/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      setIsDialogOpen(false);
      setEditingOperation(null);
      resetForms();
      toast({ title: "Успешно", description: "Операция обновлена" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      setIsDeleteDialogOpen(false);
      setOperationToDelete(null);
      toast({
        title: "Успешно",
        description: "Операция перемещена в черновики",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      apiRequest(
        "DELETE",
        `/api/finance/${id}/hard`,
        password ? { password } : undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      setIsDeleteDialogOpen(false);
      setIsPasswordDialogOpen(false);
      setOperationToDelete(null);
      setDeletePassword("");
      setPasswordError("");
      toast({ title: "Успешно", description: "Операция удалена" });
    },
    onError: async (error: Error & { requiresPassword?: boolean }) => {
      if (error.message === "Требуется пароль") {
        setIsDeleteDialogOpen(false);
        setIsPasswordDialogOpen(true);
      } else if (error.message === "Неверный пароль") {
        setPasswordError("Неверный пароль");
      } else {
        toast({
          title: "Ошибка",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/finance/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
      toast({ title: "Успешно", description: "Операция восстановлена" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForms = () => {
    incomeForm.reset({
      amount: "",
      cashboxId: "",
      dealerId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    });
    expenseForm.reset({
      amount: "",
      cashboxId: "",
      expenseTypeId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    });
    supplierForm.reset({
      amount: "",
      cashboxId: "",
      supplierId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    });
    transferForm.reset({
      amount: "",
      fromCashboxId: "",
      toCashboxId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      comment: "",
    });
  };

  const openEditDialog = (op: FinanceOperationWithRelations) => {
    setEditingOperation(op);
    setActiveTab(op.type === "supplier_payment" ? "supplier" : op.type);

    if (op.type === "income") {
      incomeForm.reset({
        amount: op.amount?.toString() || "",
        cashboxId: op.cashboxId || "",
        dealerId: op.dealerId || "",
        date: op.date,
        comment: op.comment || "",
      });
    } else if (op.type === "expense") {
      expenseForm.reset({
        amount: op.amount?.toString() || "",
        cashboxId: op.cashboxId || "",
        expenseTypeId: op.expenseTypeId || "",
        date: op.date,
        comment: op.comment || "",
      });
    } else if (op.type === "supplier_payment") {
      supplierForm.reset({
        amount: op.amount?.toString() || "",
        cashboxId: op.cashboxId || "",
        supplierId: op.supplierId || "",
        date: op.date,
        comment: op.comment || "",
      });
    } else if (op.type === "transfer") {
      transferForm.reset({
        amount: op.amount?.toString() || "",
        fromCashboxId: op.fromCashboxId || "",
        toCashboxId: op.toCashboxId || "",
        date: op.date,
        comment: op.comment || "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmitIncome = (data: z.infer<typeof incomeSchema>) => {
    if (editingOperation) {
      updateMutation.mutate({
        id: editingOperation.id,
        data: { type: "income", ...data },
      });
    } else {
      createMutation.mutate({ type: "income", ...data });
    }
  };

  const onSubmitExpense = (data: z.infer<typeof expenseSchema>) => {
    if (editingOperation) {
      updateMutation.mutate({
        id: editingOperation.id,
        data: { type: "expense", ...data },
      });
    } else {
      createMutation.mutate({ type: "expense", ...data });
    }
  };

  const onSubmitSupplierPayment = (
    data: z.infer<typeof supplierPaymentSchema>
  ) => {
    if (editingOperation) {
      updateMutation.mutate({
        id: editingOperation.id,
        data: { type: "supplier_payment", ...data },
      });
    } else {
      createMutation.mutate({ type: "supplier_payment", ...data });
    }
  };

  const onSubmitTransfer = (data: z.infer<typeof transferSchema>) => {
    if (editingOperation) {
      updateMutation.mutate({
        id: editingOperation.id,
        data: { type: "transfer", ...data },
      });
    } else {
      createMutation.mutate({ type: "transfer", ...data });
    }
  };

  const openDeleteDialog = (op: FinanceOperationWithRelations) => {
    setOperationToDelete(op);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!operationToDelete) return;
    if (operationToDelete.isDraft) {
      hardDeleteMutation.mutate({ id: operationToDelete.id });
    } else {
      softDeleteMutation.mutate(operationToDelete.id);
    }
  };

  const handlePasswordSubmit = () => {
    if (!operationToDelete) return;
    setPasswordError("");
    hardDeleteMutation.mutate({
      id: operationToDelete.id,
      password: deletePassword,
    });
  };

  const formatReceiptAmount = (value: string) => {
    const amountInKopecks = Math.round(Math.abs(parseFloat(value || "0")) * 100);
    const rubles = Math.floor(amountInKopecks / 100);
    const kopeks = amountInKopecks % 100;
    return `${rubles.toLocaleString("ru-RU")} руб. ${kopeks
      .toString()
      .padStart(2, "0")} коп.`;
  };

  const handlePrintReceipt = () => {
    const { amount, dealerId, cashboxId } = incomeForm.getValues();

    if (!dealerId) {
      toast({
        title: "Укажите дилера",
        description: "Выберите дилера, чтобы сформировать квитанцию.",
        variant: "destructive",
      });
      return;
    }

    const dealer = dealers.find((d) => d.id === dealerId);
    if (!dealer) {
      toast({
        title: "Дилер не найден",
        description: "Обновите список дилеров или выберите дилера заново.",
        variant: "destructive",
      });
      return;
    }

    if (!cashboxId) {
      toast({
        title: "Укажите кассу",
        description: "Выберите кассу для квитанции.",
        variant: "destructive",
      });
      return;
    }

    const cashbox = cashboxes.find((c) => c.id === cashboxId);
    if (!cashbox) {
      toast({
        title: "Касса не найдена",
        description: "Обновите список касс или выберите кассу заново.",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Введите сумму",
        description: "Укажите сумму прихода для печати квитанции.",
        variant: "destructive",
      });
      return;
    }

    const receiptDate = format(new Date(), "dd.MM.yyyy");
    const dealerBalance = Number(dealer.balance ?? 0);
    const dealerDebt = dealerBalance < 0 ? Math.abs(dealerBalance) : 0;
    const formattedDebt = `${dealerDebt.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} руб.`;
    const formattedAmount = formatReceiptAmount(amount);

    setReceiptPreview({
      dealerName: dealer.fullName,
      brand: brandName,
      date: receiptDate,
      amount: formattedAmount,
      debt: formattedDebt,
      cashbox: cashbox.name,
    });
    setIsReceiptDialogOpen(true);
  };

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const columns = [
    {
      key: "date",
      header: "Дата",
      cell: (op: FinanceOperationWithRelations) =>
        format(new Date(op.date), "dd.MM.yyyy"),
    },
    {
      key: "type",
      header: "Тип",
      cell: (op: FinanceOperationWithRelations) => (
        <Badge
          variant="outline"
          className={typeColors[op.type]}
          data-testid={`badge-type-${op.id}`}
        >
          {typeLabels[op.type]}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Сумма",
      cell: (op: FinanceOperationWithRelations) => (
        <span
          className={`font-mono ${
            op.type === "income"
              ? "text-green-600 dark:text-green-400"
              : op.type === "expense" || op.type === "supplier_payment"
              ? "text-red-600 dark:text-red-400"
              : ""
          }`}
        >
          {op.type === "income"
            ? "+"
            : op.type === "expense" || op.type === "supplier_payment"
            ? "-"
            : ""}
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
    {
      key: "actions",
      header: "",
      cell: (op: FinanceOperationWithRelations) => (
        <div className="flex gap-1">
          {op.isDraft ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => restoreMutation.mutate(op.id)}
                data-testid={`button-restore-${op.id}`}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => openDeleteDialog(op)}
                data-testid={`button-hard-delete-${op.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => openEditDialog(op)}
                data-testid={`button-edit-${op.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => openDeleteDialog(op)}
                data-testid={`button-delete-${op.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout title="Финансы">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingOperation(null);
              resetForms();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-operation">
              <Plus className="h-4 w-4 mr-2" />
              Добавить операцию
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingOperation ? "Редактировать операцию" : "Новая операция"}
              </DialogTitle>
            </DialogHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger
                  value="income"
                  className="gap-1"
                  disabled={!!editingOperation}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Приход</span>
                </TabsTrigger>
                <TabsTrigger
                  value="expense"
                  className="gap-1"
                  disabled={!!editingOperation}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Расход</span>
                </TabsTrigger>
                <TabsTrigger
                  value="supplier"
                  className="gap-1"
                  disabled={!!editingOperation}
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Поставщик</span>
                </TabsTrigger>
                <TabsTrigger
                  value="transfer"
                  className="gap-1"
                  disabled={!!editingOperation}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Перемещение</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="income">
                <Form {...incomeForm}>
                  <form
                    onSubmit={incomeForm.handleSubmit(onSubmitIncome)}
                    className="space-y-4"
                  >
                    <FormField
                      control={incomeForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-income-amount"
                            />
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-income-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
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
                      render={({ field }) => {
                        const selectedDealer = dealers.find(
                          (d) => d.id === field.value
                        );
                        return (
                          <FormItem>
                            <FormLabel>Дилер</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-income-dealer">
                                  <SelectValue placeholder="Выберите дилера" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {dealers.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedDealer && (
                              <p
                                className={`text-sm font-medium ${
                                  selectedDealer.balance < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : selectedDealer.balance > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                Долг:{" "}
                                {selectedDealer.balance < 0
                                  ? formatCurrency(
                                      Math.abs(selectedDealer.balance)
                                    )
                                  : selectedDealer.balance > 0
                                  ? `Переплата ${formatCurrency(
                                      selectedDealer.balance
                                    )}`
                                  : "0"}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={incomeForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-income-date"
                            />
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
                            <Textarea
                              {...field}
                              data-testid="input-income-comment"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      data-testid="button-submit-income"
                    >
                      {(createMutation.isPending ||
                        updateMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {editingOperation ? "Сохранить" : "Добавить приход"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="expense">
                <Form {...expenseForm}>
                  <form
                    onSubmit={expenseForm.handleSubmit(onSubmitExpense)}
                    className="space-y-4"
                  >
                    <FormField
                      control={expenseForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-expense-amount"
                            />
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-type">
                                <SelectValue placeholder="Выберите вид" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {expenseTypes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.name}
                                </SelectItem>
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
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-expense-date"
                            />
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
                            <Textarea
                              {...field}
                              data-testid="input-expense-comment"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      data-testid="button-submit-expense"
                    >
                      {(createMutation.isPending ||
                        updateMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {editingOperation ? "Сохранить" : "Добавить расход"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="supplier">
                <Form {...supplierForm}>
                  <form
                    onSubmit={supplierForm.handleSubmit(
                      onSubmitSupplierPayment
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={supplierForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-supplier-amount"
                            />
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-supplier-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-supplier">
                                <SelectValue placeholder="Выберите поставщика" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {suppliers.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
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
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-supplier-date"
                            />
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
                            <Textarea
                              {...field}
                              data-testid="input-supplier-comment"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      data-testid="button-submit-supplier"
                    >
                      {(createMutation.isPending ||
                        updateMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {editingOperation ? "Сохранить" : "Добавить оплату"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="transfer">
                <Form {...transferForm}>
                  <form
                    onSubmit={transferForm.handleSubmit(onSubmitTransfer)}
                    className="space-y-4"
                  >
                    <FormField
                      control={transferForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сумма</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-transfer-amount"
                            />
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-from-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-to-cashbox">
                                <SelectValue placeholder="Выберите кассу" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cashboxes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
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
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-transfer-date"
                            />
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
                            <Textarea
                              {...field}
                              data-testid="input-transfer-comment"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      data-testid="button-submit-transfer"
                    >
                      {(createMutation.isPending ||
                        updateMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {editingOperation ? "Сохранить" : "Добавить перемещение"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
            {activeTab === "income" && (
              <DialogFooter className="mt-2">
                <Button
                  variant="outline"
                  onClick={handlePrintReceipt}
                  data-testid="button-income-receipt"
                >
                  Квитанция
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2">
          <Switch
            id="show-drafts"
            checked={showDrafts}
            onCheckedChange={setShowDrafts}
            data-testid="switch-show-drafts"
          />
          <Label htmlFor="show-drafts">Черновики</Label>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по комментарию"
        showDateFilter
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        filters={[
          {
            key: "type",
            label: "Тип",
            value: typeFilter,
            options: [
              { value: "income", label: "Приход" },
              { value: "expense", label: "Расход" },
              { value: "supplier_payment", label: "Оплата поставщику" },
              { value: "transfer", label: "Перемещение" },
            ],
            onChange: setTypeFilter,
          },
          {
            key: "cashbox",
            label: "Касса",
            value: cashboxFilter,
            options: cashboxes.map((c) => ({ value: c.id, label: c.name })),
            onChange: setCashboxFilter,
          },
        ]}
        onReset={() => {
          setSearch("");
          setDateRange({});
          setTypeFilter("all");
          setCashboxFilter("all");
        }}
      />

      <DataTable
        columns={columns}
        data={operations}
        isLoading={isLoading}
        emptyMessage={
          showDrafts ? "Черновики не найдены" : "Операции не найдены"
        }
        getRowKey={(op) => op.id}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        loadMoreRef={loadMoreRef}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {operationToDelete?.isDraft
                ? "Удалить безвозвратно?"
                : "Переместить в черновики?"}
            </DialogTitle>
          </DialogHeader>
          <p>
            {operationToDelete?.isDraft
              ? "Эта операция будет удалена безвозвратно."
              : "Операция будет перемещена в черновики. Вы сможете восстановить её позже или удалить полностью."}
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
              onClick={handleDelete}
              disabled={
                softDeleteMutation.isPending || hardDeleteMutation.isPending
              }
              data-testid="button-confirm-delete"
            >
              {(softDeleteMutation.isPending ||
                hardDeleteMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {operationToDelete?.isDraft ? "Удалить" : "В черновики"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
          setIsPasswordDialogOpen(open);
          if (!open) {
            setDeletePassword("");
            setPasswordError("");
            setOperationToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Введите пароль</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Для удаления операции из черновиков требуется пароль отчетов.
          </p>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Пароль"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              data-testid="input-delete-password"
            />
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPasswordDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handlePasswordSubmit}
              disabled={hardDeleteMutation.isPending || !deletePassword}
              data-testid="button-confirm-password"
            >
              {hardDeleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
        <DialogContent className="max-w-xl">
          {receiptPreview && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold">{receiptPreview.brand}</p>
                <p className="text-base font-semibold">КВИТАНЦИЯ</p>
                <p className="text-sm text-muted-foreground">
                  к приходному кассовому ордеру
                </p>
                <p className="text-sm">от {receiptPreview.date}</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Принято от</span>
                  <span className="font-semibold text-right">
                    {receiptPreview.dealerName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Касса</span>
                  <span className="font-semibold text-right">
                    {receiptPreview.cashbox}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">Оплаченная сумма:</span>
                  <span className="font-bold">{receiptPreview.amount}</span>
                </div>
              </div>

              <div className="border border-destructive/60 rounded-md p-3">
                <p className="text-sm leading-tight">
                  Общий долг клиента<br />
                  с ожидаемыми отгрузками:
                </p>
                <p className="text-lg font-bold mt-2">{receiptPreview.debt}</p>
              </div>

              <DialogFooter className="justify-end">
                <Button variant="outline" onClick={() => setIsReceiptDialogOpen(false)}>
                  Закрыть
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
