import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Search, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface DateRange {
  from?: Date;
  to?: Date;
}

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  showDateFilter?: boolean;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
  onReset?: () => void;
}

export function FilterBar({
  search = "",
  onSearchChange,
  searchPlaceholder = "Поиск...",
  dateRange,
  onDateRangeChange,
  showDateFilter = false,
  filters = [],
  onReset,
}: FilterBarProps) {
  const hasActiveFilters = search || dateRange?.from || dateRange?.to || filters.some(f => f.value);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-card rounded-md border">
      {onSearchChange && (
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
      )}

      {showDateFilter && onDateRangeChange && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start gap-2" data-testid="button-date-filter">
              <CalendarIcon className="h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "dd.MM.yyyy", { locale: ru })} -{" "}
                    {format(dateRange.to, "dd.MM.yyyy", { locale: ru })}
                  </>
                ) : (
                  format(dateRange.from, "dd.MM.yyyy", { locale: ru })
                )
              ) : (
                "Период"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) => onDateRangeChange(range || {})}
              numberOfMonths={2}
              locale={ru}
            />
          </PopoverContent>
        </Popover>
      )}

      {filters.map((filter) => (
        <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
          <SelectTrigger className="w-[180px]" data-testid={`select-filter-${filter.key}`}>
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} data-testid="button-reset-filters">
          <X className="h-4 w-4 mr-1" />
          Сбросить
        </Button>
      )}
    </div>
  );
}
