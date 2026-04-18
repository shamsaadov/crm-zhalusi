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
import { ClipboardList, FileText, Trash2, Scissors, AlertTriangle } from "lucide-react";
import { ORDER_STATUSES, type OrderStatus } from "@shared/schema";
import { format } from "date-fns";
import type { OrderWithRelations, FabricWithStock } from "./types";

interface ColumnActions {
  onWorkshopPrint: (order: OrderWithRelations) => void | Promise<void>;
  onCustomerPrint: (order: OrderWithRelations) => void | Promise<void>;
  onCutting: (order: OrderWithRelations) => void;
  onDelete: (order: OrderWithRelations) => void;
  onStatusChange: (id: string, status: string) => void;
  showProfit?: boolean;
  fabricStock?: FabricWithStock[];
}

function getMissingPriceFabricNames(
  order: OrderWithRelations,
  fabricStock: FabricWithStock[] | undefined
): string[] {
  if (!fabricStock || !order.fabricIds || order.fabricIds.length === 0) return [];
  return order.fabricIds
    .map((id) => {
      const f = fabricStock.find((f) => f.id === id);
      if (!f) return null;
      // Цена «есть» либо из поступлений (avgPrice), либо вбита вручную
      // (fabrics.price — fallback для заказов до первой закупки).
      const stockPrice = f.stock?.avgPrice ?? 0;
      const manualPrice = parseFloat((f as any).price?.toString() || "0") || 0;
      const effective = stockPrice > 0 ? stockPrice : manualPrice;
      return effective > 0 ? null : f.name;
    })
    .filter((n): n is string => !!n);
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
      cell: (order: OrderWithRelations) => {
        const missingFabrics = getMissingPriceFabricNames(order, actions.fabricStock);
        const blockShipping = missingFabrics.length > 0;
        return (
          <div className="flex items-center gap-1">
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
                {ORDER_STATUSES.map((status) => {
                  const disabled = status === "Отгружен" && blockShipping;
                  return (
                    <SelectItem
                      key={status}
                      value={status}
                      disabled={disabled}
                      title={
                        disabled
                          ? `Укажите цену ткани: ${missingFabrics.join(", ")}`
                          : undefined
                      }
                    >
                      <StatusBadge status={status} />
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {blockShipping && (
              <AlertTriangle
                className="h-4 w-4 text-amber-500"
                aria-label="Не указана цена ткани"
              />
            )}
          </div>
        );
      },
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
      key: "dealerShippedDebt",
      header: "Долг дилера",
      cell: (order: OrderWithRelations) => (
        <BalanceBadge
          balance={order.dealerShippedDebt != null ? -(order.dealerShippedDebt) : 0}
        />
      ),
      className: "text-right",
    },
    {
      key: "dealerBalance",
      header: "Долг с ожид. отгрузками",
      cell: (order: OrderWithRelations) => (
        <BalanceBadge
          balance={order.dealerBalance || 0}
        />
      ),
      className: "text-right",
    },
    ...(actions.showProfit ? [{
      key: "profit",
      header: "Прибыль",
      cell: (order: OrderWithRelations) => {
        const profit =
          parseFloat(order.salePrice?.toString() || "0") -
          parseFloat(order.costPrice?.toString() || "0");
        return <BalanceBadge balance={profit} />;
      },
      className: "text-right",
    }] : []),
    {
      key: "actions",
      header: "",
      cell: (order: OrderWithRelations) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Раскрой"
            onClick={() => actions.onCutting(order)}
            data-testid={`button-cutting-${order.id}`}
          >
            <Scissors className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onWorkshopPrint(order)}
            data-testid={`button-workshop-invoice-${order.id}`}
          >
            <ClipboardList className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => actions.onCustomerPrint(order)}
            data-testid={`button-customer-invoice-${order.id}`}
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

