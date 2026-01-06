import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
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

  return <Component />;
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
      <Route path="/finance">
        <ProtectedRoute component={FinancePage} />
      </Route>
      <Route path="/warehouse">
        <ProtectedRoute component={WarehousePage} />
      </Route>
      <Route path="/lists">
        <ProtectedRoute component={ListsPage} />
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
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
