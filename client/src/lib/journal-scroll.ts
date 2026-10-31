// Журналы как в УЭС (useJournalScroll): новые документы внизу, журнал открывается
// прокрученным к самым новым, после создания документа снова прокручивается вниз.
// При подгрузке более старых строк сверху позиция не прыгает.

import { useEffect, useLayoutEffect, useRef } from "react";

export function useJournalBottomScroll(
  containerRef: React.RefObject<HTMLElement>,
  ids: string[]
) {
  const prevIds = useRef<string[] | null>(null);
  const fromBottom = useRef(0);

  // Запоминаем расстояние до низа — по нему держим позицию при подгрузке сверху.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      fromBottom.current = el.scrollHeight - el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  const key = ids.join("|");
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || ids.length === 0) return;
    const prev = prevIds.current;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
      fromBottom.current = el.clientHeight;
    };
    if (!prev || prev.length === 0) {
      toBottom();
    } else {
      const prevSet = new Set(prev);
      const lastIsNew = !prevSet.has(ids[ids.length - 1]);
      const overlap = ids.some((id) => prevSet.has(id));
      if (!overlap || lastIsNew) {
        // Другой фильтр или новый документ внизу.
        toBottom();
      } else if (!prevSet.has(ids[0])) {
        // Сверху догрузились старые строки — остаёмся на тех же строках.
        el.scrollTop = el.scrollHeight - fromBottom.current;
      }
    }
    prevIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
