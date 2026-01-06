// Импортируем JSON напрямую - esbuild заинлайнит его в бандл
import coefficientsJsonData from "./data/coefficients.json";

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

// Данные уже загружены при импорте
const coefficientsData: CoefficientData =
  coefficientsJsonData as CoefficientData;

/**
 * Возвращает данные коэффициентов (уже загружены при старте)
 */
function loadCoefficients(): CoefficientData {
  return coefficientsData;
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
 * Нормализует строку для сравнения (убирает пробелы, приводит к нижнему регистру)
 */
function normalizeString(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Ищет ключ системы с учетом различных вариантов написания
 */
function findSystemKey(data: CoefficientData, systemKey: string): string | null {
  // 1. Точное совпадение
  if (data.products[systemKey]) {
    return systemKey;
  }

  // 2. Поиск без учета регистра и пробелов
  const normalizedSearch = normalizeString(systemKey);
  const foundKey = Object.keys(data.products).find(
    key => normalizeString(key) === normalizedSearch
  );

  if (foundKey) {
    console.log(`[Coefficients] Найдена система "${foundKey}" вместо "${systemKey}"`);
    return foundKey;
  }

  return null;
}

/**
 * Ищет категорию с учетом различных вариантов написания
 */
function findCategory(
  categories: Record<string, any>,
  category: string
): string | null {
  // 1. Точное совпадение
  if (categories[category]) {
    return category;
  }

  // 2. Поиск без учета регистра
  const lowerCategory = category.toLowerCase();
  let foundKey = Object.keys(categories).find(
    key => key.toLowerCase() === lowerCategory
  );
  
  if (foundKey) {
    console.log(`[Coefficients] Найдена категория "${foundKey}" вместо "${category}" (без учета регистра)`);
    return foundKey;
  }

  // 3. Поиск без пробелов
  const normalizedSearch = normalizeString(category);
  foundKey = Object.keys(categories).find(
    key => normalizeString(key) === normalizedSearch
  );

  if (foundKey) {
    console.log(`[Coefficients] Найдена категория "${foundKey}" вместо "${category}" (нормализация)`);
    return foundKey;
  }

  // 4. Fallback: берем первую доступную категорию
  const availableCategories = Object.keys(categories);
  if (availableCategories.length > 0) {
    const fallbackCategory = availableCategories[0];
    console.warn(
      `[Coefficients] Категория "${category}" не найдена. Используется fallback: "${fallbackCategory}". ` +
      `Доступные категории: ${availableCategories.join(', ')}`
    );
    return fallbackCategory;
  }

  return null;
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
): number | null;

/**
 * Получает коэффициент для заданных параметров с детальной информацией
 * @param systemKey - Ключ системы (например, "uni1_zebra")
 * @param category - Категория (например, "E", "1", "2", и т.д.)
 * @param width - Ширина в метрах
 * @param height - Высота в метрах
 * @returns Объект с коэффициентом и информацией о поиске
 */
export function getCoefficientDetailed(
  systemKey: string,
  category: string,
  width: number,
  height: number
): {
  coefficient: number | null;
  usedSystemKey: string | null;
  usedCategory: string | null;
  isFallbackCategory: boolean;
} {
  const data = loadCoefficients();

  // Ищем систему с учетом различных вариантов написания
  const foundSystemKey = findSystemKey(data, systemKey);
  if (!foundSystemKey) {
    console.warn(
      `[Coefficients] Система "${systemKey}" не найдена. Доступные системы: ${Object.keys(data.products).join(', ')}`
    );
    return {
      coefficient: null,
      usedSystemKey: null,
      usedCategory: null,
      isFallbackCategory: false,
    };
  }

  const product = data.products[foundSystemKey];

  // Ищем категорию с учетом различных вариантов написания
  const foundCategory = findCategory(product.categories, category);
  if (!foundCategory) {
    console.warn(
      `[Coefficients] Категория "${category}" не найдена для системы "${foundSystemKey}" и fallback недоступен`
    );
    return {
      coefficient: null,
      usedSystemKey: foundSystemKey,
      usedCategory: null,
      isFallbackCategory: false,
    };
  }

  const categoryData = product.categories[foundCategory];
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
      `[Coefficients] Некорректные данные для системы "${foundSystemKey}", категории "${foundCategory}"`
    );
    return {
      coefficient: null,
      usedSystemKey: foundSystemKey,
      usedCategory: foundCategory,
      isFallbackCategory: foundCategory !== category,
    };
  }

  try {
    const coefficient = bilinearInterpolation(
      width,
      height,
      widths,
      heights,
      values
    );
    
    const isFallbackCategory = foundCategory !== category;
    
    // Логируем если использовали fallback
    if (isFallbackCategory) {
      console.log(
        `[Coefficients] Рассчитан коэффициент ${coefficient.toFixed(4)} для системы "${foundSystemKey}", ` +
        `категория "${foundCategory}" (запрошена: "${category}"), размер ${width}×${height}м`
      );
    }
    
    return {
      coefficient,
      usedSystemKey: foundSystemKey,
      usedCategory: foundCategory,
      isFallbackCategory,
    };
  } catch (error) {
    console.error("[Coefficients] Ошибка при вычислении коэффициента:", error);
    return {
      coefficient: null,
      usedSystemKey: foundSystemKey,
      usedCategory: foundCategory,
      isFallbackCategory: foundCategory !== category,
    };
  }
}

export function getCoefficient(
  systemKey: string,
  category: string,
  width: number,
  height: number
): number | null {
  const data = loadCoefficients();

  // Ищем систему с учетом различных вариантов написания
  const foundSystemKey = findSystemKey(data, systemKey);
  if (!foundSystemKey) {
    console.warn(
      `[Coefficients] Система "${systemKey}" не найдена. Доступные системы: ${Object.keys(data.products).join(', ')}`
    );
    return null;
  }

  const product = data.products[foundSystemKey];

  // Ищем категорию с учетом различных вариантов написания
  const foundCategory = findCategory(product.categories, category);
  if (!foundCategory) {
    console.warn(
      `[Coefficients] Категория "${category}" не найдена для системы "${foundSystemKey}" и fallback недоступен`
    );
    return null;
  }

  const categoryData = product.categories[foundCategory];
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
      `[Coefficients] Некорректные данные для системы "${foundSystemKey}", категории "${foundCategory}"`
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
    
    // Логируем если использовали fallback
    if (foundCategory !== category) {
      console.log(
        `[Coefficients] Рассчитан коэффициент ${coefficient.toFixed(4)} для системы "${foundSystemKey}", ` +
        `категория "${foundCategory}" (запрошена: "${category}"), размер ${width}×${height}м`
      );
    }
    
    return coefficient;
  } catch (error) {
    console.error("[Coefficients] Ошибка при вычислении коэффициента:", error);
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
  getCoefficientDetailed,
  getAvailableSystems,
  getSystemCategories,
  getCoefficientRanges,
};
