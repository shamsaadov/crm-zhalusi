import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseMoscow } from "@/lib/date";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string | null;
  metadata: string | null;
  createdAt: string;
}

interface PaginatedResult {
  data: AuditLog[];
  nextCursor: string | null;
  hasMore: boolean;
}

const actionLabels: Record<string, string> = {
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
  status_change: "Смена статуса",
};

const entityTypeLabels: Record<string, string> = {
  order: "Заказ",
  finance: "Финансы",
  warehouse_receipt: "Поступление",
  dealer: "Дилер",
  supplier: "Поставщик",
  color: "Цвет",
  fabric: "Ткань",
  component: "Комплектующая",
  system: "Система",
  cashbox: "Касса",
  expense_type: "Тип расхода",
  multiplier: "Множитель",
};

function ChangesView({ changes }: { changes: string | null }) {
  const [open, setOpen] = useState(false);

  if (!changes) return <span className="text-muted-foreground">-</span>;

  let parsed: { before?: any; after?: any };
  try {
    parsed = JSON.parse(changes);
  } catch {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto py-0.5 px-1 text-xs">
          {open ? (
            <ChevronDown className="h-3 w-3 mr-1" />
          ) : (
            <ChevronRight className="h-3 w-3 mr-1" />
          )}
          Подробнее
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 text-xs">
          {parsed.before && (
            <div>
              <span className="font-medium text-destructive">До:</span>
              <pre className="mt-1 rounded bg-muted p-2 overflow-x-auto max-w-md">
                {JSON.stringify(parsed.before, null, 2)}
              </pre>
            </div>
          )}
          {parsed.after && (
            <div>
              <span className="font-medium text-green-600">После:</span>
              <pre className="mt-1 rounded bg-muted p-2 overflow-x-auto max-w-md">
                {JSON.stringify(parsed.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MetadataLabel({ metadata }: { metadata: string | null }) {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (parsed.orderNumber) return <span>#{parsed.orderNumber}</span>;
    return null;
  } catch {
    return null;
  }
}

export default function AuditLogPage() {
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allData, setAllData] = useState<AuditLog[]>([]);

  const params = new URLSearchParams({
    limit: "20",
    ...(entityType !== "all" && { entityType }),
    ...(action !== "all" && { action }),
    ...(from && { from }),
    ...(to && { to }),
    ...(cursor && { cursor }),
  });

  const { data, isLoading } = useQuery<PaginatedResult>({
    queryKey: [`/api/audit-logs?${params.toString()}`],
  });

  const displayData = cursor ? [...allData, ...(data?.data || [])] : (data?.data || []);

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setAllData(displayData);
      setCursor(data.nextCursor);
    }
  };

  const handleFilterChange = () => {
    setAllData([]);
    setCursor(null);
  };

  return (
    <Layout title="История действий">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v);
              handleFilterChange();
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Тип сущности" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(entityTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              handleFilterChange();
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Действие" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              {Object.entries(actionLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              handleFilterChange();
            }}
            className="w-[160px]"
            placeholder="От"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              handleFilterChange();
            }}
            className="w-[160px]"
            placeholder="До"
          />
        </div>

        {isLoading && allData.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : displayData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет записей
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Дата</TableHead>
                    <TableHead className="w-[120px]">Действие</TableHead>
                    <TableHead className="w-[140px]">Тип</TableHead>
                    <TableHead className="w-[100px]">Сущность</TableHead>
                    <TableHead>Изменения</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {parseMoscow(log.createdAt).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                            log.action === "create"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : log.action === "delete"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : log.action === "status_change"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          }`}
                        >
                          {actionLabels[log.action] || log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entityTypeLabels[log.entityType] || log.entityType}
                      </TableCell>
                      <TableCell className="text-sm">
                        <MetadataLabel metadata={log.metadata} />
                      </TableCell>
                      <TableCell>
                        <ChangesView changes={log.changes} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data?.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Загрузить ещё
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
