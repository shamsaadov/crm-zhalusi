import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  StatusBadge,
  formatCurrency,
  BalanceBadge,
} from "@/components/status-badge";
import { format } from "date-fns";
import type { OrderStatus } from "@shared/schema";
import type { OrderWithRelations } from "./types";

interface ViewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithRelations | null;
}

export function ViewOrderDialog({
  open,
  onOpenChange,
  order,
}: ViewOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Заказ #{order?.orderNumber}</DialogTitle>
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
              {order.sashes?.map((sash) => (
                <Card key={sash.id} className="mb-2">
                  <CardContent className="py-3">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Размеры:</span>{" "}
                        {sash.width}x{sash.height}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Система:</span>{" "}
                        {sash.system?.name || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ткань:</span>{" "}
                        {sash.fabric?.name || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Цена:</span>{" "}
                        {formatCurrency(sash.sashPrice)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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




