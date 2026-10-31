// Корректировка остатка (КО): новое фактическое количество → излишек или недостача.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/components/ues/report-kit";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtQty } from "./common";

export interface AdjustTarget {
  itemType: "fabric" | "component";
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
}

const num = (v: string) => parseFloat(v.replace(/\s/g, "").replace(",", "."));

export function AdjustmentDialog({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setQty(String(Math.round(target.quantity * 1000) / 1000));
    setPrice(target.price ? target.price.toFixed(2) : "");
    setComment("");
    setError(null);
  }, [target]);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/stock/adjustment", {
        itemType: target!.itemType,
        itemId: target!.itemId,
        newQuantity: num(qty),
        currentQuantity: target!.quantity,
        price: num(price),
        comment: comment || undefined,
      }),
    onSuccess: () => {
      for (const k of ["/api/stock", "/api/stock/adjustments", "/api/warehouse", "/api/reports/balance", "/api/dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast({ title: "Остаток скорректирован" });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const diff = target && Number.isFinite(num(qty)) ? num(qty) - target.quantity : 0;

  const submit = () => {
    if (!Number.isFinite(num(qty)) || num(qty) < 0) return setError("Укажите фактический остаток");
    if (!Number.isFinite(num(price)) || num(price) < 0) return setError("Укажите цену");
    if (Math.abs(diff) < 0.00005) return setError("Остаток не изменился");
    mutation.mutate();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Корректировка остатка</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-[13px]">
            <div className="rounded-[10px] bg-[var(--ues-surface-soft)] px-3 py-2">
              <div className="font-semibold">{target.name}</div>
              <div className="text-[var(--ues-muted)]">
                Учётный остаток: {fmtQty(target.quantity)} {target.unit}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="ues-field-label">Фактический остаток, {target.unit}</span>
                <input
                  className="ues-input h-9 text-right font-semibold"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => {
                    setQty(e.target.value);
                    setError(null);
                  }}
                  autoFocus
                  data-testid="input-adjust-qty"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ues-field-label">Цена за {target.unit}</span>
                <input
                  className="ues-input h-9 text-right"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setError(null);
                  }}
                  data-testid="input-adjust-price"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="ues-field-label">Причина</span>
              <input
                className="ues-input h-9"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: инвентаризация 31.10"
              />
            </label>
            {Math.abs(diff) >= 0.00005 && (
              <div className={diff > 0 ? "ues-pos" : "ues-neg"}>
                {diff > 0 ? "Излишек" : "Недостача"}: {fmtQty(Math.abs(diff))} {target.unit} на{" "}
                {fmtMoney(Math.abs(diff) * (num(price) || 0))}
              </div>
            )}
            {error && <div className="text-[12px] text-[var(--ues-danger)]">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="ues-btn" onClick={onClose}>
                Отмена
              </button>
              <button
                type="button"
                className="ues-btn success"
                onClick={submit}
                disabled={mutation.isPending}
                data-testid="button-adjust-submit"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Провести
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
