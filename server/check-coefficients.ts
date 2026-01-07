#!/usr/bin/env tsx

/**
 * Утилита для проверки доступных систем и категорий в файле coefficients.json
 * 
 * Использование:
 *   npx tsx server/check-coefficients.ts [system_key]
 * 
 * Примеры:
 *   npx tsx server/check-coefficients.ts              # показать все системы
 *   npx tsx server/check-coefficients.ts uni1_zebra   # показать категории для uni1_zebra
 */

import coefficientsData from "./data/coefficients.json";

interface CoefficientData {
  products: {
    [productKey: string]: {
      categories: {
        [category: string]: {
          widths: number[];
          heights: number[];
          values: number[][];
        };
      };
    };
  };
}

const data = coefficientsData as CoefficientData;

function formatTable(headers: string[], rows: string[][]) {
  const columnWidths = headers.map((header, i) => 
    Math.max(header.length, ...rows.map(row => row[i]?.length || 0))
  );

  const separator = columnWidths.map(w => "─".repeat(w + 2)).join("┼");
  const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(" │ ");
  const dataRows = rows.map(row => 
    row.map((cell, i) => cell.padEnd(columnWidths[i])).join(" │ ")
  );

  console.log("┌" + separator.replace(/┼/g, "┬") + "┐");
  console.log("│ " + headerRow + " │");
  console.log("├" + separator + "┤");
  dataRows.forEach(row => console.log("│ " + row + " │"));
  console.log("└" + separator.replace(/┼/g, "┴") + "┘");
}

function getAllSystems() {
  const systemKeys = Object.keys(data.products);
  
  console.log("\n📊 Доступные системы в coefficients.json\n");
  console.log(`Всего систем: ${systemKeys.length}\n`);

  const rows = systemKeys.map((key, index) => {
    const categoriesCount = Object.keys(data.products[key].categories).length;
    return [
      (index + 1).toString(),
      key,
      categoriesCount.toString()
    ];
  });

  formatTable(["№", "System Key", "Категорий"], rows);

  console.log("\n💡 Для просмотра категорий конкретной системы:");
  console.log("   npx tsx server/check-coefficients.ts <system_key>");
  console.log("\n   Например: npx tsx server/check-coefficients.ts uni1_zebra\n");
}

function getSystemCategories(systemKey: string) {
  const system = data.products[systemKey];

  if (!system) {
    console.error(`\n❌ Система "${systemKey}" не найдена в coefficients.json\n`);
    console.log("💡 Доступные системы:");
    Object.keys(data.products).forEach(key => console.log(`   - ${key}`));
    console.log();
    process.exit(1);
  }

  const categories = Object.keys(system.categories);
  
  console.log(`\n📊 Категории для системы "${systemKey}"\n`);
  console.log(`Всего категорий: ${categories.length}\n`);

  const rows = categories.map((cat, index) => {
    const catData = system.categories[cat];
    const widthRange = `${catData.widths[0]}м - ${catData.widths[catData.widths.length - 1]}м`;
    const heightRange = `${catData.heights[0]}м - ${catData.heights[catData.heights.length - 1]}м`;
    
    return [
      (index + 1).toString(),
      cat,
      widthRange,
      heightRange,
      `${catData.widths.length}`,
      `${catData.heights.length}`
    ];
  });

  formatTable(
    ["№", "Категория", "Диапазон ширины", "Диапазон высоты", "Точек ширины", "Точек высоты"],
    rows
  );

  console.log("\n✅ Настройка системы:");
  console.log(`   1. В разделе "Справочники → Системы" установите:`);
  console.log(`      System Key = "${systemKey}"`);
  console.log(`\n✅ Настройка тканей:`);
  console.log(`   2. В разделе "Справочники → Ткани" используйте одну из категорий:`);
  categories.forEach(cat => console.log(`      - "${cat}"`));
  console.log();
}

function main() {
  const args = process.argv.slice(2);
  const systemKey = args[0];

  console.log("\n" + "=".repeat(80));
  console.log("   🔍 Проверка коэффициентов");
  console.log("=".repeat(80));

  if (!systemKey) {
    getAllSystems();
  } else {
    getSystemCategories(systemKey);
  }
}

main();




