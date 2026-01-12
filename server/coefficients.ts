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
 * Округляет значение до ближайшего узла сетки
 * Правило: если остаток > 0.5 от шага — округляем вверх, иначе вниз
 * Примеры (шаг 0.1 м = 100 мм):
 *   450 мм = 0.450 м → остаток 0.050 ≤ 0.05 → 0.4 м
 *   451 мм = 0.451 м → остаток 0.051 > 0.05 → 0.5 м
 *   670 мм = 0.670 м → остаток 0.070 > 0.05 → 0.7 м
 *   1350 мм = 1.350 м → остаток 0.050 ≤ 0.05 → 1.3 м
 */
function roundToGridStep(value: number, step: number = 0.1): number {
  const scaled = value / step;
  const lower = Math.floor(scaled);
  const remainder = scaled - lower;

  // Если остаток > 0.5 — округляем вверх, иначе — вниз
  if (remainder > 0.5) {
    return Math.round((lower + 1) * step * 1000) / 1000; // избегаем ошибок float
  }
  return Math.round(lower * step * 1000) / 1000;
}

/**
 * Находит ближайший индекс в массиве для заданного значения
 */
function findNearestIndex(value: number, arr: number[]): number {
  // Округляем значение до шага сетки
  const step =
    arr.length > 1 ? Math.round((arr[1] - arr[0]) * 1000) / 1000 : 0.1;
  const rounded = roundToGridStep(value, step);

  // Ищем точное совпадение
  for (let i = 0; i < arr.length; i++) {
    if (Math.abs(arr[i] - rounded) < 0.0001) {
      return i;
    }
  }

  // Если точного совпадения нет, ограничиваем диапазоном
  if (rounded <= arr[0]) return 0;
  if (rounded >= arr[arr.length - 1]) return arr.length - 1;

  // Ищем ближайший
  let nearestIndex = 0;
  let minDiff = Math.abs(arr[0] - rounded);
  for (let i = 1; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - rounded);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

/**
 * Поиск коэффициента по округлённым координатам (без интерполяции)
 */
function lookupCoefficient(
  x: number,
  y: number,
  xArr: number[],
  yArr: number[],
  values: number[][]
): number {
  const xIndex = findNearestIndex(x, xArr);
  const yIndex = findNearestIndex(y, yArr);

  // Проверяем границы
  const safeXIndex = Math.max(0, Math.min(xIndex, xArr.length - 1));
  const safeYIndex = Math.max(0, Math.min(yIndex, yArr.length - 1));

  const coefficient = values[safeYIndex][safeXIndex];

  // Логируем для отладки
  const step =
    xArr.length > 1 ? Math.round((xArr[1] - xArr[0]) * 1000) / 1000 : 0.1;
  console.log(
    `[Coefficients] Lookup: ${x.toFixed(3)}м×${y.toFixed(3)}м → ` +
      `округлено до ${roundToGridStep(x, step).toFixed(1)}м×${roundToGridStep(
        y,
        step
      ).toFixed(1)}м ` +
      `[${safeXIndex}][${safeYIndex}] = ${coefficient}`
  );

  return coefficient;
}

/**
 * Нормализует строку для сравнения (убирает пробелы, приводит к нижнему регистру)
 */
function normalizeString(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Ищет ключ системы с учетом различных вариантов написания
 */
function findSystemKey(
  data: CoefficientData,
  systemKey: string
): string | null {
  // 1. Точное совпадение
  if (data.products[systemKey]) {
    return systemKey;
  }

  // 2. Поиск без учета регистра и пробелов
  const normalizedSearch = normalizeString(systemKey);
  const foundKey = Object.keys(data.products).find(
    (key) => normalizeString(key) === normalizedSearch
  );

  if (foundKey) {
    console.log(
      `[Coefficients] Найдена система "${foundKey}" вместо "${systemKey}"`
    );
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
    (key) => key.toLowerCase() === lowerCategory
  );

  if (foundKey) {
    console.log(
      `[Coefficients] Найдена категория "${foundKey}" вместо "${category}" (без учета регистра)`
    );
    return foundKey;
  }

  // 3. Поиск без пробелов
  const normalizedSearch = normalizeString(category);
  foundKey = Object.keys(categories).find(
    (key) => normalizeString(key) === normalizedSearch
  );

  if (foundKey) {
    console.log(
      `[Coefficients] Найдена категория "${foundKey}" вместо "${category}" (нормализация)`
    );
    return foundKey;
  }

  // 4. Fallback: берем первую доступную категорию
  const availableCategories = Object.keys(categories);
  if (availableCategories.length > 0) {
    const fallbackCategory = availableCategories[0];
    console.warn(
      `[Coefficients] Категория "${category}" не найдена. Используется fallback: "${fallbackCategory}". ` +
        `Доступные категории: ${availableCategories.join(", ")}`
    );
    return fallbackCategory;
  }

  return null;
}

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
      `[Coefficients] Система "${systemKey}" не найдена. Доступные системы: ${Object.keys(
        data.products
      ).join(", ")}`
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
    const coefficient = lookupCoefficient(
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
        `[Coefficients] Рассчитан коэффициент ${coefficient.toFixed(
          4
        )} для системы "${foundSystemKey}", ` +
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
      `[Coefficients] Система "${systemKey}" не найдена. Доступные системы: ${Object.keys(
        data.products
      ).join(", ")}`
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
    const coefficient = lookupCoefficient(
      width,
      height,
      widths,
      heights,
      values
    );

    // Логируем если использовали fallback
    if (foundCategory !== category) {
      console.log(
        `[Coefficients] Рассчитан коэффициент ${coefficient.toFixed(
          4
        )} для системы "${foundSystemKey}", ` +
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
