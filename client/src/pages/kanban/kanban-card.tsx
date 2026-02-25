import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, formatCurrency } from "@/components/status-badge";
import { format } from "date-fns";
import type { OrderStatus } from "@shared/schema";
import type { OrderWithRelations } from "../orders/types";

interface KanbanCardProps {
  order: OrderWithRelations;
  onClick: (order: OrderWithRelations) => void;
}

export function KanbanCard({ order, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: order.id,
      data: { order },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  const isProduct = order.orderType === "product";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-50" : ""}
    >
      <Card
        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
        onClick={(e) => {
          // Don't trigger click during drag
          if (!isDragging) {
            e.stopPropagation();
            onClick(order);
          }
        }}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm">
              #{order.orderNumber}
            </span>
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {isProduct ? "Товар" : "Створки"}
            </span>
          </div>

          <div className="text-sm text-muted-foreground truncate">
            {order.dealer?.fullName || "Без дилера"}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{format(new Date(order.date), "dd.MM.yyyy")}</span>
            {!isProduct && order.sashesCount != null && order.sashesCount > 0 && (
              <span>{order.sashesCount} шт.</span>
            )}
          </div>

          <div className="text-sm font-medium text-right">
            {formatCurrency(order.salePrice)} ₸
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
