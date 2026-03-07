import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  order_status: "Статус заказа",
  low_stock: "Низкий остаток",
  overdue_order: "Просрочка заказа",
  overdue_payment: "Просрочка оплаты",
};

function getEntityLink(entityType?: string): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case "order":
      return "/orders";
    case "finance":
      return "/finance";
    case "warehouse_receipt":
    case "component":
    case "fabric":
      return "/warehouse";
    default:
      return null;
  }
}

export default function NotificationsPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications?limit=100"],
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const filtered = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (statusFilter === "unread" && n.isRead) return false;
    if (statusFilter === "read" && !n.isRead) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Layout title="Уведомления">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(typeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="unread">Непрочитанные</SelectItem>
              <SelectItem value="read">Прочитанные</SelectItem>
            </SelectContent>
          </Select>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Прочитать все ({unreadCount})
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-30" />
            <p>Нет уведомлений</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => {
              const link = getEntityLink(n.entityType);
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                    !n.isRead
                      ? "bg-muted/30 border-primary/20"
                      : "hover:bg-muted/20"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                      <span className="font-medium text-sm">{n.title}</span>
                      <span className="text-xs text-muted-foreground rounded-md bg-muted px-2 py-0.5">
                        {typeLabels[n.type] || n.type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString("ru-RU")}
                      </span>
                      {link && (
                        <Link
                          href={link}
                          className="text-xs text-primary hover:underline"
                        >
                          Перейти
                        </Link>
                      )}
                    </div>
                  </div>
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 text-xs"
                      onClick={() => markRead.mutate(n.id)}
                    >
                      Прочитано
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
