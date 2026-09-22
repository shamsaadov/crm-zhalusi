// Общая логика раскроя для диалога «Раскрой» и печатных форм:
// типы ответа API, view-model одного отреза и чертёж отреза в SVG.

export interface CuttingPiece {
  sashIndex: number;
  /** Габарит по ширине с припусками — по нему идёт укладка */
  width: number;
  /** Габарит по высоте с припусками */
  height: number;
  sashWidth?: number;
  sashHeight?: number;
  sideAllowance?: number;
  heightAllowance?: number;
  layers?: number;
  roomName?: string | null;
}

export interface CuttingRow {
  id: string;
  rowIndex: number;
  cutLength: string;
  pieces: CuttingPiece[];
  usedWidth: string;
  wasteWidth: string;
}

export interface CuttingLayoutResult {
  id: string;
  orderId: string;
  fabricId: string;
  fabricName?: string;
  fabricType?: string;
  rollWidth: string;
  totalLength: string;
  wastePercent: string;
  createdAt?: string | null;
  rows: CuttingRow[];
}

export interface SkippedSash {
  sashIndex: number;
  roomName: string | null;
  width: number;
  height: number;
  reason: "no_fabric" | "no_roll_width";
  fabricName?: string;
}

export interface CuttingResponse {
  layouts: CuttingLayoutResult[];
  skipped: SkippedSash[];
  isStale: boolean;
  calculatedAt: string | null;
}

export interface CutPieceView {
  sashIndex: number;
  roomName: string;
  cleanWidth: number;
  cleanHeight: number;
  fullWidth: number;
  fullHeight: number;
  sideAllowance: number;
  heightAllowance: number;
  layers: number;
  /** Отступ левого края куска от края рулона, см */
  from: number;
  to: number;
}

export interface CutView {
  rowIndex: number;
  cutLength: number;
  rollWidth: number;
  usedWidth: number;
  wasteWidth: number;
  /** Чистая высота самой высокой створки в отрезе */
  maxCleanHeight: number;
  heightAllowance: number;
  layers: number;
  pieces: CutPieceView[];
}

export const fmtCm = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");

export function getCutView(row: CuttingRow, layout: CuttingLayoutResult): CutView {
  const rollWidth = parseFloat(layout.rollWidth);
  const cutLength = parseFloat(row.cutLength);
  let cursor = 0;
  const pieces: CutPieceView[] = row.pieces.map((p) => {
    const side = p.sideAllowance ?? 0;
    const heightAllowance = p.heightAllowance ?? 0;
    const layers = p.layers ?? 1;
    const view: CutPieceView = {
      sashIndex: p.sashIndex,
      roomName: p.roomName ?? "",
      cleanWidth: p.sashWidth ?? p.width,
      cleanHeight: p.sashHeight ?? p.height,
      fullWidth: p.width,
      fullHeight: p.height,
      sideAllowance: side,
      heightAllowance,
      layers,
      from: cursor,
      to: cursor + p.width,
    };
    cursor += p.width;
    return view;
  });
  const usedWidth = cursor;
  const tallest = pieces.reduce(
    (best, p) => (p.fullHeight > best.fullHeight ? p : best),
    pieces[0]
  );
  return {
    rowIndex: row.rowIndex,
    cutLength,
    rollWidth,
    usedWidth,
    wasteWidth: Math.max(0, rollWidth - usedWidth),
    maxCleanHeight: tallest?.cleanHeight ?? cutLength,
    heightAllowance: tallest?.heightAllowance ?? 0,
    layers: tallest?.layers ?? 1,
    pieces,
  };
}

/** Заголовок отреза: «высота 150 + 20 припуск» или «150 × 2 слоя + 20» для зебры */
export function describeCutHeight(cut: CutView): string {
  const parts: string[] = [];
  if (cut.layers > 1) {
    parts.push(`${fmtCm(cut.maxCleanHeight)} × ${cut.layers} слоя`);
  } else {
    parts.push(fmtCm(cut.maxCleanHeight));
  }
  if (cut.heightAllowance > 0) parts.push(`${fmtCm(cut.heightAllowance)} припуск`);
  return `высота ${parts.join(" + ")}`;
}

