import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  StatusBadge,
  formatCurrency,
  BalanceBadge,
} from "@/components/status-badge";
import { Eye, Edit, FileText, Trash2 } from "lucide-react";
import { ORDER_STATUSES, type OrderStatus } from "@shared/schema";
import { format } from "date-fns";
import type { OrderWithRelations } from "./types";

interface ColumnActions {
  onView: (order: OrderWithRelations) => void;
  onEdit: (order: OrderWithRelations) => void;
  onPrint: (order: OrderWithRelations) => void;
  onDelete: (order: OrderWithRelations) => void;
  onStatusChange: (id: string, status: string) => void;
}

export function getOrderColumns(actions: ColumnActions) {
  return [
    {
      key: "orderNumber",
      header: "№",
      cell: (order: OrderWithRelations) => (
        <span
          className="font-mono"
          data-testid={`text-order-number-${order.id}`}
        >
          {order.orderNumber}
        </span>
      ),
    },
    {
      key: "date",
      header: "Дата",
      cell: (order: OrderWithRelations) =>
        format(new Date(order.date), "dd.MM.yyyy"),
    },
    {
      key: "dealer",
      header: "Дилер",
      cell: (order: OrderWithRelations) => order.dealer?.fullName || "-",
    },
    {
      key: "sashesCount",
      header: "Створок",
      cell: (order: OrderWithRelations) => (
        <Badge variant="secondary">{order.sashesCount || 0}</Badge>
      ),
    },
    {
      key: "status",
      header: "Статус",
      cell: (order: OrderWithRelations) => (
        <Select
          value={order.status || "Новый"}
          onValueChange={(value) => actions.onStatusChange(order.id, value)}
        >
          <SelectTrigger
            className="w-[140px]"
            data-testid={`select-status-${order.id}`}
          >
            <StatusBadge status={(order.status as OrderStatus) || "Новый"} />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <StatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "salePrice",
      header: "Продажа",
      cell: (order: OrderWithRelations) => (
        <span className="font-mono">{formatCurrency(order.salePrice)}</span>
      ),
      className: "text-right",
    },
    {
      key: "dealerDebt",
      header: "Долг дилера",
      cell: (order: OrderWithRelations) => (
        <BalanceBadge
          balance={parseFloat(order.dealerDebt?.toString() || "0")}
        />
      ),
      className: "text-right",
    },
    {
      key: "profit",
      header: "Прибыль",
      cell: (order: OrderWithRelations) => {
        const profit =
          parseFloat(order.salePrice?.toString() || "0") -
          parseFloat(order.costPrice?.toString() || "0");
        return <BalanceBadge balance={profit} />;
      },
      className: "text-right",
    },
    {
      key: "actions",
      header: "",
      cell: (order: OrderWithRelations) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onView(order)}
            data-testid={`button-view-${order.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onEdit(order)}
            data-testid={`button-edit-${order.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onPrint(order)}
            data-testid={`button-invoice-${order.id}`}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onDelete(order)}
            data-testid={`button-delete-${order.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];
}

