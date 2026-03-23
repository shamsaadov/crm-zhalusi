import * as React from "react";
import ReactSelect, { type StylesConfig, type GroupBase, components } from "react-select";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  secondaryLabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

type OptionType = { value: string; label: string; secondaryLabel?: string };

const customStyles: StylesConfig<OptionType, false, GroupBase<OptionType>> = {
  control: (base, state) => ({
    ...base,
    minHeight: "36px",
    fontSize: "14px",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
    backgroundColor: "hsl(var(--background))",
    boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring) / 0.2)" : "none",
    borderRadius: "calc(var(--radius) - 2px)",
    "&:hover": { borderColor: "hsl(var(--ring))" },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 9999,
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "calc(var(--radius) - 2px)",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: "200px",
    padding: "4px",
    overscrollBehavior: "contain",
  }),
  option: (base, state) => ({
    ...base,
    fontSize: "14px",
    borderRadius: "4px",
    backgroundColor: state.isSelected
      ? "hsl(var(--primary) / 0.12)"
      : state.isFocused
        ? "hsl(var(--accent))"
        : "transparent",
    color: state.isSelected ? "hsl(var(--primary))" : "hsl(var(--popover-foreground))",
    fontWeight: state.isSelected ? 500 : 400,
    cursor: "pointer",
    "&:active": { backgroundColor: "hsl(var(--accent))" },
  }),
  singleValue: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
    fontSize: "14px",
  }),
  placeholder: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
    fontSize: "14px",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: "4px",
    color: "hsl(var(--muted-foreground))",
  }),
  input: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
};

// Custom option renderer to show secondaryLabel
const CustomOption = (props: any) => {
  const { data } = props;
  return (
    <components.Option {...props}>
      <span>{data.label}</span>
      {data.secondaryLabel && (
        <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.6 }}>
          ({data.secondaryLabel})
        </span>
      )}
    </components.Option>
  );
};

// Custom single value renderer
const CustomSingleValue = (props: any) => {
  const { data } = props;
  return (
    <components.SingleValue {...props}>
      <span>{data.label}</span>
      {data.secondaryLabel && (
        <span style={{ marginLeft: 4, fontSize: 12, opacity: 0.6 }}>
          ({data.secondaryLabel})
        </span>
      )}
    </components.SingleValue>
  );
};

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Выберите...",
  searchPlaceholder = "Поиск...",
  emptyText = "Ничего не найдено",
  disabled = false,
  className,
  "data-testid": testId,
}: SearchableSelectProps) {
  const reactSelectOptions: OptionType[] = options.map((o) => ({
    value: o.value,
    label: o.label,
    secondaryLabel: o.secondaryLabel,
  }));

  const selected = reactSelectOptions.find((o) => o.value === value) || null;

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <ReactSelect
        value={selected}
        onChange={(opt) => opt && onValueChange(opt.value)}
        options={reactSelectOptions}
        placeholder={placeholder}
        isSearchable
        isDisabled={disabled}
        menuPlacement="auto"
        menuShouldScrollIntoView={false}
        menuPortalTarget={document.body}
        styles={{
          ...customStyles,
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        }}
        components={{ Option: CustomOption, SingleValue: CustomSingleValue }}
        noOptionsMessage={() => emptyText}
        filterOption={(option, inputValue) => {
          const search = inputValue.toLowerCase();
          return (
            option.data.label.toLowerCase().includes(search) ||
            (option.data.secondaryLabel || "").toLowerCase().includes(search)
          );
        }}
      />
    </div>
  );
}