// Цвета чертежа — фиксированные, потому что SVG уходит и на печать.
const C = {
  frame: "#374151",
  piece: "#eaf3de",
  pieceStroke: "#639922",
  pieceTitle: "#27500a",
  pieceSub: "#3b6d11",
  hatch: "#888780",
  waste: "#fcebeb",
  wasteStroke: "#e24b4a",
  wasteText: "#a32d2d",
  ruler: "#5f5e5a",
};

/**
 * Чертёж одного отреза. Ширина — в масштабе рулона, высота — пропорциональна
 * длине отреза (длинный отрез рисуется выше короткого).
 */
export function buildCutSvg(cut: CutView, opts: { maxCutLength?: number; idSuffix?: string } = {}): string {
  const W = 640;
  const PAD = 20;
  const drawW = W - PAD * 2;
  const scale = drawW / cut.rollWidth;
  const maxCut = Math.max(opts.maxCutLength ?? cut.cutLength, cut.cutLength, 1);
  const MAX_H = 120;
  const MIN_H = 56;
  const stripH = Math.max(MIN_H, Math.round((cut.cutLength / maxCut) * MAX_H));
  const top = 8;
  const rulerY = top + stripH + 14;
  const H = rulerY + 22;
  const hatchId = `hatch${opts.idSuffix ?? ""}`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Координаты в SVG округляем до сотых, чтобы не тащить шум float в разметку.
  const r = (n: number) => Math.round(n * 100) / 100;

  const parts: string[] = [];
  parts.push(
    `<defs><pattern id="${hatchId}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${C.hatch}" stroke-width="1.4"/></pattern></defs>`
  );

  // Куски
  for (const p of cut.pieces) {
    const x = PAD + p.from * scale;
    const w = p.fullWidth * scale;
    const h = Math.max(4, (p.fullHeight / cut.cutLength) * stripH);
    const sideW = p.sideAllowance * scale;
    const topH = (p.heightAllowance / cut.cutLength) * stripH;

    parts.push(
      `<rect x="${r(x)}" y="${top}" width="${r(w)}" height="${r(h)}" fill="${C.piece}" stroke="${C.pieceStroke}"/>`
    );
    if (sideW > 0) {
      parts.push(
        `<rect x="${r(x)}" y="${top}" width="${r(sideW)}" height="${r(h)}" fill="url(#${hatchId})" stroke="${C.hatch}" stroke-width="0.5"/>`,
        `<rect x="${r(x + w - sideW)}" y="${top}" width="${r(sideW)}" height="${r(h)}" fill="url(#${hatchId})" stroke="${C.hatch}" stroke-width="0.5"/>`
      );
    }
    if (topH > 0) {
      parts.push(
        `<rect x="${r(x)}" y="${top}" width="${r(w)}" height="${r(topH)}" fill="url(#${hatchId})" stroke="${C.hatch}" stroke-width="0.5"/>`
      );
    }

    const cx = x + w / 2;
    const cy = top + topH + (h - topH) / 2;
    const title = `№${p.sashIndex}${p.roomName ? ` · ${p.roomName}` : ""}`;
    const size = `${fmtCm(p.cleanWidth)} × ${fmtCm(p.cleanHeight)}`;
    const roomyEnough = w >= 70 && h - topH >= 34;
    if (roomyEnough) {
      parts.push(
        `<text x="${r(cx)}" y="${r(cy - 3)}" text-anchor="middle" font-size="12" font-weight="600" fill="${C.pieceTitle}">${esc(title)}</text>`,
        `<text x="${r(cx)}" y="${r(cy + 12)}" text-anchor="middle" font-size="11" fill="${C.pieceSub}">${esc(size)}</text>`
      );
    } else if (w >= 28) {
      parts.push(
        `<text x="${r(cx)}" y="${r(cy + 4)}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.pieceTitle}">№${p.sashIndex}</text>`
      );
    }
  }

  // Остаток
  if (cut.wasteWidth > 0) {
    const x = PAD + cut.usedWidth * scale;
    const w = cut.wasteWidth * scale;
    parts.push(
      `<rect x="${r(x)}" y="${top}" width="${r(w)}" height="${stripH}" fill="${C.waste}" stroke="${C.wasteStroke}" stroke-dasharray="4 3"/>`
    );
    if (w >= 30) {
      parts.push(
        `<text x="${r(x + w / 2)}" y="${r(top + stripH / 2 + 4)}" text-anchor="middle" font-size="11" fill="${C.wasteText}">${fmtCm(cut.wasteWidth)} см</text>`
      );
    }
  }

  // Рамка рулона
  parts.push(
    `<rect x="${PAD}" y="${top}" width="${drawW}" height="${stripH}" fill="none" stroke="${C.frame}" stroke-width="1.5"/>`
  );

  // Линейка: отметки на границах кусков и по краю рулона
  const ticks = new Set<number>([0, cut.rollWidth]);
  for (const p of cut.pieces) {
    ticks.add(p.from);
    ticks.add(p.to);
  }
  const sorted = Array.from(ticks).sort((a, b) => a - b);
  parts.push(
    `<line x1="${PAD}" y1="${rulerY}" x2="${PAD + drawW}" y2="${rulerY}" stroke="${C.hatch}"/>`
  );
  let lastLabelX = -Infinity;
  for (const t of sorted) {
    const x = PAD + t * scale;
    parts.push(
      `<line x1="${r(x)}" y1="${rulerY - 4}" x2="${r(x)}" y2="${rulerY + 4}" stroke="${C.hatch}"/>`
    );
    // Не наслаивать подписи друг на друга
    if (x - lastLabelX >= 26 || t === cut.rollWidth) {
      const anchor = t === 0 ? "start" : t === cut.rollWidth ? "end" : "middle";
      parts.push(
        `<text x="${r(x)}" y="${rulerY + 16}" text-anchor="${anchor}" font-size="11" fill="${C.ruler}">${fmtCm(t)}</text>`
      );
      lastLabelX = x;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Отрез ${cut.rowIndex}" style="display:block;font-family:Arial,sans-serif">${parts.join("")}</svg>`;
}

export function describeSkipped(s: SkippedSash): string {
  const who = `Створка №${s.sashIndex}${s.roomName ? ` (${s.roomName})` : ""} ${fmtCm(s.width)} × ${fmtCm(s.height)}`;
  if (s.reason === "no_fabric") return `${who}: не выбрана ткань`;
  return `${who}: у ткани «${s.fabricName ?? "?"}» не указана ширина рулона`;
}

export function formatCalculatedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LEGEND_HTML = `
  <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#6b7280;margin:6px 0 10px">
    <span><span style="display:inline-block;width:11px;height:11px;background:${C.piece};border:1px solid ${C.pieceStroke};vertical-align:-2px;margin-right:4px"></span>створка, чистый размер</span>
    <span><span style="display:inline-block;width:11px;height:11px;background:repeating-linear-gradient(135deg,${C.hatch} 0 1.5px,transparent 1.5px 4px);border:1px solid ${C.hatch};vertical-align:-2px;margin-right:4px"></span>припуск</span>
    <span><span style="display:inline-block;width:11px;height:11px;background:${C.waste};border:1px dashed ${C.wasteStroke};vertical-align:-2px;margin-right:4px"></span>остаток рулона</span>
  </div>`;

/** Печатная форма раскроя: чертёж + таблица кусков на каждый отрез. */
export function renderCuttingLayoutsHtml(data: CuttingResponse | CuttingLayoutResult[] | null | undefined): string {
  const layouts: CuttingLayoutResult[] = Array.isArray(data) ? data : data?.layouts ?? [];
  const skipped: SkippedSash[] = Array.isArray(data) ? [] : data?.skipped ?? [];
  const isStale = Array.isArray(data) ? false : !!data?.isStale;
  if (layouts.length === 0) return "";

  const warnings: string[] = [];
  if (isStale) warnings.push("Створки заказа изменялись после расчёта — раскрой нужно пересчитать.");
  for (const s of skipped) warnings.push(`Не учтена: ${describeSkipped(s)}.`);
  const warningsHtml = warnings.length
    ? `<div style="border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:12px">${warnings
        .map((w) => `<div>${w}</div>`)
        .join("")}</div>`
    : "";

  const sections = layouts.map((layout, li) => {
    const rollW = parseFloat(layout.rollWidth);
    const totalLen = parseFloat(layout.totalLength);
    const waste = parseFloat(layout.wastePercent);
    const cuts = layout.rows.map((r) => getCutView(r, layout));
    const maxCut = Math.max(...cuts.map((c) => c.cutLength), 1);
    const piecesCount = cuts.reduce((n, c) => n + c.pieces.length, 0);
    const side = cuts.flatMap((c) => c.pieces).find((p) => p.sideAllowance)?.sideAllowance ?? 0;
    const heightAllowance = cuts.flatMap((c) => c.pieces).find((p) => p.heightAllowance)?.heightAllowance ?? 0;

    const cutsHtml = cuts
      .map((cut, ci) => {
        const rows = cut.pieces
          .map(
            (p) => `<tr>
              <td style="padding:3px 6px;border-bottom:1px solid #e5e7eb">№${p.sashIndex}${p.roomName ? ` · ${p.roomName}` : ""}</td>
              <td style="padding:3px 6px;border-bottom:1px solid #e5e7eb">${fmtCm(p.cleanWidth)} × ${fmtCm(p.cleanHeight)}</td>
              <td style="padding:3px 6px;border-bottom:1px solid #e5e7eb">${fmtCm(p.fullWidth)} × ${fmtCm(p.fullHeight)}</td>
              <td style="padding:3px 6px;border-bottom:1px solid #e5e7eb">${fmtCm(p.from)} – ${fmtCm(p.to)} см</td>
            </tr>`
          )
          .join("");
        return `
          <div style="border:1px solid #d1d5db;border-radius:6px;padding:10px;margin-bottom:10px;page-break-inside:avoid">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
              <strong>Отрез ${cut.rowIndex} · ${fmtCm(cut.cutLength)} см</strong>
              <span style="color:#6b7280">${describeCutHeight(cut)} · занято ${fmtCm(cut.usedWidth)} из ${fmtCm(cut.rollWidth)} см</span>
            </div>
            ${buildCutSvg(cut, { maxCutLength: maxCut, idSuffix: `-${li}-${ci}` })}
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px">
              <thead><tr style="color:#6b7280;text-align:left">
                <th style="font-weight:600;padding:3px 6px;border-bottom:1px solid #9ca3af">Кусок</th>
                <th style="font-weight:600;padding:3px 6px;border-bottom:1px solid #9ca3af">Чистый размер</th>
                <th style="font-weight:600;padding:3px 6px;border-bottom:1px solid #9ca3af">С припуском</th>
                <th style="font-weight:600;padding:3px 6px;border-bottom:1px solid #9ca3af">От края рулона</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      })
      .join("");

    const allowanceNote =
      side || heightAllowance
        ? `Припуски: по ${fmtCm(side)} см с каждой стороны по ширине, ${fmtCm(heightAllowance)} см по высоте.`
        : "";

    return `
      <div style="margin-bottom:20px;${li > 0 ? "page-break-before:always" : ""}">
        <h3 style="margin:0 0 6px;font-size:15px">${layout.fabricName || "Ткань"}${layout.fabricType === "zebra" ? " (зебра, 2 слоя)" : ""}</h3>
        <p style="margin:0 0 4px;font-size:13px">
          Рулон <strong>${fmtCm(rollW)} см</strong> ·
          Отрезать <strong>${(totalLen / 100).toFixed(2)} п.м.</strong> ·
          Кусков <strong>${piecesCount}</strong> ·
          Остаток <strong>${waste.toFixed(1)}%</strong>
        </p>
        ${allowanceNote ? `<p style="margin:0 0 4px;font-size:11px;color:#6b7280">${allowanceNote}</p>` : ""}
        ${LEGEND_HTML}
        ${cutsHtml}
      </div>`;
  });

  return warningsHtml + sections.join("");
}
