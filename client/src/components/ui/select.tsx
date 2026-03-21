"use client"

import * as React from "react"
import ReactSelect, { type Props as ReactSelectProps, type StylesConfig, type GroupBase, components, type MenuListProps } from "react-select"
import { cn } from "@/lib/utils"

// Prevents scroll events from leaking to parent (modal)
function NoScrollLeakMenuList<T>(props: MenuListProps<T, false, GroupBase<T>>) {
  return (
    <div onWheel={(e) => { e.stopPropagation(); e.preventDefault(); }}>
      <components.MenuList {...props} />
    </div>
  )
}

// ---- internal state ----
interface SelectContextValue {
  value: string | undefined
  onValueChange: (value: string) => void
}
const SelectContext = React.createContext<SelectContextValue>({ value: undefined, onValueChange: () => {} })

interface ItemDef { value: string; label: React.ReactNode }
const ItemsContext = React.createContext<{
  items: ItemDef[]
  register: (item: ItemDef) => void
}>({ items: [], register: () => {} })

// ---- <Select> root ----
function Select({ value, onValueChange, children }: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [items, setItems] = React.useState<ItemDef[]>([])
  const register = React.useCallback((item: ItemDef) => {
    setItems(prev => {
      if (prev.some(i => i.value === item.value)) return prev
      return [...prev, item]
    })
  }, [])

  return (
    <SelectContext.Provider value={{ value, onValueChange: onValueChange || (() => {}) }}>
      <ItemsContext.Provider value={{ items, register }}>
        {children}
      </ItemsContext.Provider>
    </SelectContext.Provider>
  )
}

// ---- <SelectTrigger> + <SelectContent> rendered together ----
// We collect items via SelectItem, then render ReactSelect in SelectContent.

const SelectGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>
const SelectLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children }, ref) => <div ref={ref} style={{ display: "none" }}>{children}</div>
)
SelectLabel.displayName = "SelectLabel"
const SelectSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} style={{ display: "none" }} />
)
SelectSeparator.displayName = "SelectSeparator"
const SelectScrollUpButton = () => null
const SelectScrollDownButton = () => null

// placeholder extractor
const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  return <span data-placeholder={placeholder} style={{ display: "none" }} />
}

// ---- SelectTrigger: we render the actual react-select here ----
function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

const SelectTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { "data-testid"?: string }
>(({ className, children, ...props }, ref) => {
  // extract placeholder from SelectValue child
  let placeholder = ""
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && (child as any).type === SelectValue) {
      placeholder = (child as any).props.placeholder || ""
    }
  })

  const { value, onValueChange } = React.useContext(SelectContext)
  const { items } = React.useContext(ItemsContext)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const scrollParentRef = React.useRef<HTMLElement | null>(null)

  const handleMenuOpen = () => {
    const parent = findScrollableParent(containerRef.current)
    if (parent) {
      scrollParentRef.current = parent
      parent.style.overflowY = "hidden"
    }
  }

  const handleMenuClose = () => {
    if (scrollParentRef.current) {
      scrollParentRef.current.style.overflowY = "auto"
      scrollParentRef.current = null
    }
  }

  const options = React.useMemo(() =>
    items.map(i => ({ value: i.value, label: typeof i.label === "string" ? i.label : i.value })),
    [items]
  )

  const selected = options.find(o => o.value === value) || null

  const customStyles: StylesConfig<{ value: string; label: string }, false, GroupBase<{ value: string; label: string }>> = {
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
        ? "hsl(var(--accent))"
        : state.isFocused
          ? "hsl(var(--accent))"
          : "transparent",
      color: "hsl(var(--popover-foreground))",
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
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
  }

  return (
    <div ref={(node) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }} className={cn("w-full", className)} data-testid={props["data-testid"]} {...props}>
      <ReactSelect
        value={selected}
        onChange={(opt) => opt && onValueChange(opt.value)}
        options={options}
        placeholder={placeholder}
        isSearchable={options.length > 6}
        menuPlacement="auto"
        menuPosition="fixed"
        menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
        menuShouldBlockScroll
        menuShouldScrollIntoView={false}
        onMenuOpen={handleMenuOpen}
        onMenuClose={handleMenuClose}
        styles={customStyles}
        components={{ MenuList: NoScrollLeakMenuList }}
        noOptionsMessage={() => "Ничего не найдено"}
      />
    </div>
  )
})
SelectTrigger.displayName = "SelectTrigger"

// ---- SelectContent: just renders children to register items, no visual ----
const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children }, ref) => {
    return <div ref={ref} style={{ display: "none" }}>{children}</div>
  }
)
SelectContent.displayName = "SelectContent"

// ---- SelectItem: registers itself ----
const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string; disabled?: boolean }
>(({ value, children, ...props }, ref) => {
  const { register } = React.useContext(ItemsContext)

  React.useEffect(() => {
    register({ value, label: children })
  }, [value, children, register])

  return <div ref={ref} style={{ display: "none" }} {...props} />
})
SelectItem.displayName = "SelectItem"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
