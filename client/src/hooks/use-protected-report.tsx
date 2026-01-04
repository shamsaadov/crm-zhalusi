import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UseProtectedReportResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  PasswordDialog: React.ReactNode;
}

export function useProtectedReport<T>(
  queryKey: string[],
  enabled: boolean = true
): UseProtectedReportResult<T> {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState<boolean | null>(null);

  // Сначала проверяем, требуется ли пароль
  useEffect(() => {
    const checkPasswordRequired = async () => {
      try {
        const url = queryKey[0];
        const response = await fetch(url, {
          credentials: "include",
        });

        if (response.status === 403) {
          const errorData = await response.json();
          if (errorData.requiresPassword) {
            setPasswordRequired(true);
            setShowPasswordDialog(true);
            return;
          }
        }

        if (response.ok) {
          setPasswordRequired(false);
        }
      } catch (error) {
        console.error("Error checking password:", error);
      }
    };

    if (enabled && passwordRequired === null) {
      checkPasswordRequired();
    }
  }, [queryKey, enabled, passwordRequired]);

  const { data, error, isLoading, refetch } = useQuery<T>({
    queryKey,
    enabled: enabled && passwordRequired === false,
    retry: false,
  });

  const handlePasswordSubmit = useCallback(async () => {
    if (!password) {
      setPasswordError("Введите пароль");
      return;
    }

    setIsVerifying(true);
    setPasswordError("");

    try {
      const response = await fetch("/api/verify-report-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (result.valid) {
        setShowPasswordDialog(false);
        setPassword("");
        setPasswordRequired(false);
        // Повторно загружаем отчет
        setTimeout(() => refetch(), 100);
      } else {
        setPasswordError("Неверный пароль");
      }
    } catch (error) {
      setPasswordError("Ошибка проверки пароля");
    } finally {
      setIsVerifying(false);
    }
  }, [password, refetch]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handlePasswordSubmit();
      }
    },
    [handlePasswordSubmit]
  );

  const PasswordDialog = showPasswordDialog ? (
    <Dialog open={showPasswordDialog} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Требуется пароль</DialogTitle>
          <DialogDescription>
            Для доступа к этому отчету введите пароль отчетов
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="report-password">Пароль отчетов</Label>
            <Input
              id="report-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError("");
              }}
              onKeyPress={handleKeyPress}
              placeholder="Введите пароль"
              autoFocus
              disabled={isVerifying}
            />
          </div>

          {passwordError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handlePasswordSubmit} disabled={isVerifying}>
            {isVerifying ? "Проверка..." : "Подтвердить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return {
    data,
    isLoading: isLoading || showPasswordDialog,
    error,
    PasswordDialog,
  };
}

