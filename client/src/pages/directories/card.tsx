// Карточка записи справочника как в УЭС: «Справочник «…» / Название»,
// «Записать и закрыть» · «Записать» · «Удалить», блок «Основные сведения».

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Check, CheckCheck, Loader2, Plus, Trash2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { currentFullPath, useWorkspaceTabs } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";
import NotFound from "@/pages/not-found";
import {
  DIRECTORY_BY_KEY,
  operationTypeOptions,
  optionLabel,
  type DirectoryKey,
  type FieldDef,
  type Option,
  type Row,
} from "./registry";
import { useDirectoryRows, useLookups } from "./hooks";
import { ConfirmDialog } from "./confirm";

export default function DirectoryCardPage() {
  const { entity, id } = useParams<{ entity: string; id: string }>();
  const def = DIRECTORY_BY_KEY[entity as DirectoryKey];
  if (!def || !id) return <NotFound />;
  return <DirectoryCard key={`${def.key}:${id}`} dkey={def.key} id={id} />;
}

interface SystemComponentLine {
  key: string;
  componentId: string;
  quantity: string;
  sizeSource: string;
  sizeMultiplier: string;
}

let seq = 0;

const editable =
  "bg-[var(--ues-primary-soft-hover)] border-[var(--ues-primary-border)] shadow-[inset_3px_0_0_var(--ues-primary)]";

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const s = String(v);
  // decimal из БД приходит как «2.50» — показываем без лишних нулей.
  return /^-?\d+\.\d+$/.test(s) ? String(parseFloat(s)) : s;
}

