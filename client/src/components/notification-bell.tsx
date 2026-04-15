import { Bell } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { parseMoscow } from "@/lib/date";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "wouter";

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

function getEntityLink(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "order":
      return "/orders";
    case "finance":
      return "/finance";
    case "warehouse_receipt":
      return "/warehouse";
    case "component":
    case "fabric":
      return "/warehouse";
    case "measurement":
      return "/orders";
    default:
      return null;
  }
}

function formatTime(dateStr: string): string {
  const date = parseMoscow(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;
  return date.toLocaleDateString("ru-RU");
}

export function NotificationBell() {
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: notificationsData } = useQuery<Notification[]>({
    queryKey: ["/api/notifications?limit=10"],
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

  const unreadCount = countData?.count || 0;
  const notifications = notificationsData || [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Уведомления</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1"
              onClick={() => markAllRead.mutate()}
            >
              Прочитать все
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Нет уведомлений
            </div>
          ) : (
            notifications.map((n) => {
              const link = getEntityLink(n.entityType, n.entityId);
              return (
                <div
                  key={n.id}
                  className={`flex flex-col gap-1 border-b px-4 py-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                    !n.isRead ? "bg-muted/30" : ""
                  }`}
                  onClick={() => {
                    if (!n.isRead) markRead.mutate(n.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-xs">
                      {!n.isRead && (
                        <span className="inline-block w-2 h-2 rounded-full bg-primary mr-1.5 align-middle" />
                      )}
                      {n.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  {link && (
                    <Link
                      href={link}
                      className="text-xs text-primary hover:underline mt-0.5"
                    >
                      Перейти
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="border-t p-2">
          <Link href="/notifications">
            <Button variant="ghost" size="sm" className="w-full text-xs">
              Все уведомления
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
