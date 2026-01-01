import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FABRIC_CATEGORIES, EXPENSE_DIRECTIONS, type Color, type Fabric, type Dealer, type Cashbox, type System, type ExpenseType, type Component, type Multiplier, type Supplier } from "@shared/schema";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
import { FilterBar } from "@/components/filter-bar";

type ListEntity = "colors" | "fabrics" | "dealers" | "cashboxes" | "systems" | "expenseTypes" | "components" | "multipliers" | "suppliers";

const entityConfig: Record<ListEntity, { label: string; apiPath: string; plural: string }> = {
  colors: { label: "Цвета", apiPath: "/api/colors", plural: "цветов" },
  fabrics: { label: "Ткани", apiPath: "/api/fabrics", plural: "тканей" },
  dealers: { label: "Дилеры", apiPath: "/api/dealers", plural: "дилеров" },
  cashboxes: { label: "Кассы", apiPath: "/api/cashboxes", plural: "касс" },
  systems: { label: "Системы", apiPath: "/api/systems", plural: "систем" },
  expenseTypes: { label: "Виды расходов", apiPath: "/api/expense-types", plural: "видов расходов" },
  components: { label: "Комплектующие", apiPath: "/api/components", plural: "комплектующих" },
  multipliers: { label: "Множители", apiPath: "/api/multipliers", plural: "множителей" },
  suppliers: { label: "Поставщики", apiPath: "/api/suppliers", plural: "поставщиков" },
};

