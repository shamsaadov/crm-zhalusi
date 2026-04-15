import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  StatusBadge,
  formatCurrency,
  BalanceBadge,
} from "@/components/status-badge";
import { Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import type { OrderStatus } from "@shared/schema";
import type { OrderWithRelations } from "./types";

interface ViewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithRelations | null;
}

// Strip trailing ".00" from PG decimal strings: "150.00" → "150", "200.50" → "200.5".
// Order sashes store width/height as decimal(10,2) so whole-cm values arrive
// padded with zeros, which looked noisy in the order view.
function fmtNum(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return String(v);
  return n.toString();
}

// Mobile app system types (slugs) → human-readable labels
const systemTypeLabels: Record<string, string> = {
  "mini-rulons": "Мини рулонная",
  "mini-zebra": "Мини зебра",
  "uni-1": "Уни-1 рулонная",
  "uni-1-zebra": "Уни-1 зебра",
  "uni-2": "Уни-2 рулонная",
  "uni-2-zebra": "Уни-2 зебра",
};

function fmtSystemType(v: string | null | undefined): string {
  if (!v) return "";
  return systemTypeLabels[v] || v;
}

export function ViewOrderDialog({
  open,
  onOpenChange,
  order,
}: ViewOrderDialogProps) {
  const [, navigate] = useLocation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Заказ #{order?.orderNumber}</DialogTitle>
            {order && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/orders?edit=${order.id}`);
                }}
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Редактировать
              </Button>
            )}
          </div>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Дата</p>
                <p className="font-medium">
                  {format(new Date(order.date), "dd.MM.yyyy")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Дилер</p>
                <p className="font-medium">{order.dealer?.fullName || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Статус</p>
                <StatusBadge status={(order.status as OrderStatus) || "Новый"} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Баланс дилера</p>
                <BalanceBadge
                  balance={order.dealerBalance || 0}
                />
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-2">
                Створки ({order.sashes?.length || 0})
              </h4>
              {order.sashes?.map((sash) => {
                // For orders converted from mobile measurements the catalogue
                // FKs (systemId/fabricId) are NULL — fall back to the raw
                // strings the dealer entered in the app.
                const systemLabel = sash.system?.name || sash.systemName || "-";
                const fabricLabel = sash.fabric?.name || sash.fabricName || "-";
                const hasMobileMeta = sash.systemType || sash.category;
                return (
                  <Card key={sash.id} className="mb-2">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Размеры:</span>{" "}
                          {fmtNum(sash.width)}x{fmtNum(sash.height)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Система:</span>{" "}
                          {systemLabel}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ткань:</span>{" "}
                          {fabricLabel}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Цена:</span>{" "}
                          {formatCurrency(sash.sashPrice)}
                        </div>
                      </div>
                      {hasMobileMeta && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {sash.systemType && <span>тип: {fmtSystemType(sash.systemType)}</span>}
                          {sash.systemType && sash.category && <span> · </span>}
                          {sash.category && <span>категория: {sash.category}</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Продажа</p>
                <p className="font-medium">
                  {formatCurrency(order.salePrice)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Себестоимость</p>
                <p className="font-medium">
                  {formatCurrency(order.costPrice)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Прибыль</p>
                <BalanceBadge
                  balance={
                    parseFloat(order.salePrice?.toString() || "0") -
                    parseFloat(order.costPrice?.toString() || "0")
                  }
                />
              </div>
            </div>
            {order.comment && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Комментарий</p>
                  <p>{order.comment}</p>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}




