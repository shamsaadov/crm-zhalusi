import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORDER_STATUSES, type OrderStatus } from "@shared/schema";
import type { OrderWithRelations } from "../orders/types";
import { ViewOrderDialog } from "../orders/view-order-dialog";
import { KanbanColumn } from "./kanban-column";

export default function KanbanPage() {
  const { toast } = useToast();
  const [viewingOrder, setViewingOrder] = useState<OrderWithRelations | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Local optimistic state
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<string, OrderStatus>
  >({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const { data: orders = [], isLoading } = useQuery<OrderWithRelations[]>({
    queryKey: ["/api/orders", { kanban: true }],
    queryFn: async () => {
      const res = await fetch("/api/orders?limit=500", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const json = await res.json();
      // API might return paginated or plain array
      return Array.isArray(json) ? json : json.data ?? [];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
    },
    onError: (error: Error, variables) => {
      // Rollback optimistic update
      setOptimisticUpdates((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Group orders by status with optimistic updates applied
  const columns = useMemo(() => {
    const grouped: Record<OrderStatus, OrderWithRelations[]> = {
      "Новый": [],
      "В производстве": [],
      "Готов": [],
      "Отгружен": [],
    };

    for (const order of orders) {
      const effectiveStatus =
        optimisticUpdates[order.id] || (order.status as OrderStatus) || "Новый";
      if (grouped[effectiveStatus]) {
        grouped[effectiveStatus].push({ ...order, status: effectiveStatus });
      }
    }

    return grouped;
  }, [orders, optimisticUpdates]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const orderId = active.id as string;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const currentStatus =
      optimisticUpdates[orderId] || (order.status as OrderStatus) || "Новый";
    if (currentStatus === newStatus) return;

    // Optimistic update
    setOptimisticUpdates((prev) => ({ ...prev, [orderId]: newStatus }));

    // Server update
    updateStatusMutation.mutate({ id: orderId, status: newStatus });
  };

  const handleCardClick = async (order: OrderWithRelations) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      const fullOrder = await response.json();
      setViewingOrder(fullOrder);
      setIsViewDialogOpen(true);
    } catch {
      toast({ title: "Ошибка загрузки заказа", variant: "destructive" });
    }
  };

  return (
    <Layout title="Канбан">
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ORDER_STATUSES.map((status) => (
            <div key={status} className="min-w-[280px] w-[280px] shrink-0 space-y-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ORDER_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                orders={columns[status]}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </DndContext>
      )}

      <ViewOrderDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        order={viewingOrder}
      />
    </Layout>
  );
}
