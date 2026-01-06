#!/usr/bin/env tsx

/**
 * Тестирование логики поиска коэффициентов с fallback
 */

import { getCoefficient, getCoefficientDetailed, getSystemCategories } from "./coefficients.js";

console.log("\n" + "=".repeat(80));
console.log("   🧪 Тестирование логики коэффициентов");
console.log("=".repeat(80) + "\n");

// Тест 1: Точное совпадение
console.log("📝 Тест 1: Точное совпадение");
console.log("   systemKey: uni1_zebra, category: E, size: 1.5×2.0м");
const result1 = getCoefficientDetailed("uni1_zebra", "E", 1.5, 2.0);
console.log(`   ✅ Результат: coefficient=${result1.coefficient?.toFixed(4)}, fallback=${result1.isFallbackCategory}`);
console.log();

// Тест 2: Категория в другом регистре
console.log("📝 Тест 2: Категория в другом регистре");
console.log("   systemKey: uni1_zebra, category: e (lowercase), size: 1.5×2.0м");
const result2 = getCoefficientDetailed("uni1_zebra", "e", 1.5, 2.0);
console.log(`   ✅ Результат: coefficient=${result2.coefficient?.toFixed(4)}, usedCategory="${result2.usedCategory}", fallback=${result2.isFallbackCategory}`);
console.log();

// Тест 3: Несуществующая категория (fallback)
console.log("📝 Тест 3: Несуществующая категория (fallback)");
console.log("   systemKey: uni1_zebra, category: XYZ, size: 1.5×2.0м");
const result3 = getCoefficientDetailed("uni1_zebra", "XYZ", 1.5, 2.0);
console.log(`   ⚠️ Результат: coefficient=${result3.coefficient?.toFixed(4)}, usedCategory="${result3.usedCategory}", fallback=${result3.isFallbackCategory}`);
console.log();

// Тест 4: Несуществующая система
console.log("📝 Тест 4: Несуществующая система");
console.log("   systemKey: unknown_system, category: E, size: 1.5×2.0м");
const result4 = getCoefficientDetailed("unknown_system", "E", 1.5, 2.0);
console.log(`   ❌ Результат: coefficient=${result4.coefficient}, usedSystemKey=${result4.usedSystemKey}`);
console.log();

// Тест 5: SystemKey с другим регистром
console.log("📝 Тест 5: SystemKey с другим регистром");
console.log("   systemKey: UNI1_ZEBRA (uppercase), category: E, size: 1.5×2.0м");
const result5 = getCoefficientDetailed("UNI1_ZEBRA", "E", 1.5, 2.0);
console.log(`   ✅ Результат: coefficient=${result5.coefficient?.toFixed(4)}, usedSystemKey="${result5.usedSystemKey}", fallback=${result5.isFallbackCategory}`);
console.log();

// Тест 6: Интерполяция размеров
console.log("📝 Тест 6: Интерполяция размеров (промежуточные значения)");
console.log("   systemKey: uni1_zebra, category: 1, size: 1.37×1.83м");
const result6 = getCoefficientDetailed("uni1_zebra", "1", 1.37, 1.83);
console.log(`   ✅ Результат: coefficient=${result6.coefficient?.toFixed(4)} (интерполированное значение)`);
console.log();

// Информация о доступных категориях
console.log("📊 Доступные категории для uni1_zebra:");
const categories = getSystemCategories("uni1_zebra");
console.log(`   ${categories.join(", ")}`);
console.log();

console.log("=".repeat(80));
console.log("   ✅ Тестирование завершено");
console.log("=".repeat(80) + "\n");

