import { db } from "./db";
import {
  users, colors, fabrics, dealers, cashboxes, systems,
  expenseTypes, components, multipliers, suppliers,
  orders, financeOperations, warehouseReceipts,
} from "@shared/schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

async function seed() {
  console.log("Начинаем заполнение базы данных тестовыми данными...");

  // Create test user
  const hashedPassword = await bcrypt.hash("test123", 10);
  const [testUser] = await db.insert(users).values({
    email: "test@example.com",
    password: hashedPassword,
    name: "Тестовый пользователь",
  }).onConflictDoNothing().returning();

  let userId = testUser?.id;
  if (!userId) {
    const [existing] = await db.select().from(users).where(eq(users.email, "test@example.com"));
    userId = existing?.id;
  }
  
  if (!userId) {
    console.error("Не удалось создать или найти пользователя");
    process.exit(1);
  }

  console.log(`Пользователь создан: test@example.com / test123`);

  // Delete existing data for this user (in correct order due to foreign keys)
  await db.delete(financeOperations).where(eq(financeOperations.userId, userId));
  await db.delete(warehouseReceipts).where(eq(warehouseReceipts.userId, userId));
  await db.delete(orders).where(eq(orders.userId, userId));
  await db.delete(fabrics).where(eq(fabrics.userId, userId));
  await db.delete(systems).where(eq(systems.userId, userId));
  await db.delete(components).where(eq(components.userId, userId));
  await db.delete(colors).where(eq(colors.userId, userId));
  await db.delete(dealers).where(eq(dealers.userId, userId));
  await db.delete(cashboxes).where(eq(cashboxes.userId, userId));
  await db.delete(expenseTypes).where(eq(expenseTypes.userId, userId));
  await db.delete(multipliers).where(eq(multipliers.userId, userId));
  await db.delete(suppliers).where(eq(suppliers.userId, userId));

  // 1. COLORS
  const colorData = [
    { name: "Белый матовый", code: "WM-001", userId },
    { name: "Слоновая кость", code: "IV-002", userId },
    { name: "Антрацит", code: "AN-003", userId },
    { name: "Графит металлик", code: "GM-004", userId },
    { name: "Вишня тёмная", code: "CH-005", userId },
    { name: "Орех классический", code: "WN-006", userId },
    { name: "Серебристый", code: "SL-007", userId },
  ];
  const insertedColors = await db.insert(colors).values(colorData).returning();
  console.log(`Создано цветов: ${insertedColors.length}`);

  // 2. FABRICS
  const fabricData = [
    { name: "Verona 25 мм", category: "3", width: "2.5", material: "Полиэстер", colorId: insertedColors[1].id, userId },
    { name: "Bologna 25 мм", category: "4", width: "2.7", material: "Полиэстер с алюминием", colorId: insertedColors[2].id, userId },
    { name: "Silk Blackout 50 мм", category: "E", width: "3.0", material: "Blackout", colorId: insertedColors[3].id, userId },
    { name: "Classic White 25 мм", category: "2", width: "2.8", material: "Полиэстер", colorId: insertedColors[0].id, userId },
    { name: "Milano Premium", category: "5", width: "2.2", material: "Жаккард", colorId: insertedColors[4].id, userId },
    { name: "Royal Wood", category: "6", width: "2.0", material: "Дерево+полимер", colorId: insertedColors[5].id, userId },
  ];
  const insertedFabrics = await db.insert(fabrics).values(fabricData).returning();
  console.log(`Создано тканей: ${insertedFabrics.length}`);

  // 3. DEALERS
  const dealerData = [
    { fullName: "ИП Соловьёв П.А.", city: "Москва", phone: "+7 495 123-45-67", openingBalance: "-35000", userId },
    { fullName: 'ООО "Светлый Дом"', city: "Санкт-Петербург", phone: "+7 812 222-33-11", openingBalance: "0", userId },
    { fullName: 'Дилерская сеть "Комфорт"', city: "Нижний Новгород", phone: "+7 831 400-55-77", openingBalance: "-12500", userId },
    { fullName: 'ИП Кузнецова М.И.', city: "Казань", phone: "+7 843 555-66-88", openingBalance: "-8000", userId },
    { fullName: 'ООО "ОкнаПлюс"', city: "Екатеринбург", phone: "+7 343 777-88-99", openingBalance: "5000", userId },
  ];
  const insertedDealers = await db.insert(dealers).values(dealerData).returning();
  console.log(`Создано дилеров: ${insertedDealers.length}`);

  // 4. CASHBOXES
  const cashboxData = [
    { name: "Основная касса", openingBalance: "150000", userId },
    { name: "Безналичный расчёт", openingBalance: "230000", userId },
    { name: "Онлайн-эквайринг", openingBalance: "45000", userId },
  ];
  const insertedCashboxes = await db.insert(cashboxes).values(cashboxData).returning();
  console.log(`Создано касс: ${insertedCashboxes.length}`);

  // 5. SYSTEMS
  const systemData = [
    { name: "Isotra Venus", formula: "площадь*коэф+допы", colorId: insertedColors[0].id, userId },
    { name: "Alutech Elegance", formula: "(ширина+высота)/2*коэф", colorId: insertedColors[2].id, userId },
    { name: "Redi Shade Classic", formula: "площадь*1.2+монтаж", colorId: insertedColors[1].id, userId },
    { name: "Hunter Douglas Duette", formula: "площадь*коэф_premium", colorId: insertedColors[3].id, userId },
    { name: "Luxaflex Silhouette", formula: "ширина*высота*2.1", colorId: insertedColors[6].id, userId },
  ];
  const insertedSystems = await db.insert(systems).values(systemData).returning();
  console.log(`Создано систем: ${insertedSystems.length}`);

  // 6. EXPENSE TYPES
  const expenseTypeData = [
    { name: "Аренда производства", direction: "expense", userId },
    { name: "Зарплата сборочного цеха", direction: "expense", userId },
    { name: "Возврат по рекламации", direction: "income", userId },
    { name: "Логистика и доставка", direction: "expense", userId },
    { name: "Коммунальные услуги", direction: "expense", userId },
    { name: "Реклама и маркетинг", direction: "expense", userId },
    { name: "Закупка инструментов", direction: "expense", userId },
  ];
  const insertedExpenseTypes = await db.insert(expenseTypes).values(expenseTypeData).returning();
  console.log(`Создано статей расходов: ${insertedExpenseTypes.length}`);

  // 7. COMPONENTS
  const componentData = [
    { name: "Ламели 25 мм Verona", unit: "шт", colorId: insertedColors[1].id, userId },
    { name: "Карниз алюминиевый 50 мм", unit: "м", colorId: insertedColors[0].id, userId },
    { name: "Цепочка управления металлическая", unit: "шт", colorId: insertedColors[3].id, userId },
    { name: "Кронштейн крепления универсальный", unit: "шт", colorId: insertedColors[6].id, userId },
    { name: "Нижняя планка утяжелителя", unit: "м", colorId: insertedColors[2].id, userId },
    { name: "Механизм подъёма", unit: "шт", colorId: insertedColors[0].id, userId },
  ];
  const insertedComponents = await db.insert(components).values(componentData).returning();
  console.log(`Создано комплектующих: ${insertedComponents.length}`);

  // 8. MULTIPLIERS
  const multiplierData = [
    { name: "Оптовый коэффициент дилеров A", value: "1.35", userId },
    { name: "Премиум коэффициент", value: "1.55", userId },
    { name: "Стандартный розничный", value: "1.80", userId },
    { name: "Акционный коэффициент", value: "1.15", userId },
    { name: "VIP клиент", value: "1.25", userId },
  ];
  const insertedMultipliers = await db.insert(multipliers).values(multiplierData).returning();
  console.log(`Создано мультипликаторов: ${insertedMultipliers.length}`);

  // 9. SUPPLIERS
  const supplierData = [
    { name: 'ООО "ЛамельПром"', openingBalance: "80000", userId },
    { name: 'ТД "SunLine"', openingBalance: "120000", userId },
    { name: 'ООО "ФурнитураПлюс"', openingBalance: "-15000", userId },
    { name: 'ИП Волков С.Н.', openingBalance: "25000", userId },
  ];
  const insertedSuppliers = await db.insert(suppliers).values(supplierData).returning();
  console.log(`Создано поставщиков: ${insertedSuppliers.length}`);

  // 10. ORDERS (12 orders over last 60 days)
  const today = new Date();
  const orderData = [
    {
      orderNumber: 1001,
      date: new Date(today.getTime() - 55 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[0].id,
      systemId: insertedSystems[0].id,
      fabricId: insertedFabrics[0].id,
      colorId: insertedColors[1].id,
      width: "1800",
      height: "2100",
      sashesCount: 1,
      salePrice: "68500",
      costPrice: "41300",
      status: "issued",
      comment: "Монтаж в квартиру, 5 этаж",
      userId,
    },
    {
      orderNumber: 1002,
      date: new Date(today.getTime() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[1].id,
      systemId: insertedSystems[1].id,
      fabricId: insertedFabrics[1].id,
      colorId: insertedColors[2].id,
      width: "2400",
      height: "1800",
      sashesCount: 2,
      salePrice: "125000",
      costPrice: "78500",
      status: "issued",
      comment: "Офисное здание, 2 окна",
      userId,
    },
    {
      orderNumber: 1003,
      date: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[2].id,
      systemId: insertedSystems[2].id,
      fabricId: insertedFabrics[2].id,
      colorId: insertedColors[3].id,
      width: "1500",
      height: "2200",
      sashesCount: 1,
      salePrice: "89000",
      costPrice: "52000",
      status: "issued",
      comment: "Blackout для спальни",
      userId,
    },
    {
      orderNumber: 1004,
      date: new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[0].id,
      systemId: insertedSystems[3].id,
      fabricId: insertedFabrics[3].id,
      colorId: insertedColors[0].id,
      width: "3000",
      height: "2500",
      sashesCount: 3,
      salePrice: "185000",
      costPrice: "115000",
      status: "issued",
      comment: "Панорамное окно, сложный монтаж на высоте",
      userId,
    },
    {
      orderNumber: 1005,
      date: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[1].id,
      systemId: insertedSystems[0].id,
      fabricId: insertedFabrics[0].id,
      colorId: insertedColors[1].id,
      width: "1200",
      height: "1600",
      sashesCount: 1,
      salePrice: "42000",
      costPrice: "25500",
      status: "ready",
      comment: "Стандартный заказ, готов к выдаче",
      userId,
    },
    {
      orderNumber: 1006,
      date: new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[3].id,
      systemId: insertedSystems[1].id,
      fabricId: insertedFabrics[4].id,
      colorId: insertedColors[4].id,
      width: "2000",
      height: "1900",
      sashesCount: 2,
      salePrice: "98000",
      costPrice: "61000",
      status: "ready",
      comment: "Премиум ткань Milano",
      userId,
    },
    {
      orderNumber: 1007,
      date: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[4].id,
      systemId: insertedSystems[4].id,
      fabricId: insertedFabrics[5].id,
      colorId: insertedColors[5].id,
      width: "1600",
      height: "2000",
      sashesCount: 1,
      salePrice: "156000",
      costPrice: "98000",
      status: "ready",
      comment: "Люксовая система Silhouette",
      userId,
    },
    {
      orderNumber: 1008,
      date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[0].id,
      systemId: insertedSystems[0].id,
      fabricId: insertedFabrics[0].id,
      colorId: insertedColors[0].id,
      width: "1400",
      height: "1800",
      sashesCount: 1,
      salePrice: "52000",
      costPrice: "31000",
      status: "in_production",
      comment: "Срочный заказ",
      userId,
    },
    {
      orderNumber: 1009,
      date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[2].id,
      systemId: insertedSystems[2].id,
      fabricId: insertedFabrics[2].id,
      colorId: insertedColors[3].id,
      width: "2200",
      height: "2400",
      sashesCount: 2,
      salePrice: "134000",
      costPrice: "82000",
      status: "in_production",
      comment: "Двойной blackout для гостиной",
      userId,
    },
    {
      orderNumber: 1010,
      date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[1].id,
      systemId: insertedSystems[1].id,
      fabricId: insertedFabrics[1].id,
      colorId: insertedColors[2].id,
      width: "1800",
      height: "2000",
      sashesCount: 1,
      salePrice: "76000",
      costPrice: "45500",
      status: "in_production",
      comment: "Антрацит для кабинета",
      userId,
    },
    {
      orderNumber: 1011,
      date: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dealerId: insertedDealers[3].id,
      systemId: insertedSystems[3].id,
      fabricId: insertedFabrics[3].id,
      colorId: insertedColors[0].id,
      width: "1000",
      height: "1200",
      sashesCount: 1,
      salePrice: "38000",
      costPrice: "22000",
      status: "new",
      comment: "Маленькое окно на кухню",
      userId,
    },
    {
      orderNumber: 1012,
      date: today.toISOString().split('T')[0],
      dealerId: insertedDealers[4].id,
      systemId: insertedSystems[0].id,
      fabricId: insertedFabrics[0].id,
      colorId: insertedColors[1].id,
      width: "2600",
      height: "2200",
      sashesCount: 2,
      salePrice: "112000",
      costPrice: "68000",
      status: "new",
      comment: "Новый заказ, ждём подтверждения замеров",
      userId,
    },
  ];
  const insertedOrders = await db.insert(orders).values(orderData).returning();
  console.log(`Создано заказов: ${insertedOrders.length}`);

  // 11. WAREHOUSE RECEIPTS
  const warehouseData = [
    {
      date: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[1].id,
      type: "fabric" as const,
      fabricId: insertedFabrics[2].id,
      quantity: "120",
      price: "1150",
      total: "138000",
      userId,
    },
    {
      date: new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[2].id,
      type: "component" as const,
      componentId: insertedComponents[2].id,
      quantity: "300",
      price: "180",
      total: "54000",
      userId,
    },
    {
      date: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[0].id,
      type: "component" as const,
      componentId: insertedComponents[1].id,
      quantity: "500",
      price: "320",
      total: "160000",
      userId,
    },
    {
      date: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[0].id,
      type: "component" as const,
      componentId: insertedComponents[0].id,
      quantity: "1000",
      price: "85",
      total: "85000",
      userId,
    },
    {
      date: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[1].id,
      type: "fabric" as const,
      fabricId: insertedFabrics[0].id,
      quantity: "200",
      price: "780",
      total: "156000",
      userId,
    },
    {
      date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      supplierId: insertedSuppliers[3].id,
      type: "component" as const,
      componentId: insertedComponents[5].id,
      quantity: "150",
      price: "450",
      total: "67500",
      userId,
    },
  ];
  const insertedReceipts = await db.insert(warehouseReceipts).values(warehouseData).returning();
  console.log(`Создано складских поступлений: ${insertedReceipts.length}`);

  // 12. FINANCE OPERATIONS
  const financeData = [
    // INCOME - payments from dealers
    {
      date: new Date(today.getTime() - 48 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "68500",
      dealerId: insertedDealers[0].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Оплата заказа 1001",
      userId,
    },
    {
      date: new Date(today.getTime() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "125000",
      dealerId: insertedDealers[1].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Оплата заказа 1002",
      userId,
    },
    {
      date: new Date(today.getTime() - 38 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "50000",
      dealerId: insertedDealers[2].id,
      cashboxId: insertedCashboxes[0].id,
      comment: "Частичная оплата заказа 1003",
      userId,
    },
    {
      date: new Date(today.getTime() - 32 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "100000",
      dealerId: insertedDealers[0].id,
      cashboxId: insertedCashboxes[0].id,
      comment: "Частичная оплата заказа 1004",
      userId,
    },
    {
      date: new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "42000",
      dealerId: insertedDealers[1].id,
      cashboxId: insertedCashboxes[2].id,
      comment: "Предоплата заказа 1005",
      userId,
    },
    {
      date: new Date(today.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "income" as const,
      amount: "60000",
      dealerId: insertedDealers[3].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Частичная оплата заказа 1006",
      userId,
    },

    // EXPENSES
    {
      date: new Date(today.getTime() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "150000",
      cashboxId: insertedCashboxes[1].id,
      expenseTypeId: insertedExpenseTypes[0].id,
      comment: "Аренда производства за месяц",
      userId,
    },
    {
      date: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "280000",
      cashboxId: insertedCashboxes[1].id,
      expenseTypeId: insertedExpenseTypes[1].id,
      comment: "Зарплата сборочного цеха",
      userId,
    },
    {
      date: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "32000",
      cashboxId: insertedCashboxes[0].id,
      expenseTypeId: insertedExpenseTypes[6].id,
      comment: "Закупка инструментов для цеха",
      userId,
    },
    {
      date: new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "45000",
      cashboxId: insertedCashboxes[1].id,
      expenseTypeId: insertedExpenseTypes[3].id,
      comment: "Доставка по Москве и области",
      userId,
    },
    {
      date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "18000",
      cashboxId: insertedCashboxes[1].id,
      expenseTypeId: insertedExpenseTypes[4].id,
      comment: "Коммунальные услуги производства",
      userId,
    },
    {
      date: new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "expense" as const,
      amount: "75000",
      cashboxId: insertedCashboxes[1].id,
      expenseTypeId: insertedExpenseTypes[5].id,
      comment: "Реклама в Яндекс Директ",
      userId,
    },

    // SUPPLIER PAYMENTS
    {
      date: new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "supplier_payment" as const,
      amount: "70000",
      supplierId: insertedSuppliers[0].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Частичная оплата поставки карнизов",
      userId,
    },
    {
      date: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "supplier_payment" as const,
      amount: "100000",
      supplierId: insertedSuppliers[1].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Оплата поставки тканей",
      userId,
    },
    {
      date: new Date(today.getTime() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "supplier_payment" as const,
      amount: "55000",
      supplierId: insertedSuppliers[2].id,
      cashboxId: insertedCashboxes[0].id,
      comment: "Оплата фурнитуры",
      userId,
    },
    {
      date: new Date(today.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "supplier_payment" as const,
      amount: "80000",
      supplierId: insertedSuppliers[0].id,
      cashboxId: insertedCashboxes[1].id,
      comment: "Погашение задолженности за ламели",
      userId,
    },
    {
      date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "supplier_payment" as const,
      amount: "40000",
      supplierId: insertedSuppliers[3].id,
      cashboxId: insertedCashboxes[0].id,
      comment: "Оплата механизмов подъёма",
      userId,
    },

    // TRANSFERS between cashboxes
    {
      date: new Date(today.getTime() - 38 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "transfer" as const,
      amount: "20000",
      fromCashboxId: insertedCashboxes[0].id,
      toCashboxId: insertedCashboxes[2].id,
      comment: "Пополнение онлайн-эквайринга",
      userId,
    },
    {
      date: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "transfer" as const,
      amount: "35000",
      fromCashboxId: insertedCashboxes[2].id,
      toCashboxId: insertedCashboxes[1].id,
      comment: "Перевод с эквайринга на расчётный счёт",
      userId,
    },
    {
      date: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: "transfer" as const,
      amount: "50000",
      fromCashboxId: insertedCashboxes[1].id,
      toCashboxId: insertedCashboxes[0].id,
      comment: "Снятие наличных для расчётов",
      userId,
    },
  ];
  const insertedFinance = await db.insert(financeOperations).values(financeData).returning();
  console.log(`Создано финансовых операций: ${insertedFinance.length}`);

  console.log("\n========================================");
  console.log("База данных успешно заполнена тестовыми данными!");
  console.log("========================================");
  console.log("\nДанные для входа:");
  console.log("  Email: test@example.com");
  console.log("  Пароль: test123");
  console.log("\nСоздано:");
  console.log(`  - ${insertedColors.length} цветов`);
  console.log(`  - ${insertedFabrics.length} тканей`);
  console.log(`  - ${insertedDealers.length} дилеров`);
  console.log(`  - ${insertedCashboxes.length} касс`);
  console.log(`  - ${insertedSystems.length} систем`);
  console.log(`  - ${insertedExpenseTypes.length} статей расходов`);
  console.log(`  - ${insertedComponents.length} комплектующих`);
  console.log(`  - ${insertedMultipliers.length} мультипликаторов`);
  console.log(`  - ${insertedSuppliers.length} поставщиков`);
  console.log(`  - ${insertedOrders.length} заказов`);
  console.log(`  - ${insertedReceipts.length} складских поступлений`);
  console.log(`  - ${insertedFinance.length} финансовых операций`);
  
  process.exit(0);
}

seed().catch((err) => {
  console.error("Ошибка при заполнении базы данных:", err);
  process.exit(1);
});
