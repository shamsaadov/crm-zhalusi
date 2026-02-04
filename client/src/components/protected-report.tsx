import { useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useReportAccess } from "@/contexts/report-access-context";
import { Layout } from "@/components/layout";
import { Loader2, Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProtectedReportProps {
  children: ReactNode;
  title: string;
  fallbackUrl?: string;
}

export function ProtectedReport({ children, title, fallbackUrl = "/" }: ProtectedReportProps) {
  const { isUnlocked, isLoading, requestAccess, hasReportPassword } = useReportAccess();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Если пароль установлен и доступ не разблокирован — запрашиваем пароль
    if (!isLoading && hasReportPassword && !isUnlocked) {
      requestAccess(
        undefined,
        () => setLocation(fallbackUrl) // При отмене — возврат назад
      );
    }
  }, [isLoading, hasReportPassword, isUnlocked, requestAccess, setLocation, fallbackUrl]);

  // Показываем загрузку пока проверяем профиль
  if (isLoading) {
    return (
      <Layout title={title}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  // Если доступ не разблокирован — показываем заглушку (диалог уже открыт через useEffect)
  if (hasReportPassword && !isUnlocked) {
    return (
      <Layout title={title}>
        <div className="flex items-center justify-center py-24">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle>Требуется авторизация</CardTitle>
              <CardDescription>
                Этот раздел защищён паролем отчётов
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                onClick={() => requestAccess(undefined, () => setLocation(fallbackUrl))}
                className="w-full"
              >
                Ввести пароль
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation(fallbackUrl)}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Вернуться назад
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Доступ разблокирован — показываем контент
  return <>{children}</>;
}
