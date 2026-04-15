import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowRight,
  Eye,
  Trash2,
  User,
  MapPin,
  Phone,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { parseMoscow } from "@/lib/date";
import type { Measurement, MeasurementSash } from "@shared/schema";

type MeasurementWithSashes = Measurement & {
  sashes: MeasurementSash[];
  dealerName?: string;
};

// Strip trailing ".00"/".0" from PG decimal strings: "150.00" → "150",
// "1.50" → "1.5". MeasurementSash width/height/coefficient are decimal(10,2)
// so whole numbers arrive padded with zeros.
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

export function AppMeasurementsTab({
  onConvertToOrder,
}: {
  onConvertToOrder?: (m: MeasurementWithSashes) => void;
}) {
  const { toast } = useToast();
  const [viewingMeasurement, setViewingMeasurement] =
    useState<MeasurementWithSashes | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: measurements = [], isLoading } = useQuery<
    MeasurementWithSashes[]
  >({
    queryKey: ["/api/app-measurements"],
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/app-measurements/${id}/convert`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/app-measurements"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Замер преобразован в заказ" });
      setIsViewOpen(false);
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/app-measurements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/app-measurements"],
      });
      toast({ title: "Замер удалён" });
      setDeleteId(null);
    },
    onError: (e: Error) =>
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      }),
  });

  const statusLabel = (s: string | null) => {
    switch (s) {
      case "draft":
        return { label: "Черновик", color: "bg-yellow-100 text-yellow-700" };
      case "pending":
        return { label: "На рассмотрении", color: "bg-orange-100 text-orange-700" };
      case "sent":
        return { label: "Принят", color: "bg-blue-100 text-blue-700" };
      case "in_production":
        return {
          label: "В производстве",
          color: "bg-purple-100 text-purple-700",
        };
      case "ready":
        return { label: "Готов", color: "bg-green-100 text-green-700" };
      case "installed":
        return {
          label: "Установлен",
          color: "bg-emerald-100 text-emerald-700",
        };
      default:
        return { label: s || "—", color: "bg-gray-100 text-gray-600" };
    }
  };

  const openView = (m: MeasurementWithSashes) => {
    setViewingMeasurement(m);
    setIsViewOpen(true);
  };

  return (
    <>
      <DataTable
        columns={[
          {
            key: "date",
            header: "Дата",
            cell: (m: MeasurementWithSashes) =>
              m.createdAt
                ? format(parseMoscow(m.createdAt), "dd.MM.yyyy HH:mm")
                : "—",
          },
          {
            key: "dealer",
            header: "Дилер",
            cell: (m: MeasurementWithSashes) => (
              <span className="font-medium">
                {m.dealerName || "—"}
              </span>
            ),
          },
          {
            key: "client",
            header: "Клиент",
            cell: (m: MeasurementWithSashes) => (
              <div>
                <div className="font-medium">
                  {m.clientName || "Без имени"}
                </div>
                {m.address && (
                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {m.address}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "sashes",
            header: "Створок",
            cell: (m: MeasurementWithSashes) => (
              <Badge variant="secondary">{m.sashes?.length || 0}</Badge>
            ),
          },
          {
            key: "total",
            header: "Коэф.",
            cell: (m: MeasurementWithSashes) => (
              <span className="font-semibold text-green-600">
                {fmtNum(m.totalCoefficient)}
              </span>
            ),
            className: "text-right",
          },
          {
            key: "status",
            header: "Статус",
            cell: (m: MeasurementWithSashes) => {
              const s = statusLabel(m.status);
              return (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}
                >
                  {s.label}
                </span>
              );
            },
          },
          {
            key: "actions",
            header: "",
            cell: (m: MeasurementWithSashes) => (
              <div className="flex gap-1 justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openView(m)}
                  title="Просмотр"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {(m.status === "pending" || m.status === "sent") && !m.orderId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => convertMutation.mutate(m.id)}
                    title="Принять и создать заказ"
                    disabled={convertMutation.isPending}
                  >
                    {convertMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-green-600" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteId(m.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
        data={measurements}
        isLoading={isLoading}
        emptyMessage="Нет замеров из приложения"
        getRowKey={(m) => m.id}
        onRowDoubleClick={(m) => {
          if (onConvertToOrder && !m.orderId) {
            onConvertToOrder(m);
          } else {
            openView(m);
          }
        }}
      />

      {/* View measurement dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Замер из приложения</DialogTitle>
          </DialogHeader>
          {viewingMeasurement && (
            <div className="space-y-4">
              {/* Dealer */}
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  Дилер: {viewingMeasurement.dealerName || "—"}
                </span>
              </div>

              {/* Client info */}
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="font-semibold text-sm">Клиент</h4>
                {viewingMeasurement.clientName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {viewingMeasurement.clientName}
                  </div>
                )}
                {viewingMeasurement.clientPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {viewingMeasurement.clientPhone}
                  </div>
                )}
                {viewingMeasurement.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {viewingMeasurement.address}
                  </div>
                )}
                {viewingMeasurement.comment && (
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    {viewingMeasurement.comment}
                  </div>
                )}
              </div>

              {/* Sashes */}
              <div className="rounded-lg border p-3">
                <h4 className="font-semibold text-sm mb-2">
                  Створки ({viewingMeasurement.sashes?.length || 0})
                </h4>
                <div className="space-y-1">
                  {viewingMeasurement.sashes?.map((s, i) => (
                    <div
                      key={s.id || i}
                      className="flex flex-col gap-0.5 text-sm py-1 border-b last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">
                            {fmtNum(s.width)}×{fmtNum(s.height)} см
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {s.systemName} · {s.category} · {s.control}
                          </span>
                        </div>
                        <span className="font-semibold text-green-600">
                          {fmtNum(s.coefficient)}
                        </span>
                      </div>
                      {(s.systemType || s.fabricName) && (
                        <div className="text-xs text-muted-foreground ml-1">
                          {s.systemType && <span>тип: {fmtSystemType(s.systemType)}</span>}
                          {s.systemType && s.fabricName && <span> · </span>}
                          {s.fabricName && <span>ткань: {s.fabricName}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t flex justify-between">
                  <span className="font-semibold">Итого:</span>
                  <span className="font-bold text-green-600">
                    {fmtNum(viewingMeasurement.totalCoefficient)}
                  </span>
                </div>
              </div>

              {/* Approve / convert button */}
              {!viewingMeasurement.orderId && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (onConvertToOrder) {
                        setIsViewOpen(false);
                        onConvertToOrder(viewingMeasurement);
                      } else {
                        convertMutation.mutate(viewingMeasurement.id);
                      }
                    }}
                    disabled={convertMutation.isPending}
                  >
                    {convertMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Принять и создать заказ
                  </Button>
                )}

              {viewingMeasurement.orderId && (
                <div className="text-sm text-center text-muted-foreground">
                  Уже преобразован в заказ
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить замер?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
