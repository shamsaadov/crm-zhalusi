import { useCallback, useRef } from "react";

interface CoefficientCache {
  [key: string]: {
    coefficient: number;
    isFallbackCategory: boolean;
    warning?: string;
  };
}

interface CalculateParams {
  systemKey: string;
  category: string;
  width: number;
  height: number;
}

export function useCoefficientCalculator() {
  const cacheRef = useRef<CoefficientCache>({});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getCacheKey = (params: CalculateParams) => {
    return `${params.systemKey}_${params.category}_${params.width.toFixed(3)}_${params.height.toFixed(3)}`;
  };

  const calculate = useCallback(
    async (
      params: CalculateParams,
      onSuccess: (data: {
        coefficient: number;
        isFallbackCategory: boolean;
        warning?: string;
      }) => void,
      onError?: (error: Error) => void,
      debounceMs: number = 500
    ) => {
      // Проверяем кэш
      const cacheKey = getCacheKey(params);
      if (cacheRef.current[cacheKey]) {
        onSuccess(cacheRef.current[cacheKey]);
        return;
      }

      // Отменяем предыдущий запрос
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Очищаем предыдущий таймаут
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Создаем новый AbortController
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Устанавливаем debounce
      timeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch("/api/coefficients/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              systemKey: params.systemKey,
              category: params.category,
              width: params.width,
              height: params.height,
            }),
            signal,
          });

          if (!response.ok) {
            throw new Error("Не удалось получить коэффициент");
          }

          const data = await response.json();

          if (data.coefficient) {
            // Сохраняем в кэш
            cacheRef.current[cacheKey] = {
              coefficient: data.coefficient,
              isFallbackCategory: data.isFallbackCategory || false,
              warning: data.warning,
            };

            onSuccess(cacheRef.current[cacheKey]);
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            // Запрос отменен - это нормально
            return;
          }
          onError?.(error as Error);
        }
      }, debounceMs);
    },
    []
  );

  const clearCache = useCallback(() => {
    cacheRef.current = {};
  }, []);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    calculate,
    clearCache,
    cleanup,
  };
}

