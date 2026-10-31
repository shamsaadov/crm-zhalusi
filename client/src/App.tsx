import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ReportAccessProvider } from "@/contexts/report-access-context";
import { CommandPalette } from "@/components/command-palette";
import { ChatWidget } from "@/components/chat-widget";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import OrdersPage from "@/pages/orders";
import FinancePage from "@/pages/finance";
import WarehousePage from "@/pages/warehouse";
import ListsPage from "@/pages/lists";
import DDSReportPage from "@/pages/reports/dds";
import ProfitReportPage from "@/pages/reports/profit";
import ARAPReportPage from "@/pages/reports/ar-ap";
import CashTotalReportPage from "@/pages/reports/cash-total";
import ProfilePage from "@/pages/profile";
import DashboardPage from "@/pages/dashboard";
import KanbanPage from "@/pages/kanban";
import AuditLogPage from "@/pages/audit-log";
import NotificationsPage from "@/pages/notifications";
import AppNotificationsPage from "@/pages/app-notifications";
import SectionPage from "@/pages/section";
import {
  AllOperationsJournalPage,
  ExpenseJournalPage,
  IncomeJournalPage,
  TransferJournalPage,
} from "@/pages/finance/journal";
import FinanceDocumentPage from "@/pages/finance/document";
import SettlementsPage from "@/pages/finance/settlements";
import PnlReportPage from "@/pages/reports/pnl";
import CashFlowReportPage from "@/pages/reports/cash-flow";
import BalanceReportPage from "@/pages/reports/balance";
import { WorkspaceTabsProvider } from "@/lib/workspace-tabs";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <>
      <CommandPalette />
      <ChatWidget />
      <Component />
    </>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/orders" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/register">
        <PublicRoute component={RegisterPage} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/orders">
        <ProtectedRoute component={OrdersPage} />
      </Route>
      <Route path="/kanban">
        <ProtectedRoute component={KanbanPage} />
      </Route>
      <Route path="/finance">
        <ProtectedRoute component={AllOperationsJournalPage} />
      </Route>
      <Route path="/finance/classic">
        <ProtectedRoute component={FinancePage} />
      </Route>
      <Route path="/finance/income">
        <ProtectedRoute component={IncomeJournalPage} />
      </Route>
      <Route path="/finance/expense">
        <ProtectedRoute component={ExpenseJournalPage} />
      </Route>
      <Route path="/finance/transfers">
        <ProtectedRoute component={TransferJournalPage} />
      </Route>
      <Route path="/finance/settlements">
        <ProtectedRoute component={SettlementsPage} />
      </Route>
      <Route path="/finance/new/:kind">
        <ProtectedRoute component={FinanceDocumentPage} />
      </Route>
      <Route path="/finance/doc/:id">
        <ProtectedRoute component={FinanceDocumentPage} />
      </Route>
      <Route path="/warehouse">
        <ProtectedRoute component={WarehousePage} />
      </Route>
      <Route path="/lists">
        <ProtectedRoute component={ListsPage} />
      </Route>
      <Route path="/section/:key">
        <ProtectedRoute component={SectionPage} />
      </Route>
      <Route path="/reports/pnl">
        <ProtectedRoute component={PnlReportPage} />
      </Route>
      <Route path="/reports/cash-flow">
        <ProtectedRoute component={CashFlowReportPage} />
      </Route>
      <Route path="/reports/balance">
        <ProtectedRoute component={BalanceReportPage} />
      </Route>
      <Route path="/reports/dds">
        <ProtectedRoute component={DDSReportPage} />
      </Route>
      <Route path="/reports/profit">
        <ProtectedRoute component={ProfitReportPage} />
      </Route>
      <Route path="/reports/ar-ap">
        <ProtectedRoute component={ARAPReportPage} />
      </Route>
      <Route path="/reports/cash-total">
        <ProtectedRoute component={CashTotalReportPage} />
      </Route>
      <Route path="/audit-log">
        <ProtectedRoute component={AuditLogPage} />
      </Route>
      <Route path="/notifications">
        <ProtectedRoute component={NotificationsPage} />
      </Route>
      <Route path="/app-notifications">
        <ProtectedRoute component={AppNotificationsPage} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={ProfilePage} />
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ReportAccessProvider>
            <TooltipProvider>
              <Toaster />
              <WorkspaceTabsProvider>
                <Router />
              </WorkspaceTabsProvider>
            </TooltipProvider>
          </ReportAccessProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
