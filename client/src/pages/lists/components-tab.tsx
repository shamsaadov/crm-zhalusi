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
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Color, Component } from "@shared/schema";

export function ComponentsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);

  const { data: components = [], isLoading } = useQuery<Component[]>({
    queryKey: ["/api/components"],
  });
  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const form = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1),
        colorId: z.string().optional(),
        unit: z.string().optional(),
      })
    ),
    defaultValues: { name: "", colorId: "", unit: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/components", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/components"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Комплектующие добавлены" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/components/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/components"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Комплектующие обновлены" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/components/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/components"] });
      toast({ title: "Комплектующие удалены" });
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

  const openEdit = (item: Component) => {
    setEditing(item);
    form.reset({
      name: item.name,
      colorId: item.colorId || "",
      unit: item.unit || "",
    });
    setIsDialogOpen(true);
  };

  const filtered = components.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditing(null);
              form.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-component">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Редактировать" : "Новые комплектующие"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-component-name" />
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
                      <FormLabel>Цвет</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {colors.map((c) => (
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
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Единица измерения</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="шт/м/упак"
                          data-testid="input-component-unit"
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
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
          { key: "name", header: "Название", cell: (c: Component) => c.name },
          {
            key: "unit",
            header: "Ед. изм.",
            cell: (c: Component) => c.unit || "-",
          },
          {
            key: "actions",
            header: "",
            cell: (c: Component) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Удалить комплектующие?
                      </AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(c.id)}
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
        emptyMessage="Комплектующие не найдены"
        getRowKey={(c) => c.id}
      />
    </>
  );
}




