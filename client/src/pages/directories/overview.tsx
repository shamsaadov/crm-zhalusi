// Раздел «Справочники» как в УЭС (DirectoryOverview): сетка карточек справочников.

import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { DIRECTORIES } from "./registry";

export default function DirectoriesOverviewPage() {
  return (
    <Layout title="Справочники" caption="Раздел" actions={<span className="text-[13px] text-[var(--ues-muted)]">Основные данные предприятия</span>}>
      <p className="-mt-1 mb-4 text-[13px] text-[var(--ues-muted)]">Выберите справочник для просмотра и редактирования данных.</p>
      <div className="ues-directory-grid">
        {DIRECTORIES.map((d) => (
          <Link key={d.key} href={`/lists/${d.key}`} className="ues-directory-card" data-testid={`directory-${d.key}`}>
            <i aria-hidden="true">{d.icon}</i>
            <span>
              <strong>{d.title}</strong>
              <small>{d.description}</small>
            </span>
            <b aria-hidden="true">›</b>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
