// Страница раздела в стиле УЭС: группы ссылок-карточек на журналы, отчёты и справочники.

import { Link, useParams } from "wouter";
import { ChevronRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { sectionByKey } from "@/lib/navigation";
import NotFound from "@/pages/not-found";

export default function SectionPage() {
  const { key } = useParams<{ key: string }>();
  const section = sectionByKey(key ?? "");
  if (!section || section.groups.length === 0) return <NotFound />;

  return (
    <Layout title={section.title} caption="Раздел">
      {section.description && (
        <p className="-mt-2 mb-5 text-[13px] text-[var(--ues-muted)]">{section.description}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {section.groups.map((group) => (
          <section key={group.title}>
            <h2 className="ues-group-title mb-2.5">{group.title}</h2>
            <div className="grid gap-2">
              {group.items.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className="ues-link-card"
                  data-testid={`section-link-${item.path.replace(/[^a-z0-9]+/gi, "-")}`}
                >
                  <span className="ues-link-icon">
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-[var(--ues-text)]">{item.title}</span>
                      {item.code && <span className="ues-link-code">{item.code}</span>}
                    </span>
                    {item.description && (
                      <span className="block truncate text-[12px] text-[var(--ues-muted)]">{item.description}</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ues-muted)]" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Layout>
  );
}
