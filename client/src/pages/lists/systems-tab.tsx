import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Color, System, Component, Multiplier } from "@shared/schema";

type SystemComponentItem = {
  componentId: string;
  quantity: string;
  sizeSource: string;
  sizeMultiplier: string;
};

export function SystemsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<System | null>(null);
  const [systemComponentsList, setSystemComponentsList] = useState<
    SystemComponentItem[]
  >([]);

  const { data: systems = [], isLoading } = useQuery<System[]>({
    queryKey: ["/api/systems"],
  });
  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });
  const { data: componentsData = [] } = useQuery<Component[]>({
    queryKey: ["/api/components"],
  });
  const { data: multipliersData = [] } = useQuery<Multiplier[]>({
    queryKey: ["/api/multipliers"],
  });
  const { data: availableKeys = { systemKeys: [] } } = useQuery<{
    systemKeys: string[];
  }>({ queryKey: ["/api/coefficients/available-keys"] });

  const form = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1),
        colorId: z.string().optional(),
        systemKey: z.string().optional(),
        formula: z.string().optional(),
        multiplierId: z.string().optional(),
      })
    ),
    defaultValues: {
      name: "",
      colorId: "",
      systemKey: "",
      formula: "",
      multiplierId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/systems", data);
      return res.json();
    },
    onSuccess: async (system: System) => {
      for (const sc of systemComponentsList) {
        if (sc.componentId) {
          await apiRequest("POST", `/api/systems/${system.id}/components`, {
            componentId: sc.componentId,
            quantity: sc.quantity || "1",
            sizeSource: sc.sizeSource || null,
            sizeMultiplier: sc.sizeMultiplier || "1",
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      setIsDialogOpen(false);
      form.reset();
      setSystemComponentsList([]);
      toast({ title: "Система добавлена" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => {
      const res = await apiRequest("PATCH", `/api/systems/${id}`, data);
      return { id, result: await res.json() };
    },
    onSuccess: async ({ id }) => {
      await apiRequest("DELETE", `/api/systems/${id}/components`);
      for (const sc of systemComponentsList) {
        if (sc.componentId) {
          await apiRequest("POST", `/api/systems/${id}/components`, {
            componentId: sc.componentId,
            quantity: sc.quantity || "1",
            sizeSource: sc.sizeSource || null,
            sizeMultiplier: sc.sizeMultiplier || "1",
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      setSystemComponentsList([]);
      toast({ title: "Система обновлена" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/systems/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      toast({ title: "Система удалена" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = async (item: System) => {
    setEditing(item);
    form.reset({
      name: item.name,
      colorId: item.colorId || "",
      systemKey: (item as any).systemKey || "",
      formula: item.formula || "",
      multiplierId: (item as any).multiplierId || "",
    });
    try {
      const res = await apiRequest("GET", `/api/systems/${item.id}/components`);
      const comps = await res.json();
      setSystemComponentsList(
        comps.map((c: any) => ({
          componentId: c.componentId,
          quantity: c.quantity || "1",
          sizeSource: c.sizeSource || "",
          sizeMultiplier: c.sizeMultiplier || "1",
        }))
      );
    } catch {
      setSystemComponentsList([]);
    }
    setIsDialogOpen(true);
  };

  const addComponent = () =>
    setSystemComponentsList([
      ...systemComponentsList,
      { componentId: "", quantity: "1", sizeSource: "", sizeMultiplier: "1" },
    ]);
  const removeComponent = (idx: number) =>
    setSystemComponentsList(systemComponentsList.filter((_, i) => i !== idx));
  const updateComponent = (
    idx: number,
    field: keyof SystemComponentItem,
    value: string
  ) => {
    const updated = [...systemComponentsList];
    updated[idx] = { ...updated[idx], [field]: value };
    setSystemComponentsList(updated);
  };

  const filtered = systems.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex justify-end mb-3">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditing(null);
              form.reset();
              setSystemComponentsList([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-system">
              <Plus className="h-4 w-4 mr-1" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
            <DialogHeader className="pb-2 flex-shrink-0">
              <DialogTitle className="text-base">
                {editing ? "Редактировать систему" : "Новая система"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-2 overflow-y-auto flex-1 pr-1"
              >
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="Название"
                            {...field}
                            className="h-8 text-sm"
                            data-testid="input-system-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="colorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
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
                            className="h-8 text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="systemKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <SearchableSelect
                            options={availableKeys.systemKeys.map((key) => ({
                              value: key,
                              label: key,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Ключ системы"
                            searchPlaceholder="Поиск ключа..."
                            emptyText="Ключ не найден"
                            className="h-8 text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="multiplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <SearchableSelect
                            options={multipliersData.map((multiplier) => ({
                              value: multiplier.id,
                              label: `${
                                multiplier.name || multiplier.value
                              } (×${multiplier.value})`,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Множитель"
                            searchPlaceholder="Поиск множителя..."
                            emptyText="Множитель не найден"
                            className="h-8 text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="formula"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Формула (опционально)"
                          {...field}
                          className="h-8 text-sm"
                          data-testid="input-system-formula"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1 sticky top-0 bg-background py-1 z-10">
                    <span className="text-xs font-medium text-muted-foreground">
                      Комплектующие
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addComponent}
                      className="h-6 px-2 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Добавить
                    </Button>
                  </div>
                  <div className="space-y-0">
                    {systemComponentsList.map((sc, idx) => {
                      const comp = componentsData.find(
                        (c) => c.id === sc.componentId
                      );
                      const unit = comp?.unit;
                      return (
                        <div
                          key={idx}
                          className="pb-2 mb-2 border-b border-border/50 last:border-0 last:pb-0 last:mb-0"
                        >
                          <div className="flex gap-1 items-center">
                            <SearchableSelect
                              options={componentsData.map((component) => ({
                                value: component.id,
                                label: component.name,
                                secondaryLabel: `(${component.unit})`,
                              }))}
                              value={sc.componentId}
                              onValueChange={(v) =>
                                updateComponent(idx, "componentId", v)
                              }
                              placeholder="Комплектующее"
                              searchPlaceholder="Поиск комплектующего..."
                              emptyText="Комплектующее не найдено"
                              className="h-7 text-xs flex-1"
                            />
                            {/* Количество только для штучных комплектующих */}
                            {unit &&
                              ["шт", "шт."].includes(unit.toLowerCase()) && (
                                <Input
                                  type="number"
                                  placeholder="Кол-во"
                                  value={sc.quantity}
                                  onChange={(e) =>
                                    updateComponent(
                                      idx,
                                      "quantity",
                                      e.target.value
                                    )
                                  }
                                  className="h-7 w-16 text-xs"
                                />
                              )}
                            {/* Для метровых комплектующих - выбор размера и множитель */}
                            {unit &&
                              ["м", "пм", "п.м.", "м.п."].includes(
                                unit.toLowerCase()
                              ) && (
                                <>
                                  <Select
                                    value={sc.sizeSource}
                                    onValueChange={(v) =>
                                      updateComponent(idx, "sizeSource", v)
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-20 text-xs">
                                      <SelectValue placeholder="Размер" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="width">
                                        Ширина
                                      </SelectItem>
                                      <SelectItem value="height">
                                        Высота
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="×"
                                    value={sc.sizeMultiplier}
                                    onChange={(e) =>
                                      updateComponent(
                                        idx,
                                        "sizeMultiplier",
                                        e.target.value
                                      )
                                    }
                                    className="h-7 w-12 text-xs"
                                  />
                                </>
                              )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeComponent(idx)}
                              className="h-7 w-7"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-8 text-sm mt-3"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  {editing ? "Сохранить" : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={[
          { key: "name", header: "Название", cell: (s: System) => s.name },
          {
            key: "systemKey",
            header: "Ключ",
            cell: (s: System) => (s as any).systemKey || "-",
          },
          {
            key: "multiplier",
            header: "Множитель",
            cell: (s: System) => {
              const mult = (s as any).multiplier;
              if (!mult) return "-";
              return (
                <span className="font-mono text-xs">
                  ×{mult.value}
                  {mult.name ? ` (${mult.name})` : ""}
                </span>
              );
            },
          },
          {
            key: "formula",
            header: "Формула",
            cell: (s: System) => s.formula || "-",
          },
          {
            key: "actions",
            header: "",
            cell: (s: System) => (
              <div className="flex gap-1 justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить систему?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(s.id)}
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ),
          },
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Системы не найдены"
        getRowKey={(s) => s.id}
        onRowDoubleClick={openEdit}
      />
    </>
  );
}