function DirectoryCard({ dkey, id }: { dkey: DirectoryKey; id: string }) {
  const def = DIRECTORY_BY_KEY[dkey];
  const isNew = id === "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { close } = useWorkspaceTabs();
  const { rows, isFetched } = useDirectoryRows(dkey);
  const { rowsOf } = useLookups(def.needs);
  const record = useMemo(() => (isNew ? null : rows.find((r) => r.id === id) ?? null), [rows, id, isNew]);

  const { data: systemKeys } = useQuery<{ systemKeys: string[] }>({
    queryKey: ["/api/coefficients/available-keys"],
    enabled: dkey === "systems",
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [components, setComponents] = useState<SystemComponentLine[]>([]);

  // Заполняем карточку один раз: из записи или значениями по умолчанию.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    if (isNew) {
      const v: Record<string, string> = {};
      for (const f of def.fields) v[f.name] = def.defaults?.[f.name] ?? "";
      setValues(v);
      initialized.current = true;
    } else if (record) {
      const v: Record<string, string> = {};
      for (const f of def.fields) v[f.name] = f.type === "password" ? "" : toStr(record[f.name]);
      setValues(v);
      initialized.current = true;
    }
  }, [isNew, record, def]);

  // Состав системы.
  useEffect(() => {
    if (dkey !== "systems" || isNew) return;
    let cancelled = false;
    fetch(`/api/systems/${id}/components`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        if (cancelled) return;
        setComponents(
          list.map((c) => ({
            key: `c${++seq}`,
            componentId: c.componentId,
            quantity: toStr(c.quantity) || "1",
            sizeSource: c.sizeSource || "",
            sizeMultiplier: toStr(c.sizeMultiplier) || "1",
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dkey, id, isNew]);

  const set = (name: string, value: string) => {
    setValues((v) => {
      const next = { ...v, [name]: value };
      // Тип статьи сменили — вид операции другого типа не подходит.
      if (dkey === "expense-types" && name === "direction") {
        const allowed = operationTypeOptions(value).map((o) => o.value);
        if (next.operationType && !allowed.includes(next.operationType)) next.operationType = "";
      }
      return next;
    });
    setErrors((e) => ({ ...e, [name]: "" }));
    setDirty(true);
    setNotice(null);
  };

  const optionsFor = (f: FieldDef): Option[] => {
    const src = f.options;
    if (!src) return [];
    if (src.kind === "static") return src.options;
    if (src.kind === "directory") return rowsOf(src.key).map((r: Row) => ({ value: r.id, label: optionLabel(src.key, r) }));
    if (src.kind === "systemKeys") {
      const keys = systemKeys?.systemKeys ?? [];
      const current = values[f.name];
      return [...(current && !keys.includes(current) ? [current] : []), ...keys].map((k) => ({ value: k, label: k }));
    }
    return operationTypeOptions(values.direction ?? "expense");
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of def.fields) {
      const v = (values[f.name] ?? "").trim();
      if (f.required && !v) e[f.name] = "Обязательное поле";
      if ((f.type === "number" || f.type === "money") && v) {
        const n = Number(v.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(n)) e[f.name] = "Введите число";
        else if (f.type === "number" && n < 0) e[f.name] = "Не может быть отрицательным";
      }
    }
    for (const c of components) {
      if (!c.componentId) e.components = "Выберите комплектующее в каждой строке состава";
    }
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const payload = () => {
    const out: Record<string, string | null> = {};
    for (const f of def.fields) {
      let v = (values[f.name] ?? "").trim();
      if ((f.type === "number" || f.type === "money") && v) v = v.replace(/\s/g, "").replace(",", ".");
      out[f.name] = v === "" ? null : v;
    }
    // Начальные остатки в базе не бывают пустыми.
    for (const k of ["openingBalance"]) if (k in out && out[k] === null) out[k] = "0";
    return def.toPayload ? def.toPayload(out as Record<string, string>, isNew) : out;
  };

  const save = useMutation({
    mutationFn: async (andClose: boolean) => {
      const res = isNew
        ? await apiRequest("POST", def.api, payload())
        : await apiRequest("PATCH", `${def.api}/${id}`, payload());
      const saved = (await res.json()) as Row;
      if (dkey === "systems") {
        const sid = saved.id ?? id;
        if (!isNew) await apiRequest("DELETE", `/api/systems/${sid}/components`);
        for (const c of components) {
          await apiRequest("POST", `/api/systems/${sid}/components`, {
            componentId: c.componentId,
            quantity: c.quantity || "1",
            sizeSource: c.sizeSource || null,
            sizeMultiplier: c.sizeMultiplier || "1",
          });
        }
      }
      return { saved, andClose };
    },
    onSuccess: ({ saved, andClose }) => {
      queryClient.invalidateQueries({ queryKey: [def.api] });
      if (dkey === "systems") queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setDirty(false);
      const here = currentFullPath();
      if (andClose) {
        toast({ title: "Записано" });
        close(here, { silent: true });
        navigate(`/lists/${dkey}`);
      } else if (isNew && saved?.id) {
        toast({ title: "Записано" });
        close(here, { silent: true });
        navigate(`/lists/${dkey}/${saved.id}`);
      } else {
        setNotice("Записано");
      }
    },
    onError: (e: Error) => toast({ title: "Не удалось записать", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `${def.api}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [def.api] });
      toast({ title: "Запись удалена" });
      close(currentFullPath(), { silent: true });
      navigate(`/lists/${dkey}`);
    },
    onError: () =>
      toast({ title: "Не удалось удалить", description: "Запись используется в документах.", variant: "destructive" }),
  });

  const submit = (andClose: boolean) => {
    if (save.isPending) return;
    if (validate()) save.mutate(andClose);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!isNew && isFetched && !record) {
    return (
      <Layout title="Запись не найдена" caption={`Справочник «${def.title}»`}>
        <p className="text-[13px] text-[var(--ues-muted)]">Запись удалена или принадлежит другому пользователю.</p>
      </Layout>
    );
  }

  const title = isNew ? "Новая запись" : record ? def.recordTitle(record) || "Запись" : "Загрузка…";
  const busy = save.isPending || remove.isPending;
  const componentRows = rowsOf("components");

  return (
    <Layout title={title} caption={`Справочник «${def.title}»`}>
      <div className="space-y-4">
        <div className="ues-toolbar">
          <button type="button" className="ues-btn success" onClick={() => submit(true)} disabled={busy} data-testid="button-directory-save-close">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Записать и закрыть
          </button>
          <button type="button" className="ues-btn soft-success" onClick={() => submit(false)} disabled={busy} data-testid="button-directory-save">
            <Check className="h-4 w-4" />
            Записать
          </button>
          {!isNew && (
            <>
              <span className="ues-toolbar-sep" />
              <button type="button" className="ues-btn danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            </>
          )}
          <span className="ml-auto text-[12px] text-[var(--ues-muted)]">
            {notice ? <b className="text-[var(--ues-success)]">{notice}</b> : dirty ? "Есть незаписанные изменения · " : ""}
            {!notice && "Ctrl+S — записать"}
          </span>
        </div>

        <form
          className="ues-dir-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <section className="ues-fieldset">
            <div className="ues-fieldset-title">Основные сведения</div>
            <div className="ues-dir-grid">
              {def.fields.map((f) => {
                const fieldId = `dir-${dkey}-${f.name}`;
                const err = errors[f.name];
                const cls = cn("ues-input h-9 w-full", editable, err && "!border-[var(--ues-danger)]");
                return (
                  <div key={f.name} className="contents">
                    <label htmlFor={fieldId} className="ues-dir-label">
                      {f.label}
                      {f.required && <b className="text-[var(--ues-danger)]"> *</b>}
                    </label>
                    <div className="min-w-0">
                      {f.type === "select" ? (
                        <select id={fieldId} className={cls} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                          {(!f.required || !values[f.name]) && <option value="">{f.emptyLabel ?? "Выберите"}</option>}
                          {optionsFor(f).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input
                            id={fieldId}
                            type={f.type === "password" ? "password" : "text"}
                            inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined}
                            autoComplete={f.type === "password" ? "new-password" : "off"}
                            className={cn(cls, (f.type === "number" || f.type === "money") && "text-right tabular-nums sm:max-w-[220px]")}
                            value={values[f.name] ?? ""}
                            placeholder={f.placeholder}
                            list={f.suggestions ? `${fieldId}-list` : undefined}
                            onChange={(e) => set(f.name, e.target.value)}
                            data-testid={`input-${f.name}`}
                          />
                          {f.suggestions && (
                            <datalist id={`${fieldId}-list`}>
                              {f.suggestions.map((s) => (
                                <option key={s} value={s} />
                              ))}
                            </datalist>
                          )}
                        </>
                      )}
                      {err ? (
                        <small className="mt-0.5 block text-[12px] text-[var(--ues-danger)]">{err}</small>
                      ) : (
                        f.hint && <small className="mt-0.5 block text-[12px] text-[var(--ues-muted)]">{f.hint}</small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <button type="submit" hidden />
        </form>

        {dkey === "systems" && (
          <section className="ues-fieldset !p-0">
            <div className="flex items-center gap-2 px-4 pt-3">
              <div className="ues-fieldset-title !mb-0">Состав комплектующих</div>
              <button
                type="button"
                className="ues-btn ml-2 h-8"
                onClick={() => {
                  setComponents((cs) => [...cs, { key: `c${++seq}`, componentId: "", quantity: "1", sizeSource: "", sizeMultiplier: "1" }]);
                  setDirty(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Добавить
              </button>
              {errors.components && <small className="text-[12px] text-[var(--ues-danger)]">{errors.components}</small>}
            </div>
            <div className="mt-3 overflow-x-auto border-t border-[var(--ues-border)]">
              <table className="ues-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th className="w-[40px]">№</th>
                    <th>Комплектующее</th>
                    <th className="num w-[110px]">Количество</th>
                    <th className="w-[160px]">Зависит от размера</th>
                    <th className="num w-[120px]">Множитель размера</th>
                    <th className="w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 && (
                    <tr>
                      <td colSpan={6} className="ues-muted py-4 text-center">
                        Комплектующие не заданы — система списывает только ткань
                      </td>
                    </tr>
                  )}
                  {components.map((c, i) => {
                    const upd = (patch: Partial<SystemComponentLine>) => {
                      setComponents((cs) => cs.map((x) => (x.key === c.key ? { ...x, ...patch } : x)));
                      setDirty(true);
                      setErrors((e) => ({ ...e, components: "" }));
                    };
                    return (
                      <tr key={c.key}>
                        <td className="ues-muted">{i + 1}</td>
                        <td>
                          <select className={cn("ues-input h-8 w-full", editable)} value={c.componentId} onChange={(e) => upd({ componentId: e.target.value })}>
                            <option value="">Выберите комплектующее</option>
                            {componentRows.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className={cn("ues-input h-8 w-full text-right tabular-nums", editable)}
                            inputMode="decimal"
                            value={c.quantity}
                            onChange={(e) => upd({ quantity: e.target.value.replace(",", ".") })}
                          />
                        </td>
                        <td>
                          <select className={cn("ues-input h-8 w-full", editable)} value={c.sizeSource} onChange={(e) => upd({ sizeSource: e.target.value })}>
                            <option value="">Нет, по количеству</option>
                            <option value="width">От ширины</option>
                            <option value="height">От высоты</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className={cn("ues-input h-8 w-full text-right tabular-nums", editable)}
                            inputMode="decimal"
                            value={c.sizeMultiplier}
                            disabled={!c.sizeSource}
                            onChange={(e) => upd({ sizeMultiplier: e.target.value.replace(",", ".") })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ues-expander"
                            title="Удалить строку"
                            onClick={() => {
                              setComponents((cs) => cs.filter((x) => x.key !== c.key));
                              setDirty(true);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[12px] text-[var(--ues-muted)]">
              Состав списывается со склада, когда заказ с этой системой становится «Готов».
            </p>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить запись?"
        text={`«${title}» будет удалена из справочника «${def.title}».${def.deleteWarning ? ` ${def.deleteWarning}` : ""}`}
        confirmLabel="Удалить"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
      />
    </Layout>
  );
}
