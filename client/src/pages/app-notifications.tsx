import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, Users, Clock } from "lucide-react";
import { parseMoscow } from "@/lib/date";
import type { Dealer } from "@shared/schema";

const formSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен"),
  message: z.string().min(1, "Текст сообщения обязателен"),
});

export default function AppNotificationsPage() {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);

  const { data: allDealers = [] } = useQuery<Dealer[]>({
    queryKey: ["/api/dealers"],
  });

  // Only show dealers that have a login (i.e. can use the app)
  const dealers = allDealers.filter((d: any) => d.login);

  const { data: history = [], isLoading: historyLoading } = useQuery<
    {
      id: string;
      title: string;
      message: string;
      isBroadcast: boolean;
      dealerId: string | null;
      createdAt: string;
    }[]
  >({
    queryKey: ["/api/dealer-notifications/history"],
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", message: "" },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { title: string; message: string; dealerIds: string[]; sendToAll: boolean }) =>
      apiRequest("POST", "/api/dealer-notifications/send", data),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/dealer-notifications/history"] });
      form.reset();
      setSelectedIds([]);
      toast({
        title: "Уведомление отправлено",
        description: `Доставлено ${result.count} дилер(ам)`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: { title: string; message: string }) => {
    sendMutation.mutate({
      ...data,
      dealerIds: sendToAll ? [] : selectedIds,
      sendToAll,
    });
  };

  const toggleDealer = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getDealerName = (id: string | null) => {
    if (!id) return "—";
    return allDealers.find((d) => d.id === id)?.fullName || id;
  };

  return (
    <Layout title="Уведомления в приложение">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Send form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Отправить уведомление
            </CardTitle>
            <CardDescription>
              Дилеры увидят уведомление в мобильном приложении
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Заголовок</FormLabel>
                      <FormControl>
                        <Input placeholder="Например: Важное объявление" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Текст сообщения</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Текст уведомления..."
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Recipients */}
                <div className="space-y-3">
                  <FormLabel>Получатели</FormLabel>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="send-to-all"
                      checked={sendToAll}
                      onCheckedChange={(checked) => {
                        setSendToAll(checked === true);
                        if (checked) setSelectedIds([]);
                      }}
                    />
                    <label htmlFor="send-to-all" className="text-sm font-medium cursor-pointer">
                      Все дилеры с приложением ({dealers.length})
                    </label>
                  </div>

                  {!sendToAll && (
                    <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                      {dealers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет дилеров с приложением</p>
                      ) : (
                        dealers.map((dealer) => (
                          <div key={dealer.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`dealer-${dealer.id}`}
                              checked={selectedIds.includes(dealer.id)}
                              onCheckedChange={() => toggleDealer(dealer.id)}
                            />
                            <label
                              htmlFor={`dealer-${dealer.id}`}
                              className="text-sm cursor-pointer"
                            >
                              {dealer.fullName}
                              {dealer.phone && (
                                <span className="text-muted-foreground ml-1">
                                  ({dealer.phone})
                                </span>
                              )}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    sendMutation.isPending ||
                    (!sendToAll && selectedIds.length === 0)
                  }
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Отправить
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              История отправок
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Нет отправленных уведомлений
              </p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {history.map((n) => (
                  <div
                    key={n.id}
                    className="border rounded-md p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{n.title}</span>
                      <Badge variant={n.isBroadcast ? "default" : "secondary"}>
                        {n.isBroadcast ? (
                          <><Users className="h-3 w-3 mr-1" />Все</>
                        ) : (
                          getDealerName(n.dealerId)
                        )}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {parseMoscow(n.createdAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
