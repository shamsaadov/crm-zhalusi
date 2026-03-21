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
import { Switch } from "@/components/ui/switch";
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
import type { Installer } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

type InstallerSafe = Omit<Installer, "password">;

const formSchema = z.object({
  login: z.string().min(1, "Логин обязателен"),
  name: z.string().min(1, "Имя обязательно"),
  phone: z.string().optional(),
  password: z.string().optional(),
  isActive: z.boolean().optional(),
});

const createFormSchema = formSchema.extend({
  password: z.string().min(4, "Пароль минимум 4 символа"),
});

export function InstallersTab({ search }: { search: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InstallerSafe | null>(null);

  const { data: installersList = [], isLoading } = useQuery<InstallerSafe[]>({
    queryKey: ["/api/installers"],
  });

  const form = useForm({
    resolver: zodResolver(editing ? formSchema : createFormSchema),
    defaultValues: {
      login: "",
      name: "",
      phone: "",
      password: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/installers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/installers"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Монтажник добавлен" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => apiRequest("PATCH", `/api/installers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/installers"] });
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Монтажник обновлен" });
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
      apiRequest("DELETE", `/api/installers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/installers"] });
      toast({ title: "Монтажник удален" });
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    // Don't send empty password on edit
    if (editing && !data.password) {
      const { password, ...rest } = data;
      updateMutation.mutate({ id: editing.id, data: rest });
    } else if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (item: InstallerSafe) => {
    setEditing(item);
    form.reset({
      login: item.login,
      name: item.name,
      phone: item.phone || "",
      password: "",
      isActive: item.isActive ?? true,
    });
    setIsDialogOpen(true);
  };

  const filtered = installersList.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.login.toLowerCase().includes(search.toLowerCase())
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
            <Button data-testid="button-add-installer">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? "Редактировать монтажника"
                  : "Новый монтажник"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="login"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Логин</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-installer-login"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-installer-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Телефон</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-installer-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {editing
                          ? "Новый пароль (оставьте пустым)"
                          : "Пароль"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                          data-testid="input-installer-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {editing && (
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormLabel>Активен</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {(createMutation.isPending ||
                    updateMutation.isPending) && (
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
          {
            key: "name",
            header: "Имя",
            cell: (i: InstallerSafe) => i.name,
          },
          {
            key: "login",
            header: "Логин",
            cell: (i: InstallerSafe) => i.login,
          },
          {
            key: "phone",
            header: "Телефон",
            cell: (i: InstallerSafe) => i.phone || "—",
          },
          {
            key: "status",
            header: "Статус",
            cell: (i: InstallerSafe) => (
              <Badge variant={i.isActive ? "default" : "secondary"}>
                {i.isActive ? "Активен" : "Отключен"}
              </Badge>
            ),
          },
          {
            key: "actions",
            header: "",
            cell: (i: InstallerSafe) => (
              <div className="flex gap-1 justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Удалить монтажника?
                      </AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(i.id)}
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
        emptyMessage="Монтажники не найдены"
        getRowKey={(i) => i.id}
        onRowDoubleClick={openEdit}
      />
    </>
  );
}
