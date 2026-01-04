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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
import { FABRIC_CATEGORIES, type Color, type Fabric } from "@shared/schema";

export function FabricsTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);

  const { data: fabrics = [], isLoading } = useQuery<Fabric[]>({
    queryKey: ["/api/fabrics"],
  });
  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/colors"],
  });

  const form = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1),
        width: z.string().optional(),
        fabricType: z.string().optional(),
        colorId: z.string().optional(),
        category: z.string().optional(),
      })
    ),
    defaultValues: {
      name: "",
      width: "",
      fabricType: "roll",
      colorId: "",
      category: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/fabrics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Ткань добавлена" });
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
      apiRequest("PATCH", `/api/fabrics/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Ткань обновлена" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fabrics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      toast({ title: "Ткань удалена" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    console.log("Fabric submit:", data);
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const openEdit = (item: Fabric) => {
    setEditing(item);
    form.reset({
      name: item.name,
      width: item.width?.toString() || "",
      fabricType: (item as any).fabricType || "roll",
      colorId: item.colorId || "",
      category: item.category || "",
    });
    setIsDialogOpen(true);
  };

  const filtered = fabrics.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
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
            <Button data-testid="button-add-fabric">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Редактировать ткань" : "Новая ткань"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-3"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Название"
                          className="h-9"
                          {...field}
                          data-testid="input-fabric-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="width"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Ширина"
                            className="h-9"
                            {...field}
                            data-testid="input-fabric-width"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="h-9"
                              data-testid="select-fabric-category"
                            >
                              <SelectValue placeholder="Категория" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FABRIC_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="colorId"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="h-9"
                            data-testid="select-fabric-color"
                          >
                            <SelectValue placeholder="Цвет" />
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
                  name="fabricType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="roll" id="fabric-roll" />
                            <Label
                              htmlFor="fabric-roll"
                              className="cursor-pointer text-sm"
                            >
                              Рулон
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="zebra" id="fabric-zebra" />
                            <Label
                              htmlFor="fabric-zebra"
                              className="cursor-pointer text-sm"
                            >
                              Зебра
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-9"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  data-testid="button-submit-fabric"
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
          { key: "name", header: "Название", cell: (f: Fabric) => f.name },
          {
            key: "width",
            header: "Ширина",
            cell: (f: Fabric) => f.width || "-",
          },
          {
            key: "fabricType",
            header: "Тип",
            cell: (f: Fabric) =>
              (f as any).fabricType === "zebra" ? "Зебра" : "Рулон",
          },
          {
            key: "category",
            header: "Категория",
            cell: (f: Fabric) => f.category || "-",
          },
          {
            key: "actions",
            header: "",
            cell: (f: Fabric) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" onClick={() => openEdit(f)}>
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
                      <AlertDialogTitle>Удалить ткань?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(f.id)}
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
        emptyMessage="Ткани не найдены"
        getRowKey={(f) => f.id}
      />
    </>
  );
}

