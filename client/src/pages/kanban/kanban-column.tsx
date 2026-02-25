import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@shared/schema";
import type { OrderWithRelations } from "../orders/types";
import { KanbanCard } from "./kanban-card";

const columnColors: Record<OrderStatus, string> = {
  "Новый": "bg-blue-500",
  "В производстве": "bg-amber-500",
  "Готов": "bg-green-500",
  "Отгружен": "bg-gray-500",
};

interface KanbanColumnProps {
  status: OrderStatus;
  orders: OrderWithRelations[];
  onCardClick: (order: OrderWithRelations) => void;
}

export function KanbanColumn({ status, orders, onCardClick }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border bg-muted/30 min-w-[280px] w-[280px] shrink-0",
        "transition-colors duration-200",
        isOver && "bg-primary/5 border-primary/30"
      )}
    >
      {/* Color bar */}
      <div className={cn("h-1 rounded-t-lg", columnColors[status])} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="font-medium text-sm">{status}</h3>
        <Badge variant="secondary" className="text-xs">
          {orders.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 px-2 pb-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <div className="space-y-2">
          {orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              onClick={onCardClick}
            />
          ))}
          {orders.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Нет заказов
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
