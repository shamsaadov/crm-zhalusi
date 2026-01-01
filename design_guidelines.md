# Design Guidelines: Business Accounting System (Blinds/Jalousie)

## Design Approach: Enterprise Data System

**Selected Framework:** Ant Design-inspired enterprise application
**Justification:** Information-dense B2B productivity tool requiring stability, data clarity, and efficiency over visual flair.

## Core Design Principles

1. **Data First:** Maximize information density without clutter
2. **Rapid Navigation:** Minimize clicks to reach any function
3. **Consistent Patterns:** Identical interactions across all CRUD operations
4. **Status Clarity:** Instant visual feedback for all states

## Layout System

**Spacing Units:** Tailwind units of 1, 2, 4, 6, 8, 16 (e.g., p-4, gap-6, mb-8)

**Application Structure:**
- Fixed left sidebar (w-64): Logo, main navigation, user profile at bottom
- Top bar (h-16): Page title, breadcrumbs, global search, notifications
- Content area: max-w-7xl mx-auto with p-6 to p-8 padding
- Sticky section headers for long tables/forms

**Grid Patterns:**
- Reference lists: 2-column layout (navigation tree left, content right)
- Forms: Single column max-w-2xl for clarity, multi-column for compact data entry
- Dashboards: 3-4 column metric cards, full-width tables below

## Typography

**Font Stack:** 
- Primary: Inter (via Google Fonts) - clean, readable at small sizes
- Monospace: JetBrains Mono for numbers, codes

**Hierarchy:**
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-semibold
- Card titles: text-base font-medium
- Body text: text-sm
- Table text: text-sm
- Labels: text-xs font-medium uppercase tracking-wide
- Financial numbers: text-base font-mono (tabular figures)

## Component Library

### Navigation
- **Sidebar:** Grouped sections (Справочники, Заказы, Финансы, Склад, Отчеты) with icons from Heroicons
- **Active state:** Subtle background with accent border-left
- **Breadcrumbs:** Always visible in top bar for context

### Tables (Core UI Element)
- Sticky header row with sort indicators
- Alternating row backgrounds for readability
- Hover state for entire row
- Inline edit capabilities for status changes
- Action column (right-aligned): Edit, Delete icons
- Pagination: Bottom-right, showing "1-20 of 145 записей"
- Column resizing capability for wide datasets
- Quick filters in header (dropdown icons)

### Forms
- **Modal approach** for Add/Edit: Centered modal (max-w-2xl) with backdrop blur
- Clear visual grouping with subtle borders or backgrounds
- Consistent field height (h-10)
- Labels above inputs, required indicators (*)
- Inline validation with immediate feedback
- Select dropdowns show additional context (e.g., "Иванов (долг: -12,000)")
- Date pickers: Range selection with visual calendar
- Number inputs: Right-aligned with proper formatting

### Filter Bar
- Sticky below top bar when scrolling
- Horizontal layout: Search | Date Range | Specific Filters | Reset button
- Collapsible on mobile, drawer on small screens
- Active filter badges showing count

### Data Display Cards
- Metric cards for reports: 4-column grid on desktop
- Large number display with label below
- Comparison indicators (↑↓ with percentage)
- Subtle icons for context (Heroicons outline style)

### Status Badges
- Rounded-full px-3 py-1 text-xs font-medium
- Distinct states for order status: Новый, В работе, Готов, Выдан
- Traffic light logic where appropriate (positive/negative balances)

### Buttons
- Primary actions: Solid with medium prominence
- Secondary: Outline style
- Destructive: Red accent for delete
- Icon buttons: h-10 w-10 for table actions
- Loading states: Spinner + disabled

### Financial Display
- Clear positive/negative indicators with symbols
- Grouped thousands separator (12 345.50)
- Consistent decimal places (2 for currency)
- Debt indicators: Red for owed, green for credit
- Summary boxes with subtle backgrounds for totals

## Interactions

**Animations:** Minimal - only for:
- Modal open/close (scale + fade, 200ms)
- Dropdown expand (150ms)
- Page transitions (100ms fade)
- Loading spinners

**No animations for:** Table sorting, filter application, navigation

## Page-Specific Layouts

**Login/Register:** Centered card (max-w-md) on neutral background, logo above, minimal distractions

**Dashboard/Reports:** Metric cards row → Charts (if any) → Data tables

**Lists (/lists):** Left sidebar with entity tabs, right content area with table + Add button (top-right)

**Orders/Finance/Warehouse:** Filter bar → Action button (top-right) → Data table with inline actions

## Critical UX Patterns

1. **Debt Display:** Always show alongside dealer/supplier names in red (owe us) or amber (we owe them) with formatted numbers
2. **Dual Selection:** For components/fabric warehouse forms, visual toggle between "Ткань" and "Комплектующие" with disabled alternative
3. **Calculation Display:** Show formula results in real-time for order cost_price/sale_price
4. **Confirmation Modals:** For all delete actions with impact warning
5. **Toast Notifications:** Top-right for success/error feedback, auto-dismiss in 3s

## Accessibility

- Keyboard navigation for all interactions
- Focus visible states on all interactive elements
- ARIA labels for icon-only buttons
- Sufficient contrast ratios for all text
- Form validation messages linked to inputs

**No hero images** - this is a utility application focused on data management, not marketing.