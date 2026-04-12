import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useLocation } from "wouter";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import {
  ENTITY_TYPE_LABELS,
  ACTION_CONFIG,
  getFieldLabel,
  formatAuditValue,
  parseChanges,
} from "@/lib/audit-labels";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string | null;
  metadata: string | null;
  createdAt: string;
  entityDisplayName: string;
}

interface PaginatedResult {
  data: AuditLog[];
  nextCursor: string | null;
  hasMore: boolean;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  status_change: ArrowRight,
};

function ChangesTable({
  changes,
  entityType,
  action,
}: {
  changes: string | null;
  entityType: string;
  action: string;
}) {
  const parsed = parseChanges(changes);

  if (!parsed) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Нет данных об изменениях
      </p>
    );
  }

  const showBefore = action !== "create";
  const showAfter = action !== "delete";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1.5 pr-4 font-medium text-muted-foreground">
              Поле
            </th>
            {showBefore && (
              <th className="py-1.5 pr-4 font-medium text-muted-foreground">
                Было
              </th>
            )}
            {showAfter && (
              <th className="py-1.5 font-medium text-muted-foreground">
                Стало
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {parsed.map(({ field, before, after }) => (
            <tr key={field} className="border-b last:border-0">
              <td className="py-1.5 pr-4 text-muted-foreground">
                {getFieldLabel(entityType, field)}
              </td>
              {showBefore && (
                <td className="py-1.5 pr-4 text-red-600/70 dark:text-red-400/70">
                  {formatAuditValue(before)}
                </td>
              )}
              {showAfter && (
                <td className="py-1.5 font-medium">
                  {formatAuditValue(after)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLogPage() {
  const [, navigate] = useLocation();
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

  const displayData = cursor
    ? [...allData, ...(data?.data || [])]
    : data?.data || [];

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

  const handleEntityClick = (log: AuditLog) => {
    if (log.entityType === "order") {
      navigate(`/orders?edit=${log.entityId}`);
    }
  };

  return (
    <Layout title="История действий">
      <div className="space-y-4">
        {/* Фильтры */}
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
              {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
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
              {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
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

        {/* Содержимое */}
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
            <Accordion type="multiple" className="space-y-2">
              {displayData.map((log) => {
                const config = ACTION_CONFIG[log.action] ?? {
                  label: log.action,
                  color: "text-muted-foreground",
                  bgColor: "bg-muted",
                };
                const Icon = ACTION_ICONS[log.action] ?? Pencil;
                const entityLabel =
                  ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType;
                const isClickable = log.entityType === "order";
                const timeAgo = formatDistanceToNow(
                  new Date(log.createdAt),
                  { addSuffix: true, locale: ru }
                );

                return (
                  <AccordionItem
                    key={log.id}
                    value={log.id}
                    className="border rounded-lg px-4 data-[state=open]:bg-muted/30"
                  >
                    <AccordionTrigger className="hover:no-underline py-3 gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div
                          className={`shrink-0 rounded-full p-1.5 ${config.bgColor}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium text-sm truncate ${
                                isClickable
                                  ? "text-primary hover:underline cursor-pointer"
                                  : ""
                              }`}
                              onClick={
                                isClickable
                                  ? (e) => {
                                      e.stopPropagation();
                                      handleEntityClick(log);
                                    }
                                  : undefined
                              }
                            >
                              {log.entityDisplayName}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {entityLabel}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {config.label}
                          </span>
                        </div>

                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {timeAgo}
                        </span>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-0 pb-3">
                      <ChangesTable
                        changes={log.changes}
                        entityType={log.entityType}
                        action={log.action}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {data?.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
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
