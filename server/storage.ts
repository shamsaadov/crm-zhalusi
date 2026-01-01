import { eq, and, sql, gte, lte, desc, sum } from "drizzle-orm";
import { db } from "./db";
import {
  users, colors, fabrics, dealers, cashboxes, systems,
  expenseTypes, components, multipliers, suppliers,
  orders, financeOperations, warehouseReceipts,
  type User, type InsertUser,
  type Color, type InsertColor,
  type Fabric, type InsertFabric,
  type Dealer, type InsertDealer,
  type Cashbox, type InsertCashbox,
  type System, type InsertSystem,
  type ExpenseType, type InsertExpenseType,
  type Component, type InsertComponent,
  type Multiplier, type InsertMultiplier,
  type Supplier, type InsertSupplier,
  type Order, type InsertOrder,
  type FinanceOperation, type InsertFinanceOperation,
  type WarehouseReceipt, type InsertWarehouseReceipt,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Colors
  getColors(userId: string): Promise<Color[]>;
  createColor(color: InsertColor): Promise<Color>;
  updateColor(id: string, color: Partial<InsertColor>): Promise<Color | undefined>;
  deleteColor(id: string): Promise<void>;

  // Fabrics
  getFabrics(userId: string): Promise<Fabric[]>;
  createFabric(fabric: InsertFabric): Promise<Fabric>;
  updateFabric(id: string, fabric: Partial<InsertFabric>): Promise<Fabric | undefined>;
  deleteFabric(id: string): Promise<void>;

  // Dealers
  getDealers(userId: string): Promise<(Dealer & { balance: number })[]>;
  createDealer(dealer: InsertDealer): Promise<Dealer>;
  updateDealer(id: string, dealer: Partial<InsertDealer>): Promise<Dealer | undefined>;
  deleteDealer(id: string): Promise<void>;

  // Cashboxes
  getCashboxes(userId: string): Promise<(Cashbox & { balance: number })[]>;
  createCashbox(cashbox: InsertCashbox): Promise<Cashbox>;
  updateCashbox(id: string, cashbox: Partial<InsertCashbox>): Promise<Cashbox | undefined>;
  deleteCashbox(id: string): Promise<void>;

  // Systems
  getSystems(userId: string): Promise<System[]>;
  createSystem(system: InsertSystem): Promise<System>;
  updateSystem(id: string, system: Partial<InsertSystem>): Promise<System | undefined>;
  deleteSystem(id: string): Promise<void>;

  // Expense Types
  getExpenseTypes(userId: string): Promise<ExpenseType[]>;
  createExpenseType(expenseType: InsertExpenseType): Promise<ExpenseType>;
  updateExpenseType(id: string, expenseType: Partial<InsertExpenseType>): Promise<ExpenseType | undefined>;
  deleteExpenseType(id: string): Promise<void>;

  // Components
  getComponents(userId: string): Promise<Component[]>;
  createComponent(component: InsertComponent): Promise<Component>;
  updateComponent(id: string, component: Partial<InsertComponent>): Promise<Component | undefined>;
  deleteComponent(id: string): Promise<void>;

  // Multipliers
  getMultipliers(userId: string): Promise<Multiplier[]>;
  createMultiplier(multiplier: InsertMultiplier): Promise<Multiplier>;
  updateMultiplier(id: string, multiplier: Partial<InsertMultiplier>): Promise<Multiplier | undefined>;
  deleteMultiplier(id: string): Promise<void>;

  // Suppliers
  getSuppliers(userId: string): Promise<(Supplier & { balance: number })[]>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: string): Promise<void>;

  // Orders
  getOrders(userId: string): Promise<Order[]>;
  getNextOrderNumber(userId: string): Promise<number>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, order: Partial<InsertOrder>): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<void>;

  // Finance Operations
  getFinanceOperations(userId: string): Promise<FinanceOperation[]>;
  createFinanceOperation(operation: InsertFinanceOperation): Promise<FinanceOperation>;
  deleteFinanceOperation(id: string): Promise<void>;

  // Warehouse
  getWarehouseReceipts(userId: string): Promise<WarehouseReceipt[]>;
  createWarehouseReceipt(receipt: InsertWarehouseReceipt): Promise<WarehouseReceipt>;
  deleteWarehouseReceipt(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Colors
  async getColors(userId: string): Promise<Color[]> {
    return db.select().from(colors).where(eq(colors.userId, userId));
  }

  async createColor(color: InsertColor): Promise<Color> {
    const [created] = await db.insert(colors).values(color).returning();
    return created;
  }

  async updateColor(id: string, color: Partial<InsertColor>): Promise<Color | undefined> {
    const [updated] = await db.update(colors).set(color).where(eq(colors.id, id)).returning();
    return updated;
  }

  async deleteColor(id: string): Promise<void> {
    await db.delete(colors).where(eq(colors.id, id));
  }

  // Fabrics
  async getFabrics(userId: string): Promise<Fabric[]> {
    return db.select().from(fabrics).where(eq(fabrics.userId, userId));
  }

  async createFabric(fabric: InsertFabric): Promise<Fabric> {
    const [created] = await db.insert(fabrics).values(fabric).returning();
    return created;
  }

  async updateFabric(id: string, fabric: Partial<InsertFabric>): Promise<Fabric | undefined> {
    const [updated] = await db.update(fabrics).set(fabric).where(eq(fabrics.id, id)).returning();
    return updated;
  }

  async deleteFabric(id: string): Promise<void> {
    await db.delete(fabrics).where(eq(fabrics.id, id));
  }

  // Dealers with balance calculation
  async getDealers(userId: string): Promise<(Dealer & { balance: number })[]> {
    const dealerList = await db.select().from(dealers).where(eq(dealers.userId, userId));
    
    const result = await Promise.all(dealerList.map(async (dealer) => {
      // Opening balance + orders sale price - payments received from dealer
      const orderTotals = await db
        .select({ total: sum(orders.salePrice) })
        .from(orders)
        .where(and(eq(orders.dealerId, dealer.id), eq(orders.userId, userId)));
      
      const payments = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(and(eq(financeOperations.dealerId, dealer.id), eq(financeOperations.type, "income")));
      
      const orderTotal = parseFloat(orderTotals[0]?.total?.toString() || "0");
      const paymentTotal = parseFloat(payments[0]?.total?.toString() || "0");
      const opening = parseFloat(dealer.openingBalance?.toString() || "0");
      
      // Balance = opening + orders - payments (negative means dealer owes us)
      const balance = opening + orderTotal - paymentTotal;
      
      return { ...dealer, balance: -balance }; // Negative because if they owe us, it's positive debt
    }));
    
    return result;
  }

  async createDealer(dealer: InsertDealer): Promise<Dealer> {
    const [created] = await db.insert(dealers).values(dealer).returning();
    return created;
  }

  async updateDealer(id: string, dealer: Partial<InsertDealer>): Promise<Dealer | undefined> {
    const [updated] = await db.update(dealers).set(dealer).where(eq(dealers.id, id)).returning();
    return updated;
  }

  async deleteDealer(id: string): Promise<void> {
    await db.delete(dealers).where(eq(dealers.id, id));
  }

  // Cashboxes with balance calculation
  async getCashboxes(userId: string): Promise<(Cashbox & { balance: number })[]> {
    const cashboxList = await db.select().from(cashboxes).where(eq(cashboxes.userId, userId));
    
    const result = await Promise.all(cashboxList.map(async (cashbox) => {
      const incomes = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(and(eq(financeOperations.cashboxId, cashbox.id), eq(financeOperations.type, "income")));
      
      const expenses = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(and(eq(financeOperations.cashboxId, cashbox.id), eq(financeOperations.type, "expense")));
      
      const supplierPayments = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(and(eq(financeOperations.cashboxId, cashbox.id), eq(financeOperations.type, "supplier_payment")));
      
      const transfersOut = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(eq(financeOperations.fromCashboxId, cashbox.id));
      
      const transfersIn = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(eq(financeOperations.toCashboxId, cashbox.id));
      
      const opening = parseFloat(cashbox.openingBalance?.toString() || "0");
      const income = parseFloat(incomes[0]?.total?.toString() || "0");
      const expense = parseFloat(expenses[0]?.total?.toString() || "0");
      const supplier = parseFloat(supplierPayments[0]?.total?.toString() || "0");
      const outTransfer = parseFloat(transfersOut[0]?.total?.toString() || "0");
      const inTransfer = parseFloat(transfersIn[0]?.total?.toString() || "0");
      
      const balance = opening + income - expense - supplier - outTransfer + inTransfer;
      
      return { ...cashbox, balance };
    }));
    
    return result;
  }

  async createCashbox(cashbox: InsertCashbox): Promise<Cashbox> {
    const [created] = await db.insert(cashboxes).values(cashbox).returning();
    return created;
  }

  async updateCashbox(id: string, cashbox: Partial<InsertCashbox>): Promise<Cashbox | undefined> {
    const [updated] = await db.update(cashboxes).set(cashbox).where(eq(cashboxes.id, id)).returning();
    return updated;
  }

  async deleteCashbox(id: string): Promise<void> {
    await db.delete(cashboxes).where(eq(cashboxes.id, id));
  }

  // Systems
  async getSystems(userId: string): Promise<System[]> {
    return db.select().from(systems).where(eq(systems.userId, userId));
  }

  async createSystem(system: InsertSystem): Promise<System> {
    const [created] = await db.insert(systems).values(system).returning();
    return created;
  }

  async updateSystem(id: string, system: Partial<InsertSystem>): Promise<System | undefined> {
    const [updated] = await db.update(systems).set(system).where(eq(systems.id, id)).returning();
    return updated;
  }

  async deleteSystem(id: string): Promise<void> {
    await db.delete(systems).where(eq(systems.id, id));
  }

  // Expense Types
  async getExpenseTypes(userId: string): Promise<ExpenseType[]> {
    return db.select().from(expenseTypes).where(eq(expenseTypes.userId, userId));
  }

  async createExpenseType(expenseType: InsertExpenseType): Promise<ExpenseType> {
    const [created] = await db.insert(expenseTypes).values(expenseType).returning();
    return created;
  }

  async updateExpenseType(id: string, expenseType: Partial<InsertExpenseType>): Promise<ExpenseType | undefined> {
    const [updated] = await db.update(expenseTypes).set(expenseType).where(eq(expenseTypes.id, id)).returning();
    return updated;
  }

  async deleteExpenseType(id: string): Promise<void> {
    await db.delete(expenseTypes).where(eq(expenseTypes.id, id));
  }

  // Components
  async getComponents(userId: string): Promise<Component[]> {
    return db.select().from(components).where(eq(components.userId, userId));
  }

  async createComponent(component: InsertComponent): Promise<Component> {
    const [created] = await db.insert(components).values(component).returning();
    return created;
  }

  async updateComponent(id: string, component: Partial<InsertComponent>): Promise<Component | undefined> {
    const [updated] = await db.update(components).set(component).where(eq(components.id, id)).returning();
    return updated;
  }

  async deleteComponent(id: string): Promise<void> {
    await db.delete(components).where(eq(components.id, id));
  }

  // Multipliers
  async getMultipliers(userId: string): Promise<Multiplier[]> {
    return db.select().from(multipliers).where(eq(multipliers.userId, userId));
  }

  async createMultiplier(multiplier: InsertMultiplier): Promise<Multiplier> {
    const [created] = await db.insert(multipliers).values(multiplier).returning();
    return created;
  }

  async updateMultiplier(id: string, multiplier: Partial<InsertMultiplier>): Promise<Multiplier | undefined> {
    const [updated] = await db.update(multipliers).set(multiplier).where(eq(multipliers.id, id)).returning();
    return updated;
  }

  async deleteMultiplier(id: string): Promise<void> {
    await db.delete(multipliers).where(eq(multipliers.id, id));
  }

  // Suppliers with balance calculation
  async getSuppliers(userId: string): Promise<(Supplier & { balance: number })[]> {
    const supplierList = await db.select().from(suppliers).where(eq(suppliers.userId, userId));
    
    const result = await Promise.all(supplierList.map(async (supplier) => {
      const receipts = await db
        .select({ total: sum(warehouseReceipts.total) })
        .from(warehouseReceipts)
        .where(eq(warehouseReceipts.supplierId, supplier.id));
      
      const payments = await db
        .select({ total: sum(financeOperations.amount) })
        .from(financeOperations)
        .where(and(eq(financeOperations.supplierId, supplier.id), eq(financeOperations.type, "supplier_payment")));
      
      const opening = parseFloat(supplier.openingBalance?.toString() || "0");
      const receiptTotal = parseFloat(receipts[0]?.total?.toString() || "0");
      const paymentTotal = parseFloat(payments[0]?.total?.toString() || "0");
      
      // Balance = opening + receipts - payments (positive means we owe them)
      const balance = opening + receiptTotal - paymentTotal;
      
      return { ...supplier, balance };
    }));
    
    return result;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(supplier).returning();
    return created;
  }

  async updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db.update(suppliers).set(supplier).where(eq(suppliers.id, id)).returning();
    return updated;
  }

  async deleteSupplier(id: string): Promise<void> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
  }

  // Orders
  async getOrders(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.date));
  }

  async getNextOrderNumber(userId: string): Promise<number> {
    const result = await db
      .select({ maxNum: sql<number>`COALESCE(MAX(${orders.orderNumber}), 0)` })
      .from(orders)
      .where(eq(orders.userId, userId));
    return (result[0]?.maxNum || 0) + 1;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrder(id: string, order: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set(order).where(eq(orders.id, id)).returning();
    return updated;
  }

  async deleteOrder(id: string): Promise<void> {
    await db.delete(orders).where(eq(orders.id, id));
  }

  // Finance Operations
  async getFinanceOperations(userId: string): Promise<FinanceOperation[]> {
    return db.select().from(financeOperations).where(eq(financeOperations.userId, userId)).orderBy(desc(financeOperations.date));
  }

  async createFinanceOperation(operation: InsertFinanceOperation): Promise<FinanceOperation> {
    const [created] = await db.insert(financeOperations).values(operation).returning();
    return created;
  }

  async deleteFinanceOperation(id: string): Promise<void> {
    await db.delete(financeOperations).where(eq(financeOperations.id, id));
  }

  // Warehouse
  async getWarehouseReceipts(userId: string): Promise<WarehouseReceipt[]> {
    return db.select().from(warehouseReceipts).where(eq(warehouseReceipts.userId, userId)).orderBy(desc(warehouseReceipts.date));
  }

  async createWarehouseReceipt(receipt: InsertWarehouseReceipt): Promise<WarehouseReceipt> {
    const [created] = await db.insert(warehouseReceipts).values(receipt).returning();
    return created;
  }

  async deleteWarehouseReceipt(id: string): Promise<void> {
    await db.delete(warehouseReceipts).where(eq(warehouseReceipts.id, id));
  }
}

export const storage = new DatabaseStorage();
