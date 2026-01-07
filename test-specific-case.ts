#!/usr/bin/env tsx

/**
 * Тестирование конкретного случая: 544×1443мм, система "Уни-1 зебра белый", ткань "АУРА ( цвет - 9 )"
 */

import { getCoefficientDetailed } from "./server/coefficients.js";

console.log("\n" + "=".repeat(80));
console.log("   🔍 Тестирование конкретного случая");
console.log("=".repeat(80) + "\n");

// Ваши данные
const width = 544; // мм
const height = 1443; // мм
const widthM = width / 1000; // 0.544 м
const heightM = height / 1000; // 1.443 м

console.log("📊 Исходные данные:");
console.log(`   Размер: ${width}×${height} мм (${widthM.toFixed(3)}×${heightM.toFixed(3)} м)`);
console.log(`   Система: "Уни-1 зебра белый"`);
console.log(`   Ткань: "АУРА ( цвет - 9 )"`);
console.log();

// Проверяем доступные системы
console.log("📋 Доступные системы в coefficients.json:");
console.log("   1. uni1_zebra");
console.log("   2. uni1_roll");
console.log("   3. mini_zebra");
console.log("   4. mini_roll");
console.log();

// Тестируем разные варианты systemKey
const testCases = [
  { systemKey: "uni1_zebra", category: "E", description: "Если system_key = uni1_zebra, категория E" },
  { systemKey: "uni1_zebra", category: "1", description: "Если system_key = uni1_zebra, категория 1" },
  { systemKey: "uni1_zebra", category: "2", description: "Если system_key = uni1_zebra, категория 2" },
  { systemKey: "uni1_zebra", category: "3", description: "Если system_key = uni1_zebra, категория 3" },
  { systemKey: "uni1_zebra", category: "4", description: "Если system_key = uni1_zebra, категория 4" },
  { systemKey: "uni_1_zebra", category: "E", description: "Если system_key = uni_1_zebra (с подчеркиванием)" },
  { systemKey: "uni1zebra", category: "E", description: "Если system_key = uni1zebra (без подчеркивания)" },
];

console.log("🧪 Тестирование различных вариантов:\n");

for (const testCase of testCases) {
  const result = getCoefficientDetailed(testCase.systemKey, testCase.category, widthM, heightM);
  
  if (result.coefficient) {
    console.log(`✅ ${testCase.description}`);
    console.log(`   Коэффициент из файла: ${result.coefficient.toFixed(4)}`);
    
    // Проверяем с разными множителями
    const multipliers = [1.0, 1.5, 2.0, 2.5];
    console.log(`   Цена створки при разных множителях:`);
    multipliers.forEach(mult => {
      const price = result.coefficient * mult;
      console.log(`      × ${mult.toFixed(1)} = ${price.toFixed(2)}`);
    });
    
    if (result.isFallbackCategory) {
      console.log(`   ⚠️ ВНИМАНИЕ: Использована fallback категория "${result.usedCategory}"`);
    }
    console.log();
  } else {
    console.log(`❌ ${testCase.description}`);
    console.log(`   Система не найдена`);
    console.log();
  }
}

console.log("=".repeat(80));
console.log("💡 Рекомендации:");
console.log("=".repeat(80));
console.log();
console.log("1. Проверьте в базе данных поле 'system_key' для системы 'Уни-1 зебра белый':");
console.log("   Оно должно быть точно: 'uni1_zebra'");
console.log();
console.log("2. Проверьте категорию ткани 'АУРА ( цвет - 9 )':");
console.log("   Она должна быть одной из: E, 1, 2, 3, 4");
console.log();
console.log("3. Проверьте множитель системы:");
console.log("   Цена створки = коэффициент × множитель");
console.log();
console.log("4. Откройте консоль браузера (F12) при создании заказа:");
console.log("   Там будут логи о том, какой коэффициент используется");
console.log();




