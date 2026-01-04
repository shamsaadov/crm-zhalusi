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
import { EXPENSE_DIRECTIONS, type ExpenseType } from "@shared/schema";

export function ExpenseTypesTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);

  const { data: expenseTypes = [], isLoading } = useQuery<ExpenseType[]>({
    queryKey: ["/api/expense-types"],
  });

  const form = useForm({
    resolver: zodResolver(
      z.object({ name: z.string().min(1), direction: z.string().min(1) })
    ),
    defaultValues: { name: "", direction: "expense" },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/expense-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Вид расхода добавлен" });
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
      apiRequest("PATCH", `/api/expense-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Вид расхода обновлен" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/expense-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-types"] });
      toast({ title: "Вид расхода удален" });
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

  const openEdit = (item: ExpenseType) => {
    setEditing(item);
    form.reset({ name: item.name, direction: item.direction });
    setIsDialogOpen(true);
  };

  const filtered = expenseTypes.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
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
            <Button data-testid="button-add-expense-type">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Редактировать вид" : "Новый вид расхода"}
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
                        <Input
                          {...field}
                          data-testid="input-expense-type-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип</FormLabel>
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
                          {EXPENSE_DIRECTIONS.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d === "expense" ? "Расход" : "Доход"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
          { key: "name", header: "Название", cell: (e: ExpenseType) => e.name },
          {
            key: "direction",
            header: "Тип",
            cell: (e: ExpenseType) =>
              e.direction === "expense" ? "Расход" : "Доход",
          },
          {
            key: "actions",
            header: "",
            cell: (e: ExpenseType) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
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
                      <AlertDialogTitle>Удалить вид расхода?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(e.id)}
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
        emptyMessage="Виды расходов не найдены"
        getRowKey={(e) => e.id}
      />
    </>
  );
}

