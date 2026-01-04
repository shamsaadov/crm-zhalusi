import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

let coefficientsData: CoefficientData | null = null;

/**
 * Загружает данные коэффициентов из JSON файла
 */
function loadCoefficients(): CoefficientData {
  if (coefficientsData) {
    return coefficientsData;
  }

  const dataPath = path.join(__dirname, "data", "coefficients.json");

  if (!fs.existsSync(dataPath)) {
    console.warn(
      "Файл coefficients.json не найден, используются пустые данные"
    );
    return { products: {} };
  }

  try {
    const fileContent = fs.readFileSync(dataPath, "utf-8");
    coefficientsData = JSON.parse(fileContent);
    console.log("Данные коэффициентов успешно загружены");
    return coefficientsData!;
  } catch (error) {
    console.error("Ошибка при загрузке coefficients.json:", error);
    return { products: {} };
  }
}

/**
 * Билинейная интерполяция для нахождения значения в сетке
 */
function bilinearInterpolation(
  x: number,
  y: number,
  xArr: number[],
  yArr: number[],
  values: number[][]
): number {
  // Находим индексы для интерполяции
  let x1Index = 0;
  let x2Index = xArr.length - 1;

  for (let i = 0; i < xArr.length - 1; i++) {
    if (x >= xArr[i] && x <= xArr[i + 1]) {
      x1Index = i;
      x2Index = i + 1;
      break;
    }
  }

  let y1Index = 0;
  let y2Index = yArr.length - 1;

  for (let i = 0; i < yArr.length - 1; i++) {
    if (y >= yArr[i] && y <= yArr[i + 1]) {
      y1Index = i;
      y2Index = i + 1;
      break;
    }
  }

  // Если значения на границах или вне диапазона
  if (x <= xArr[0]) x1Index = x2Index = 0;
  if (x >= xArr[xArr.length - 1]) x1Index = x2Index = xArr.length - 1;
  if (y <= yArr[0]) y1Index = y2Index = 0;
  if (y >= yArr[yArr.length - 1]) y1Index = y2Index = yArr.length - 1;

  const x1 = xArr[x1Index];
  const x2 = xArr[x2Index];
  const y1 = yArr[y1Index];
  const y2 = yArr[y2Index];

  const Q11 = values[y1Index][x1Index];
  const Q12 = values[y2Index][x1Index];
  const Q21 = values[y1Index][x2Index];
  const Q22 = values[y2Index][x2Index];

  // Если точки совпадают (на узлах сетки)
  if (x1 === x2 && y1 === y2) return Q11;
  if (x1 === x2) {
    return Q11 + ((y - y1) / (y2 - y1)) * (Q12 - Q11);
  }
  if (y1 === y2) {
    return Q11 + ((x - x1) / (x2 - x1)) * (Q21 - Q11);
  }

  // Билинейная интерполяция
  const R1 = ((x2 - x) / (x2 - x1)) * Q11 + ((x - x1) / (x2 - x1)) * Q21;
  const R2 = ((x2 - x) / (x2 - x1)) * Q12 + ((x - x1) / (x2 - x1)) * Q22;

  return ((y2 - y) / (y2 - y1)) * R1 + ((y - y1) / (y2 - y1)) * R2;
}

/**
 * Получает коэффициент для заданных параметров
 * @param systemKey - Ключ системы (например, "uni1_zebra")
 * @param category - Категория (например, "E", "1", "2", и т.д.)
 * @param width - Ширина в метрах
 * @param height - Высота в метрах
 * @returns Коэффициент или null, если данные не найдены
 */
export function getCoefficient(
  systemKey: string,
  category: string,
  width: number,
  height: number
): number | null {
  const data = loadCoefficients();

  const product = data.products[systemKey];
  if (!product) {
    console.warn(`Система "${systemKey}" не найдена в данных коэффициентов`);
    return null;
  }

  const categoryData = product.categories[category];
  if (!categoryData) {
    console.warn(
      `Категория "${category}" не найдена для системы "${systemKey}"`
    );
    return null;
  }

  const { widths, heights, values } = categoryData;

  // Проверяем, что данные корректны
  if (
    !widths ||
    !heights ||
    !values ||
    widths.length === 0 ||
    heights.length === 0
  ) {
    console.warn(
      `Некорректные данные для системы "${systemKey}", категории "${category}"`
    );
    return null;
  }

  try {
    const coefficient = bilinearInterpolation(
      width,
      height,
      widths,
      heights,
      values
    );
    return coefficient;
  } catch (error) {
    console.error("Ошибка при вычислении коэффициента:", error);
    return null;
  }
}

/**
 * Получает все доступные системы
 */
export function getAvailableSystems(): string[] {
  const data = loadCoefficients();
  return Object.keys(data.products);
}

/**
 * Получает все категории для заданной системы
 */
export function getSystemCategories(systemKey: string): string[] {
  const data = loadCoefficients();
  const product = data.products[systemKey];

  if (!product) {
    return [];
  }

  return Object.keys(product.categories);
}

/**
 * Получает диапазоны ширины и высоты для системы и категории
 */
export function getCoefficientRanges(
  systemKey: string,
  category: string
): {
  widthRange: { min: number; max: number } | null;
  heightRange: { min: number; max: number } | null;
} {
  const data = loadCoefficients();
  const product = data.products[systemKey];

  if (!product || !product.categories[category]) {
    return { widthRange: null, heightRange: null };
  }

  const { widths, heights } = product.categories[category];

  return {
    widthRange:
      widths.length > 0
        ? { min: widths[0], max: widths[widths.length - 1] }
        : null,
    heightRange:
      heights.length > 0
        ? { min: heights[0], max: heights[heights.length - 1] }
        : null,
  };
}

// Экспорт для использования в других модулях
export default {
  getCoefficient,
  getAvailableSystems,
  getSystemCategories,
  getCoefficientRanges,
};


