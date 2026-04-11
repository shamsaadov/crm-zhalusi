/**
 * Нормализует поле `room` в списке створок: группирует по ключу `roomName`
 * (пустое значение → своя группа) и присваивает каждой уникальной группе
 * стабильный integer-ID (1, 2, 3, ...).
 *
 * Используется при входе в форму редактирования заказа и при импорте
 * заказа из мобильного замера — чтобы UI-группировка по `sash.room`
 * всегда совпадала с логической группировкой по `sash.roomName`,
 * даже если в БД `room` лежит как попало (в частности у старых заказов,
 * где все створки имеют `room=1`).
 *
 * Возвращает новый массив; исходный не мутирует.
 */
export function normalizeSashRooms<
  T extends { roomName?: string | null; room?: number | null }
>(sashes: T[]): T[] {
  const keyToId = new Map<string, number>();
  return sashes.map((s) => {
    const key = (s.roomName ?? "").trim();
    let id = keyToId.get(key);
    if (id === undefined) {
      id = keyToId.size + 1;
      keyToId.set(key, id);
    }
    return { ...s, room: id };
  });
}
