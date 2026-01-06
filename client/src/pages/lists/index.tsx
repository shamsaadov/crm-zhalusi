import { useState } from "react";
import { Layout } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar } from "@/components/filter-bar";
import { entityConfig, type ListEntity } from "./entity-config";
import { ColorsTab } from "./colors-tab";
import { FabricsTab } from "./fabrics-tab";
import { DealersTab } from "./dealers-tab";
import { CashboxesTab } from "./cashboxes-tab";
import { SystemsTab } from "./systems-tab";
import { ExpenseTypesTab } from "./expense-types-tab";
import { ComponentsTab } from "./components-tab";
import { MultipliersTab } from "./multipliers-tab";
import { SuppliersTab } from "./suppliers-tab";

export default function ListsPage() {
  const [activeTab, setActiveTab] = useState<ListEntity>("colors");
  const [search, setSearch] = useState("");

  return (
    <Layout title="Справочники">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ListEntity)}
      >
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
          {Object.entries(entityConfig).map(([key, config]) => (
            <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>
              {config.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Поиск..."
          onReset={() => setSearch("")}
        />

        <TabsContent value="colors">
          <ColorsTab search={search} />
        </TabsContent>
        <TabsContent value="fabrics">
          <FabricsTab search={search} />
        </TabsContent>
        <TabsContent value="dealers">
          <DealersTab search={search} />
        </TabsContent>
        <TabsContent value="cashboxes">
          <CashboxesTab search={search} />
        </TabsContent>
        <TabsContent value="systems">
          <SystemsTab search={search} />
        </TabsContent>
        <TabsContent value="expenseTypes">
          <ExpenseTypesTab search={search} />
        </TabsContent>
        <TabsContent value="components">
          <ComponentsTab search={search} />
        </TabsContent>
        <TabsContent value="multipliers">
          <MultipliersTab search={search} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab search={search} />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}


