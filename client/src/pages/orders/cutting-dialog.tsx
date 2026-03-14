import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Scissors, Loader2, Printer, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CuttingPiece {
  sashIndex: number;
  width: number;
  height: number;
}

interface CuttingRow {
  id: string;
  rowIndex: number;
  cutLength: string;
  pieces: CuttingPiece[];
  usedWidth: string;
  wasteWidth: string;
}

interface CuttingLayoutResult {
  id: string;
  orderId: string;
  fabricId: string;
  fabricName?: string;
  rollWidth: string;
  totalLength: string;
  wastePercent: string;
  rows: CuttingRow[];
}

interface CuttingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: number;
}

export function CuttingDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: CuttingDialogProps) {
  const { toast } = useToast();

  const { data: layouts = [], isLoading } = useQuery<CuttingLayoutResult[]>({
    queryKey: ["/api/orders", orderId, "cutting"],
    queryFn: () =>
      fetch(`/api/orders/${orderId}/cutting`, { credentials: "include" }).then(
        (r) => r.json()
      ),
    enabled: !!orderId && open,
  });

  const calculateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/orders/${orderId}/cutting`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/orders", orderId, "cutting"],
      });
      toast({ title: "Раскрой рассчитан" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const handlePrint = () => {
    if (layouts.length === 0) return;

    const win = window.open("", "_blank");
    if (!win) return;

    const layoutsHtml = layouts
      .map((layout) => {
        const rollW = parseFloat(layout.rollWidth);
        const totalLen = parseFloat(layout.totalLength);
        const waste = parseFloat(layout.wastePercent);

        const rowsHtml = layout.rows
          .map((row) => {
            const cutLen = parseFloat(row.cutLength);
            const usedW = parseFloat(row.usedWidth);
            const scale = 600 / rollW; // масштаб для визуализации

            const maxH = 80;
            const piecesVisual = row.pieces
              .map((p) => {
                const w = p.width * scale;
                const h = Math.round((p.height / cutLen) * maxH);
                const bgColor = p.height < cutLen ? "#fef3c7" : "#dcfce7";
                return `<div style="width:${w}px;height:${h}px;background:${bgColor};border:1px solid #6b7280;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;align-self:flex-end">${p.width}x${p.height}</div>`;
              })
              .join("");

            const wasteW = rollW - usedW;
            const wasteVisual =
              wasteW > 0
                ? `<div style="width:${wasteW * scale}px;height:${maxH}px;background:#fee2e2;border:1px dashed #ef4444;display:flex;align-items:center;justify-content:center;font-size:10px;color:#ef4444;flex-shrink:0;align-self:flex-end">${wasteW.toFixed(0)} см</div>`
                : "";

            return `
              <div style="margin-bottom:12px">
                <div style="font-size:12px;font-weight:600;margin-bottom:4px">
                  Ряд ${row.rowIndex} — отрез ${cutLen} см
                  <span style="color:#6b7280;font-weight:400"> (занято ${usedW.toFixed(0)} из ${rollW} см)</span>
                </div>
                <div style="display:flex;align-items:flex-end;border:2px solid #374151;width:${rollW * scale}px;height:${maxH}px">${piecesVisual}${wasteVisual}</div>
              </div>
            `;
          })
          .join("");

        return `
          <div style="margin-bottom:24px">
            <h3 style="margin:0 0 8px">${layout.fabricName || "Ткань"}</h3>
            <p style="margin:0 0 4px;font-size:13px">Ширина рулона: <strong>${rollW} см</strong></p>
            <p style="margin:0 0 12px;font-size:13px">Итого: <strong>${(totalLen / 100).toFixed(2)} п.м.</strong> | Отходы: <strong>${waste.toFixed(1)}%</strong></p>
            ${rowsHtml}
          </div>
        `;
      })
      .join('<hr style="margin:16px 0">');

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Раскрой заказа #${orderNumber || ""}</title>
          <style>body { font-family: Arial, sans-serif; padding: 24px; }</style>
        </head>
        <body>
          <h2>Раскрой заказа #${orderNumber || ""}</h2>
          ${layoutsHtml}
        </body>
      </html>
    `);

    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Раскрой заказа #{orderNumber}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : layouts.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground text-sm">
              Раскрой ещё не рассчитан для этого заказа
            </p>
            <Button
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
            >
              {calculateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <Scissors className="h-4 w-4 mr-2" />
              Рассчитать раскрой
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {layouts.map((layout) => {
              const rollW = parseFloat(layout.rollWidth);
              const totalLen = parseFloat(layout.totalLength);
              const waste = parseFloat(layout.wastePercent);

              return (
                <div key={layout.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {layout.fabricName || "Ткань"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        рулон {rollW} см
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span>
                        <span className="text-muted-foreground">Итого:</span>{" "}
                        <strong>{(totalLen / 100).toFixed(2)} п.м.</strong>
                      </span>
                      <Badge
                        variant={waste > 20 ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        отходы {waste.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {layout.rows.map((row) => {
                      const cutLen = parseFloat(row.cutLength);
                      const usedW = parseFloat(row.usedWidth);
                      const wasteW = rollW - usedW;
                      const usedPercent = (usedW / rollW) * 100;

                      return (
                        <div
                          key={row.id || row.rowIndex}
                          className="rounded border bg-muted/20 p-2"
                        >
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                            <span>
                              Ряд {row.rowIndex} — отрез{" "}
                              <strong className="text-foreground">
                                {cutLen} см
                              </strong>
                            </span>
                            <span>
                              {usedW.toFixed(0)}/{rollW} см занято
                            </span>
                          </div>

                          {/* Визуализация ряда — высота кусков пропорциональна */}
                          {(() => {
                            const maxH = 60;
                            return (
                              <div className="flex items-end rounded overflow-hidden border" style={{ height: maxH }}>
                                {row.pieces.map((piece, pi) => {
                                  const h = Math.round((piece.height / cutLen) * maxH);
                                  return (
                                    <div
                                      key={pi}
                                      className="flex items-center justify-center text-[10px] font-mono border-r last:border-r-0"
                                      style={{
                                        width: `${(piece.width / rollW) * 100}%`,
                                        height: h,
                                        backgroundColor:
                                          piece.height < cutLen
                                            ? "#fef3c7"
                                            : "#dcfce7",
                                      }}
                                    >
                                      {piece.width}x{piece.height}
                                    </div>
                                  );
                                })}
                                {wasteW > 0 && (
                                  <div
                                    className="flex items-center justify-center text-[10px] text-red-500 bg-red-50 border-l border-dashed border-red-300"
                                    style={{
                                      width: `${((rollW - usedW) / rollW) * 100}%`,
                                      height: maxH,
                                    }}
                                  >
                                    {wasteW.toFixed(0)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>

                  <Separator />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          {layouts.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}
              >
                {calculateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Пересчитать
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Печать
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
