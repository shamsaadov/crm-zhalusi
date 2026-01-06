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

// Храним отдельные таймауты и контроллеры для каждой створки (по индексу)
interface SashState {
  timeout: NodeJS.Timeout | null;
  abortController: AbortController | null;
}

export function useCoefficientCalculator() {
  const cacheRef = useRef<CoefficientCache>({});
  const sashStatesRef = useRef<Map<string, SashState>>(new Map());

  const getCacheKey = (params: CalculateParams) => {
    return `${params.systemKey}_${params.category}_${params.width.toFixed(3)}_${params.height.toFixed(3)}`;
  };

  const getSashState = (sashId: string): SashState => {
    if (!sashStatesRef.current.has(sashId)) {
      sashStatesRef.current.set(sashId, { timeout: null, abortController: null });
    }
    return sashStatesRef.current.get(sashId)!;
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
      debounceMs: number = 500,
      sashId: string = "default" // Идентификатор створки для отдельного debounce
    ) => {
      // Проверяем кэш
      const cacheKey = getCacheKey(params);
      if (cacheRef.current[cacheKey]) {
        onSuccess(cacheRef.current[cacheKey]);
        return;
      }

      const sashState = getSashState(sashId);

      // Отменяем предыдущий запрос для этой створки
      if (sashState.abortController) {
        sashState.abortController.abort();
      }

      // Очищаем предыдущий таймаут для этой створки
      if (sashState.timeout) {
        clearTimeout(sashState.timeout);
      }

      // Создаем новый AbortController для этой створки
      sashState.abortController = new AbortController();
      const signal = sashState.abortController.signal;

      // Устанавливаем debounce
      sashState.timeout = setTimeout(async () => {
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
    // Очищаем все состояния створок
    sashStatesRef.current.forEach((state) => {
      if (state.timeout) {
        clearTimeout(state.timeout);
      }
      if (state.abortController) {
        state.abortController.abort();
      }
    });
    sashStatesRef.current.clear();
  }, []);

  const cleanupSash = useCallback((sashId: string) => {
    const state = sashStatesRef.current.get(sashId);
    if (state) {
      if (state.timeout) {
        clearTimeout(state.timeout);
      }
      if (state.abortController) {
        state.abortController.abort();
      }
      sashStatesRef.current.delete(sashId);
    }
  }, []);

  return {
    calculate,
    clearCache,
    cleanup,
    cleanupSash,
  };
}