export default function ListsPage() {
  const [activeTab, setActiveTab] = useState<ListEntity>("colors");
  const [search, setSearch] = useState("");

  return (
    <Layout title="Справочники">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ListEntity)}>
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
          {Object.entries(entityConfig).map(([key, config]) => (
            <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>
              {config.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Поиск..."
          onReset={() => setSearch("")}
        />

        <TabsContent value="colors">
          <ColorsTab search={search} />
        </TabsContent>
        <TabsContent value="fabrics">
          <FabricsTab search={search} />
        </TabsContent>
        <TabsContent value="dealers">
          <DealersTab search={search} />
        </TabsContent>
        <TabsContent value="cashboxes">
          <CashboxesTab search={search} />
        </TabsContent>
        <TabsContent value="systems">
          <SystemsTab search={search} />
        </TabsContent>
        <TabsContent value="expenseTypes">
          <ExpenseTypesTab search={search} />
        </TabsContent>
        <TabsContent value="components">
          <ComponentsTab search={search} />
        </TabsContent>
        <TabsContent value="multipliers">
          <MultipliersTab search={search} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab search={search} />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

function ColorsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Color | null>(null);

  const { data: colors = [], isLoading } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1, "Обязательное поле") })),
    defaultValues: { name: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => apiRequest("POST", "/api/colors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/colors"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Цвет добавлен" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) => apiRequest("PATCH", `/api/colors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/colors"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Цвет обновлен" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/colors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/colors"] });
      toast({ title: "Цвет удален" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: { name: string }) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (item: Color) => {
    setEditing(item);
    form.reset({ name: item.name });
    setIsDialogOpen(true);
  };

  const filtered = colors.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-color"><Plus className="h-4 w-4 mr-2" />Добавить</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать цвет" : "Новый цвет"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-color-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-color">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (c: Color) => c.name },
          { key: "actions", header: "", cell: (c: Color) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}><Edit className="h-4 w-4" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-${c.id}`}><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Удалить цвет?</AlertDialogTitle><AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Удалить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Цвета не найдены"
        getRowKey={(c) => c.id}
      />
    </>
  );
}

function FabricsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);

  const { data: fabrics = [], isLoading } = useQuery<Fabric[]>({ queryKey: ["/api/fabrics"] });
  const { data: colors = [] } = useQuery<Color[]>({ queryKey: ["/api/colors"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), width: z.string().optional(), material: z.string().optional(), colorId: z.string().optional(), category: z.string().optional() })),
    defaultValues: { name: "", width: "", material: "", colorId: "", category: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/fabrics", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Ткань добавлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/fabrics/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Ткань обновлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fabrics/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] }); toast({ title: "Ткань удалена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Fabric) => {
    setEditing(item);
    form.reset({ name: item.name, width: item.width?.toString() || "", material: item.material || "", colorId: item.colorId || "", category: item.category || "" });
    setIsDialogOpen(true);
  };

  const filtered = fabrics.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-fabric"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать ткань" : "Новая ткань"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-fabric-name" /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="width" render={({ field }) => (<FormItem><FormLabel>Ширина</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-fabric-width" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Категория</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-fabric-category"><SelectValue placeholder="Выберите" /></SelectTrigger></FormControl><SelectContent>{FABRIC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="material" render={({ field }) => (<FormItem><FormLabel>Материал</FormLabel><FormControl><Input {...field} data-testid="input-fabric-material" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="colorId" render={({ field }) => (
                  <FormItem><FormLabel>Цвет</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-fabric-color"><SelectValue placeholder="Выберите" /></SelectTrigger></FormControl><SelectContent>{colors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-fabric">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (f: Fabric) => f.name },
          { key: "width", header: "Ширина", cell: (f: Fabric) => f.width || "-" },
          { key: "material", header: "Материал", cell: (f: Fabric) => f.material || "-" },
          { key: "category", header: "Категория", cell: (f: Fabric) => f.category || "-" },
          { key: "actions", header: "", cell: (f: Fabric) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить ткань?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(f.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Ткани не найдены"
        getRowKey={(f) => f.id}
      />
    </>
  );
}

function DealersTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);

  const { data: dealers = [], isLoading } = useQuery<(Dealer & { balance?: number })[]>({ queryKey: ["/api/dealers"] });

  const form = useForm({
    resolver: zodResolver(z.object({ fullName: z.string().min(1), city: z.string().optional(), phone: z.string().optional(), openingBalance: z.string().optional() })),
    defaultValues: { fullName: "", city: "", phone: "", openingBalance: "0" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/dealers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/dealers"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Дилер добавлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/dealers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/dealers"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Дилер обновлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/dealers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/dealers"] }); toast({ title: "Дилер удален" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Dealer) => {
    setEditing(item);
    form.reset({ fullName: item.fullName, city: item.city || "", phone: item.phone || "", openingBalance: item.openingBalance?.toString() || "0" });
    setIsDialogOpen(true);
  };

  const filtered = dealers.filter((d) => d.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-dealer"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать дилера" : "Новый дилер"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>ФИО</FormLabel><FormControl><Input {...field} data-testid="input-dealer-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>Город</FormLabel><FormControl><Input {...field} data-testid="input-dealer-city" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Телефон</FormLabel><FormControl><Input {...field} data-testid="input-dealer-phone" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="openingBalance" render={({ field }) => (<FormItem><FormLabel>Начальный баланс</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-dealer-balance" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-dealer">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "fullName", header: "ФИО", cell: (d: Dealer & { balance?: number }) => d.fullName },
          { key: "city", header: "Город", cell: (d: Dealer) => d.city || "-" },
          { key: "phone", header: "Телефон", cell: (d: Dealer) => d.phone || "-" },
          { key: "balance", header: "Баланс", cell: (d: Dealer & { balance?: number }) => <BalanceBadge balance={d.balance || 0} />, className: "text-right" },
          { key: "actions", header: "", cell: (d: Dealer) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить дилера?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(d.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Дилеры не найдены"
        getRowKey={(d) => d.id}
      />
    </>
  );
}

function CashboxesTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cashbox | null>(null);

  const { data: cashboxes = [], isLoading } = useQuery<(Cashbox & { balance?: number })[]>({ queryKey: ["/api/cashboxes"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), openingBalance: z.string().optional() })),
    defaultValues: { name: "", openingBalance: "0" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/cashboxes", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Касса добавлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/cashboxes/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Касса обновлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/cashboxes/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] }); toast({ title: "Касса удалена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Cashbox) => {
    setEditing(item);
    form.reset({ name: item.name, openingBalance: item.openingBalance?.toString() || "0" });
    setIsDialogOpen(true);
  };

  const filtered = cashboxes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-cashbox"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать кассу" : "Новая касса"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-cashbox-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="openingBalance" render={({ field }) => (<FormItem><FormLabel>Начальный остаток</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-cashbox-balance" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-cashbox">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (c: Cashbox) => c.name },
          { key: "balance", header: "Остаток", cell: (c: Cashbox & { balance?: number }) => <span className="font-mono">{formatCurrency(c.balance || 0)}</span>, className: "text-right" },
          { key: "actions", header: "", cell: (c: Cashbox) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить кассу?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Кассы не найдены"
        getRowKey={(c) => c.id}
      />
    </>
  );
}

function SystemsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<System | null>(null);

  const { data: systems = [], isLoading } = useQuery<System[]>({ queryKey: ["/api/systems"] });
  const { data: colors = [] } = useQuery<Color[]>({ queryKey: ["/api/colors"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), colorId: z.string().optional(), formula: z.string().optional() })),
    defaultValues: { name: "", colorId: "", formula: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/systems", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/systems"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Система добавлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/systems/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/systems"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Система обновлена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/systems/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/systems"] }); toast({ title: "Система удалена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: System) => {
    setEditing(item);
    form.reset({ name: item.name, colorId: item.colorId || "", formula: item.formula || "" });
    setIsDialogOpen(true);
  };

  const filtered = systems.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-system"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать систему" : "Новая система"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-system-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="colorId" render={({ field }) => (
                  <FormItem><FormLabel>Цвет</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger></FormControl><SelectContent>{colors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="formula" render={({ field }) => (<FormItem><FormLabel>Формула расчета</FormLabel><FormControl><Input {...field} data-testid="input-system-formula" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (s: System) => s.name },
          { key: "formula", header: "Формула", cell: (s: System) => s.formula || "-" },
          { key: "actions", header: "", cell: (s: System) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить систему?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(s.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Системы не найдены"
        getRowKey={(s) => s.id}
      />
    </>
  );
}

function ExpenseTypesTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);

  const { data: expenseTypes = [], isLoading } = useQuery<ExpenseType[]>({ queryKey: ["/api/expense-types"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), direction: z.string().min(1) })),
    defaultValues: { name: "", direction: "expense" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/expense-types", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Вид расхода добавлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/expense-types/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Вид расхода обновлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expense-types/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] }); toast({ title: "Вид расхода удален" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: ExpenseType) => {
    setEditing(item);
    form.reset({ name: item.name, direction: item.direction });
    setIsDialogOpen(true);
  };

  const filtered = expenseTypes.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-expense-type"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать вид" : "Новый вид расхода"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-expense-type-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="direction" render={({ field }) => (
                  <FormItem><FormLabel>Тип</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger></FormControl><SelectContent>{EXPENSE_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d === "expense" ? "Расход" : "Доход"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (e: ExpenseType) => e.name },
          { key: "direction", header: "Тип", cell: (e: ExpenseType) => e.direction === "expense" ? "Расход" : "Доход" },
          { key: "actions", header: "", cell: (e: ExpenseType) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить вид расхода?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(e.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Виды расходов не найдены"
        getRowKey={(e) => e.id}
      />
    </>
  );
}

function ComponentsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);

  const { data: components = [], isLoading } = useQuery<Component[]>({ queryKey: ["/api/components"] });
  const { data: colors = [] } = useQuery<Color[]>({ queryKey: ["/api/colors"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), colorId: z.string().optional(), unit: z.string().optional() })),
    defaultValues: { name: "", colorId: "", unit: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/components", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/components"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Комплектующие добавлены" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/components/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/components"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Комплектующие обновлены" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/components/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/components"] }); toast({ title: "Комплектующие удалены" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Component) => {
    setEditing(item);
    form.reset({ name: item.name, colorId: item.colorId || "", unit: item.unit || "" });
    setIsDialogOpen(true);
  };

  const filtered = components.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-component"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать" : "Новые комплектующие"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-component-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="colorId" render={({ field }) => (
                  <FormItem><FormLabel>Цвет</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger></FormControl><SelectContent>{colors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="unit" render={({ field }) => (<FormItem><FormLabel>Единица измерения</FormLabel><FormControl><Input {...field} placeholder="шт/м/упак" data-testid="input-component-unit" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (c: Component) => c.name },
          { key: "unit", header: "Ед. изм.", cell: (c: Component) => c.unit || "-" },
          { key: "actions", header: "", cell: (c: Component) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить комплектующие?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Комплектующие не найдены"
        getRowKey={(c) => c.id}
      />
    </>
  );
}

function MultipliersTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Multiplier | null>(null);

  const { data: multipliers = [], isLoading } = useQuery<Multiplier[]>({ queryKey: ["/api/multipliers"] });

  const form = useForm({
    resolver: zodResolver(z.object({ value: z.string().min(1), name: z.string().optional() })),
    defaultValues: { value: "", name: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/multipliers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/multipliers"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Множитель добавлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/multipliers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/multipliers"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Множитель обновлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/multipliers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/multipliers"] }); toast({ title: "Множитель удален" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Multiplier) => {
    setEditing(item);
    form.reset({ value: item.value.toString(), name: item.name || "" });
    setIsDialogOpen(true);
  };

  const filtered = multipliers.filter((m) => m.name?.toLowerCase().includes(search.toLowerCase()) || m.value.toString().includes(search));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-multiplier"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать множитель" : "Новый множитель"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="value" render={({ field }) => (<FormItem><FormLabel>Значение</FormLabel><FormControl><Input type="number" step="0.0001" {...field} data-testid="input-multiplier-value" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название (опционально)</FormLabel><FormControl><Input {...field} data-testid="input-multiplier-name" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "value", header: "Значение", cell: (m: Multiplier) => <span className="font-mono">{m.value}</span> },
          { key: "name", header: "Название", cell: (m: Multiplier) => m.name || "-" },
          { key: "actions", header: "", cell: (m: Multiplier) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить множитель?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(m.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Множители не найдены"
        getRowKey={(m) => m.id}
      />
    </>
  );
}

function SuppliersTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery<(Supplier & { balance?: number })[]>({ queryKey: ["/api/suppliers"] });

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1), openingBalance: z.string().optional() })),
    defaultValues: { name: "", openingBalance: "0" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/suppliers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); setIsDialogOpen(false); form.reset(); toast({ title: "Поставщик добавлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/suppliers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); setIsDialogOpen(false); setEditing(null); form.reset(); toast({ title: "Поставщик обновлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/suppliers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: "Поставщик удален" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Supplier) => {
    setEditing(item);
    form.reset({ name: item.name, openingBalance: item.openingBalance?.toString() || "0" });
    setIsDialogOpen(true);
  };

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); form.reset(); } }}>
          <DialogTrigger asChild><Button data-testid="button-add-supplier"><Plus className="h-4 w-4 mr-2" />Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Редактировать поставщика" : "Новый поставщик"}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} data-testid="input-supplier-name" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="openingBalance" render={({ field }) => (<FormItem><FormLabel>Начальный баланс</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-supplier-balance" /></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (s: Supplier) => s.name },
          { key: "balance", header: "Баланс", cell: (s: Supplier & { balance?: number }) => <BalanceBadge balance={s.balance || 0} />, className: "text-right" },
          { key: "actions", header: "", cell: (s: Supplier) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить поставщика?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(s.id)}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          )},
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Поставщики не найдены"
        getRowKey={(s) => s.id}
      />
    </>
  );
}
