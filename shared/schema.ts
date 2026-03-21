import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  decimal,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  reportPassword: text("report_password"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Colors reference table
export const colors = pgTable("colors", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const colorsRelations = relations(colors, ({ one }) => ({
  user: one(users, { fields: [colors.userId], references: [users.id] }),
}));

export const insertColorSchema = createInsertSchema(colors).omit({ id: true });
export type InsertColor = z.infer<typeof insertColorSchema>;
export type Color = typeof colors.$inferSelect;

// Fabrics reference table
export const fabrics = pgTable("fabrics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  width: decimal("width", { precision: 10, scale: 2 }),
  fabricType: text("fabric_type"), // "zebra" или "roll"
  colorId: varchar("color_id").references(() => colors.id),
  category: text("category"), // 1,2,3,4,5,E
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const fabricsRelations = relations(fabrics, ({ one }) => ({
  user: one(users, { fields: [fabrics.userId], references: [users.id] }),
  color: one(colors, { fields: [fabrics.colorId], references: [colors.id] }),
}));

export const insertFabricSchema = createInsertSchema(fabrics).omit({
  id: true,
});
export type InsertFabric = z.infer<typeof insertFabricSchema>;
export type Fabric = typeof fabrics.$inferSelect;

// Dealers reference table
export const dealers = pgTable("dealers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  city: text("city"),
  phone: text("phone"),
  openingBalance: decimal("opening_balance", {
    precision: 12,
    scale: 2,
  }).default("0"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const dealersRelations = relations(dealers, ({ one }) => ({
  user: one(users, { fields: [dealers.userId], references: [users.id] }),
}));

export const insertDealerSchema = createInsertSchema(dealers).omit({
  id: true,
});
export type InsertDealer = z.infer<typeof insertDealerSchema>;
export type Dealer = typeof dealers.$inferSelect;

// Cashboxes reference table
export const cashboxes = pgTable("cashboxes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  openingBalance: decimal("opening_balance", {
    precision: 12,
    scale: 2,
  }).default("0"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const cashboxesRelations = relations(cashboxes, ({ one }) => ({
  user: one(users, { fields: [cashboxes.userId], references: [users.id] }),
}));

export const insertCashboxSchema = createInsertSchema(cashboxes).omit({
  id: true,
});
export type InsertCashbox = z.infer<typeof insertCashboxSchema>;
export type Cashbox = typeof cashboxes.$inferSelect;

// Systems reference table
export const systems = pgTable("systems", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  colorId: varchar("color_id").references(() => colors.id),
  systemKey: text("system_key"),
  formula: text("formula"),
  multiplierId: varchar("multiplier_id").references(() => multipliers.id, {
    onDelete: "set null",
  }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const systemsRelations = relations(systems, ({ one, many }) => ({
  user: one(users, { fields: [systems.userId], references: [users.id] }),
  color: one(colors, { fields: [systems.colorId], references: [colors.id] }),
  systemComponents: many(systemComponents),
}));

export const insertSystemSchema = createInsertSchema(systems).omit({
  id: true,
});
export type InsertSystem = z.infer<typeof insertSystemSchema>;
export type System = typeof systems.$inferSelect;

// System Components junction table
export const systemComponents = pgTable("system_components", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  systemId: varchar("system_id")
    .notNull()
    .references(() => systems.id, { onDelete: "cascade" }),
  componentId: varchar("component_id")
    .notNull()
    .references(() => components.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1"),
  sizeSource: text("size_source"),
  sizeMultiplier: decimal("size_multiplier", {
    precision: 10,
    scale: 4,
  }).default("1"),
});

export const systemComponentsRelations = relations(
  systemComponents,
  ({ one }) => ({
    system: one(systems, {
      fields: [systemComponents.systemId],
      references: [systems.id],
    }),
    component: one(components, {
      fields: [systemComponents.componentId],
      references: [components.id],
    }),
  })
);

export const insertSystemComponentSchema = createInsertSchema(
  systemComponents
).omit({ id: true });
export type InsertSystemComponent = z.infer<typeof insertSystemComponentSchema>;
export type SystemComponent = typeof systemComponents.$inferSelect;

// Expense Types reference table
export const expenseTypes = pgTable("expense_types", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  direction: text("direction").notNull(), // "expense" or "income"
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const expenseTypesRelations = relations(expenseTypes, ({ one }) => ({
  user: one(users, { fields: [expenseTypes.userId], references: [users.id] }),
}));

export const insertExpenseTypeSchema = createInsertSchema(expenseTypes).omit({
  id: true,
});
export type InsertExpenseType = z.infer<typeof insertExpenseTypeSchema>;
export type ExpenseType = typeof expenseTypes.$inferSelect;

// Components reference table
export const components = pgTable("components", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  colorId: varchar("color_id").references(() => colors.id),
  unit: text("unit"), // шт/м/упак
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const componentsRelations = relations(components, ({ one }) => ({
  user: one(users, { fields: [components.userId], references: [users.id] }),
  color: one(colors, { fields: [components.colorId], references: [colors.id] }),
}));

export const insertComponentSchema = createInsertSchema(components).omit({
  id: true,
});
export type InsertComponent = z.infer<typeof insertComponentSchema>;
export type Component = typeof components.$inferSelect;

// Multipliers reference table
export const multipliers = pgTable("multipliers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  value: decimal("value", { precision: 10, scale: 4 }).notNull(),
  name: text("name"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const multipliersRelations = relations(multipliers, ({ one }) => ({
  user: one(users, { fields: [multipliers.userId], references: [users.id] }),
}));

export const insertMultiplierSchema = createInsertSchema(multipliers).omit({
  id: true,
});
export type InsertMultiplier = z.infer<typeof insertMultiplierSchema>;
export type Multiplier = typeof multipliers.$inferSelect;

// Suppliers reference table
export const suppliers = pgTable("suppliers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  openingBalance: decimal("opening_balance", {
    precision: 12,
    scale: 2,
  }).default("0"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const suppliersRelations = relations(suppliers, ({ one }) => ({
  user: one(users, { fields: [suppliers.userId], references: [users.id] }),
}));

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderNumber: integer("order_number").notNull(),
  date: date("date").notNull(),
  dealerId: varchar("dealer_id").references(() => dealers.id),
  status: text("status").default("Новый"), // Новый, В производстве, Готов, Отгружен
  salePrice: decimal("sale_price", { precision: 12, scale: 2 }).default("0"),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }).default("0"),
  dealerDebt: decimal("dealer_debt", { precision: 12, scale: 2 }).default("0"),
  comment: text("comment"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  dealer: one(dealers, { fields: [orders.dealerId], references: [dealers.id] }),
  sashes: many(orderSashes),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order Sashes table (multiple sashes per order)
export const orderSashes = pgTable("order_sashes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  width: decimal("width", { precision: 10, scale: 2 }).notNull(),
  height: decimal("height", { precision: 10, scale: 2 }).notNull(),
  systemId: varchar("system_id").references(() => systems.id),
  systemColorId: varchar("system_color_id").references(() => colors.id),
  controlSide: text("control_side"), // "ЛР" or "ПР"
  fabricId: varchar("fabric_id").references(() => fabrics.id, {
    onDelete: "set null",
  }),
  fabricColorId: varchar("fabric_color_id").references(() => colors.id, {
    onDelete: "set null",
  }),
  componentId: varchar("component_id").references(() => components.id, {
    onDelete: "set null",
  }), // Для заказов товара
  sashPrice: decimal("sash_price", { precision: 12, scale: 2 }).default("0"),
  sashCost: decimal("sash_cost", { precision: 12, scale: 2 }).default("0"),
  room: integer("room").default(1), // Номер комнаты для группировки
  roomName: text("room_name"), // Название комнаты (опционально)
});

export const orderSashesRelations = relations(orderSashes, ({ one }) => ({
  order: one(orders, {
    fields: [orderSashes.orderId],
    references: [orders.id],
  }),
  system: one(systems, {
    fields: [orderSashes.systemId],
    references: [systems.id],
  }),
  systemColor: one(colors, {
    fields: [orderSashes.systemColorId],
    references: [colors.id],
  }),
  fabric: one(fabrics, {
    fields: [orderSashes.fabricId],
    references: [fabrics.id],
  }),
  fabricColor: one(colors, {
    fields: [orderSashes.fabricColorId],
    references: [colors.id],
  }),
  component: one(components, {
    fields: [orderSashes.componentId],
    references: [components.id],
  }),
}));

export const insertOrderSashSchema = createInsertSchema(orderSashes).omit({
  id: true,
});
export type InsertOrderSash = z.infer<typeof insertOrderSashSchema>;
export type OrderSash = typeof orderSashes.$inferSelect;

// Finance Operations table
export const financeOperations = pgTable("finance_operations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // "income", "expense", "supplier_payment", "transfer"
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  cashboxId: varchar("cashbox_id").references(() => cashboxes.id),
  fromCashboxId: varchar("from_cashbox_id").references(() => cashboxes.id),
  toCashboxId: varchar("to_cashbox_id").references(() => cashboxes.id),
  dealerId: varchar("dealer_id").references(() => dealers.id),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  expenseTypeId: varchar("expense_type_id").references(() => expenseTypes.id),
  comment: text("comment"),
  isDraft: boolean("is_draft").default(false),
  deletedAt: timestamp("deleted_at"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
});

export const financeOperationsRelations = relations(
  financeOperations,
  ({ one }) => ({
    user: one(users, {
      fields: [financeOperations.userId],
      references: [users.id],
    }),
    cashbox: one(cashboxes, {
      fields: [financeOperations.cashboxId],
      references: [cashboxes.id],
    }),
    fromCashbox: one(cashboxes, {
      fields: [financeOperations.fromCashboxId],
      references: [cashboxes.id],
    }),
    toCashbox: one(cashboxes, {
      fields: [financeOperations.toCashboxId],
      references: [cashboxes.id],
    }),
    dealer: one(dealers, {
      fields: [financeOperations.dealerId],
      references: [dealers.id],
    }),
    supplier: one(suppliers, {
      fields: [financeOperations.supplierId],
      references: [suppliers.id],
    }),
    expenseType: one(expenseTypes, {
      fields: [financeOperations.expenseTypeId],
      references: [expenseTypes.id],
    }),
  })
);

export const insertFinanceOperationSchema = createInsertSchema(
  financeOperations
).omit({ id: true });
export type InsertFinanceOperation = z.infer<
  typeof insertFinanceOperationSchema
>;
export type FinanceOperation = typeof financeOperations.$inferSelect;

// Warehouse Receipts table (header)
export const warehouseReceipts = pgTable("warehouse_receipts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  date: date("date").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  comment: text("comment"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const warehouseReceiptsRelations = relations(
  warehouseReceipts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [warehouseReceipts.userId],
      references: [users.id],
    }),
    supplier: one(suppliers, {
      fields: [warehouseReceipts.supplierId],
      references: [suppliers.id],
    }),
    items: many(warehouseReceiptItems),
  })
);

export const insertWarehouseReceiptSchema = createInsertSchema(
  warehouseReceipts
).omit({ id: true });
export type InsertWarehouseReceipt = z.infer<
  typeof insertWarehouseReceiptSchema
>;
export type WarehouseReceipt = typeof warehouseReceipts.$inferSelect;

// Warehouse Receipt Items table (multiple items per receipt)
export const warehouseReceiptItems = pgTable("warehouse_receipt_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  receiptId: varchar("receipt_id")
    .notNull()
    .references(() => warehouseReceipts.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(), // "component" or "fabric"
  componentId: varchar("component_id").references(() => components.id, {
    onDelete: "set null",
  }),
  fabricId: varchar("fabric_id").references(() => fabrics.id, {
    onDelete: "set null",
  }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
});

export const warehouseReceiptItemsRelations = relations(
  warehouseReceiptItems,
  ({ one }) => ({
    receipt: one(warehouseReceipts, {
      fields: [warehouseReceiptItems.receiptId],
      references: [warehouseReceipts.id],
    }),
    component: one(components, {
      fields: [warehouseReceiptItems.componentId],
      references: [components.id],
    }),
    fabric: one(fabrics, {
      fields: [warehouseReceiptItems.fabricId],
      references: [fabrics.id],
    }),
  })
);

export const insertWarehouseReceiptItemSchema = createInsertSchema(
  warehouseReceiptItems
).omit({ id: true });
export type InsertWarehouseReceiptItem = z.infer<
  typeof insertWarehouseReceiptItemSchema
>;
export type WarehouseReceiptItem = typeof warehouseReceiptItems.$inferSelect;

// Warehouse Writeoffs table (material consumption by orders)
export const warehouseWriteoffs = pgTable("warehouse_writeoffs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id")
    .references(() => orders.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(), // "component" or "fabric"
  componentId: varchar("component_id").references(() => components.id),
  fabricId: varchar("fabric_id").references(() => fabrics.id),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  date: date("date").notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment"),
});

export const warehouseWriteoffsRelations = relations(
  warehouseWriteoffs,
  ({ one }) => ({
    order: one(orders, {
      fields: [warehouseWriteoffs.orderId],
      references: [orders.id],
    }),
    component: one(components, {
      fields: [warehouseWriteoffs.componentId],
      references: [components.id],
    }),
    fabric: one(fabrics, {
      fields: [warehouseWriteoffs.fabricId],
      references: [fabrics.id],
    }),
    user: one(users, {
      fields: [warehouseWriteoffs.userId],
      references: [users.id],
    }),
  })
);

export const insertWarehouseWriteoffSchema = createInsertSchema(
  warehouseWriteoffs
).omit({ id: true });
export type InsertWarehouseWriteoff = z.infer<
  typeof insertWarehouseWriteoffSchema
>;
export type WarehouseWriteoff = typeof warehouseWriteoffs.$inferSelect;

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  changes: text("changes"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Cutting layouts (раскрой рулона)
export const cuttingLayouts = pgTable("cutting_layouts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fabricId: varchar("fabric_id")
    .notNull()
    .references(() => fabrics.id),
  rollWidth: decimal("roll_width", { precision: 10, scale: 2 }).notNull(), // ширина рулона в см
  totalLength: decimal("total_length", { precision: 10, scale: 2 }).notNull(), // итого п.м. в см
  wastePercent: decimal("waste_percent", { precision: 5, scale: 2 }).default("0"),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cuttingLayoutsRelations = relations(cuttingLayouts, ({ one, many }) => ({
  order: one(orders, { fields: [cuttingLayouts.orderId], references: [orders.id] }),
  fabric: one(fabrics, { fields: [cuttingLayouts.fabricId], references: [fabrics.id] }),
  user: one(users, { fields: [cuttingLayouts.userId], references: [users.id] }),
  rows: many(cuttingLayoutRows),
}));

export const insertCuttingLayoutSchema = createInsertSchema(cuttingLayouts).omit({ id: true });
export type InsertCuttingLayout = z.infer<typeof insertCuttingLayoutSchema>;
export type CuttingLayout = typeof cuttingLayouts.$inferSelect;

// Cutting layout rows (ряды раскроя)
export const cuttingLayoutRows = pgTable("cutting_layout_rows", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id")
    .notNull()
    .references(() => cuttingLayouts.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(), // порядок ряда
  cutLength: decimal("cut_length", { precision: 10, scale: 2 }).notNull(), // длина отреза (высота створки) в см
  pieces: text("pieces").notNull(), // JSON: [{sashIndex, width, height}]
  usedWidth: decimal("used_width", { precision: 10, scale: 2 }).notNull(), // занято по ширине в см
  wasteWidth: decimal("waste_width", { precision: 10, scale: 2 }).notNull(), // остаток по ширине в см
});

export const cuttingLayoutRowsRelations = relations(cuttingLayoutRows, ({ one }) => ({
  layout: one(cuttingLayouts, {
    fields: [cuttingLayoutRows.layoutId],
    references: [cuttingLayouts.id],
  }),
}));

export const insertCuttingLayoutRowSchema = createInsertSchema(cuttingLayoutRows).omit({ id: true });
export type InsertCuttingLayoutRow = z.infer<typeof insertCuttingLayoutRowSchema>;
export type CuttingLayoutRow = typeof cuttingLayoutRows.$inferSelect;

// ===== INSTALLER / MOBILE TABLES =====

// Measurement statuses
export const MEASUREMENT_STATUSES = [
  "draft",
  "sent",
  "in_production",
  "ready",
  "installed",
] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

// Installers — учётные записи монтажников (отдельно от users!)
export const installers = pgTable("installers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const installersRelations = relations(installers, ({ one, many }) => ({
  user: one(users, { fields: [installers.userId], references: [users.id] }),
  measurements: many(measurements),
}));

export const insertInstallerSchema = createInsertSchema(installers).omit({
  id: true,
});
export type InsertInstaller = z.infer<typeof insertInstallerSchema>;
export type Installer = typeof installers.$inferSelect;

// Measurements — замеры монтажника
export const measurements = pgTable("measurements", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  installerId: varchar("installer_id")
    .notNull()
    .references(() => installers.id),
  clientName: text("client_name"),
  clientPhone: text("client_phone"),
  address: text("address"),
  latitude: decimal("latitude", { precision: 12, scale: 8 }),
  longitude: decimal("longitude", { precision: 12, scale: 8 }),
  status: text("status").default("draft"),
  comment: text("comment"),
  totalCoefficient: decimal("total_coefficient", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  orderId: varchar("order_id").references(() => orders.id),
  signatureUrl: text("signature_url"),
});

export const measurementsRelations = relations(
  measurements,
  ({ one, many }) => ({
    installer: one(installers, {
      fields: [measurements.installerId],
      references: [installers.id],
    }),
    order: one(orders, {
      fields: [measurements.orderId],
      references: [orders.id],
    }),
    sashes: many(measurementSashes),
    photos: many(measurementPhotos),
  })
);

export const insertMeasurementSchema = createInsertSchema(measurements).omit({
  id: true,
});
export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

// MeasurementSashes — створки замера
export const measurementSashes = pgTable("measurement_sashes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  measurementId: varchar("measurement_id")
    .notNull()
    .references(() => measurements.id, { onDelete: "cascade" }),
  width: decimal("width", { precision: 10, scale: 2 }),
  height: decimal("height", { precision: 10, scale: 2 }),
  systemName: text("system_name"),
  category: text("category"),
  control: text("control"),
  coefficient: decimal("coefficient", { precision: 12, scale: 2 }),
  room: integer("room"),
  roomName: text("room_name"),
  photoUrl: text("photo_url"),
});

export const measurementSashesRelations = relations(
  measurementSashes,
  ({ one }) => ({
    measurement: one(measurements, {
      fields: [measurementSashes.measurementId],
      references: [measurements.id],
    }),
  })
);

export const insertMeasurementSashSchema = createInsertSchema(
  measurementSashes
).omit({ id: true });
export type InsertMeasurementSash = z.infer<
  typeof insertMeasurementSashSchema
>;
export type MeasurementSash = typeof measurementSashes.$inferSelect;

// MeasurementPhotos — фото к замеру
export const measurementPhotos = pgTable("measurement_photos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  measurementId: varchar("measurement_id")
    .notNull()
    .references(() => measurements.id, { onDelete: "cascade" }),
  sashIndex: integer("sash_index"),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const measurementPhotosRelations = relations(
  measurementPhotos,
  ({ one }) => ({
    measurement: one(measurements, {
      fields: [measurementPhotos.measurementId],
      references: [measurements.id],
    }),
  })
);

export const insertMeasurementPhotoSchema = createInsertSchema(
  measurementPhotos
).omit({ id: true });
export type InsertMeasurementPhoto = z.infer<
  typeof insertMeasurementPhotoSchema
>;
export type MeasurementPhoto = typeof measurementPhotos.$inferSelect;

// Auth schemas for validation
export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
});

export const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
  name: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// Order statuses
export const ORDER_STATUSES = [
  "Новый",
  "В производстве",
  "Готов",
  "Отгружен",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Fabric categories
export const FABRIC_CATEGORIES = ["1", "2", "3", "4", "5", "E"] as const;
export type FabricCategory = (typeof FABRIC_CATEGORIES)[number];

// Control sides
export const CONTROL_SIDES = ["ЛР", "ПР"] as const;
export type ControlSide = (typeof CONTROL_SIDES)[number];

// Finance operation types
export const FINANCE_TYPES = [
  "income",
  "expense",
  "supplier_payment",
  "transfer",
] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];

// Direction types for expense types
export const EXPENSE_DIRECTIONS = ["expense", "income"] as const;
export type ExpenseDirection = (typeof EXPENSE_DIRECTIONS)[number];

// Audit log actions
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "status_change",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Audit log entity types
export const AUDIT_ENTITY_TYPES = [
  "order",
  "finance",
  "warehouse_receipt",
  "dealer",
  "supplier",
  "color",
  "fabric",
  "component",
  "system",
  "cashbox",
  "expense_type",
  "multiplier",
  "installer",
  "measurement",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

// Notification types
export const NOTIFICATION_TYPES = [
  "order_status",
  "low_stock",
  "overdue_order",
  "overdue_payment",
  "measurement_sent",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
