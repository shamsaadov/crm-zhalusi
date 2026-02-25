import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusStyles: Record<OrderStatus, string> = {
  "Новый": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "В производстве": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Готов": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Отгружен": "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn("font-medium", statusStyles[status], className)}
      data-testid={`badge-status-${status}`}
    >
      {status}
    </Badge>
  );
}

interface BalanceBadgeProps {
  balance: number | string;
  className?: string;
}

export function BalanceBadge({ balance, className }: BalanceBadgeProps) {
  const numBalance = typeof balance === "string" ? parseFloat(balance) : balance;
  const isPositive = numBalance > 0;
  const isNegative = numBalance < 0;

  return (
    <span
      className={cn(
        "font-mono text-sm",
        isPositive && "text-green-600 dark:text-green-400",
        isNegative && "text-red-600 dark:text-red-400",
        !isPositive && !isNegative && "text-muted-foreground",
        className
      )}
      data-testid="text-balance"
    >
      {numBalance >= 0 ? "+" : ""}
      {numBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  return numValue.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
