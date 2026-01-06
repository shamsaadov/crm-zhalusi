import { useCallback, useRef, useMemo } from "react";

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
  lastParams: string | null; // Для предотвращения дублирования запросов с одинаковыми параметрами
}

export function useCoefficientCalculator() {
  const cacheRef = useRef<CoefficientCache>({});
  const sashStatesRef = useRef<Map<string, SashState>>(new Map());

  const getCacheKey = (params: CalculateParams) => {
    return `${params.systemKey}_${params.category}_${params.width.toFixed(3)}_${params.height.toFixed(3)}`;
  };

  const getSashState = (sashId: string): SashState => {
    if (!sashStatesRef.current.has(sashId)) {
      sashStatesRef.current.set(sashId, { timeout: null, abortController: null, lastParams: null });
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
      console.log("[CALC] calculate called with sashId:", sashId, "params:", params, "debounceMs:", debounceMs);
      
      // Проверяем кэш
      const cacheKey = getCacheKey(params);
      if (cacheRef.current[cacheKey]) {
        console.log("[CALC] cache hit for", cacheKey);
        onSuccess(cacheRef.current[cacheKey]);
        return;
      }

      const sashState = getSashState(sashId);
      console.log("[CALC] sashState:", sashState);

      // Если таймаут уже установлен с такими же параметрами - не перезапускаем
      if (sashState.timeout && sashState.lastParams === cacheKey) {
        console.log("[CALC] same params, keeping existing timeout for", sashId);
        return;
      }

      // Отменяем предыдущий запрос для этой створки (только если параметры изменились)
      if (sashState.abortController) {
        console.log("[CALC] aborting previous request for", sashId);
        sashState.abortController.abort();
      }

      // Очищаем предыдущий таймаут для этой створки
      if (sashState.timeout) {
        console.log("[CALC] clearing previous timeout for", sashId);
        clearTimeout(sashState.timeout);
      }
      
      // Сохраняем текущие параметры
      sashState.lastParams = cacheKey;

      // Создаем новый AbortController для этой створки
      sashState.abortController = new AbortController();
      const signal = sashState.abortController.signal;

      console.log("[CALC] setting timeout for", debounceMs, "ms");
      // Устанавливаем debounce
      sashState.timeout = setTimeout(async () => {
        console.log("[CALC] timeout fired, sending request...");
        // Очищаем таймаут и lastParams после срабатывания
        sashState.timeout = null;
        sashState.lastParams = null;
        
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
    console.log("[CALC] cleanup called!");
    // Очищаем все состояния створок
    sashStatesRef.current.forEach((state) => {
      if (state.timeout) {
        console.log("[CALC] cleanup: clearing timeout");
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

  // Мемоизируем возвращаемый объект, чтобы он не менялся при ре-рендерах
  return useMemo(() => ({
    calculate,
    clearCache,
    cleanup,
    cleanupSash,
  }), [calculate, clearCache, cleanup, cleanupSash]);
}

