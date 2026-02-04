import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
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
import { AlertCircle, Lock, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";

interface UserProfile {
  hasReportPassword: boolean;
}

interface ReportAccessContextType {
  isUnlocked: boolean;
  hasReportPassword: boolean | null;
  isLoading: boolean;
  requestAccess: (onSuccess?: () => void, onCancel?: () => void) => void;
  lock: () => void;
}

const ReportAccessContext = createContext<ReportAccessContextType | null>(null);

const SESSION_KEY = "report_access_unlocked";

export function ReportAccessProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  });
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | null>(null);
  const [onCancelCallback, setOnCancelCallback] = useState<(() => void) | null>(null);

  // Проверяем, установлен ли пароль у пользователя
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const hasReportPassword = profile?.hasReportPassword ?? null;

  // Если пароль не установлен — автоматически разблокируем
  useEffect(() => {
    if (hasReportPassword === false && !isUnlocked) {
      setIsUnlocked(true);
      sessionStorage.setItem(SESSION_KEY, "true");
    }
  }, [hasReportPassword, isUnlocked]);

  const requestAccess = useCallback((onSuccess?: () => void, onCancel?: () => void) => {
    // Если уже разблокировано или пароль не установлен
    if (isUnlocked || hasReportPassword === false) {
      onSuccess?.();
      return;
    }

    setOnSuccessCallback(() => onSuccess || null);
    setOnCancelCallback(() => onCancel || null);
    setShowDialog(true);
    setPassword("");
    setError("");
    setShowPassword(false);
  }, [isUnlocked, hasReportPassword]);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!password) {
      setError("Введите пароль");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/verify-report-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (result.valid) {
        setIsUnlocked(true);
        sessionStorage.setItem(SESSION_KEY, "true");
        setShowDialog(false);
        setPassword("");
        onSuccessCallback?.();
      } else {
        setError("Неверный пароль");
      }
    } catch {
      setError("Ошибка проверки пароля");
    } finally {
      setIsVerifying(false);
    }
  }, [password, onSuccessCallback]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setPassword("");
    setError("");
    onCancelCallback?.();
  }, [onCancelCallback]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSubmit, handleCancel]
  );

  return (
    <ReportAccessContext.Provider
      value={{
        isUnlocked: isUnlocked || hasReportPassword === false,
        hasReportPassword,
        isLoading,
        requestAccess,
        lock,
      }}
    >
      {children}

      <Dialog open={showDialog} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Защищённый раздел
            </DialogTitle>
            <DialogDescription>
              Для доступа к финансовым отчётам введите пароль
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-password">Пароль отчётов</Label>
              <div className="relative">
                <Input
                  id="report-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Введите пароль"
                  autoFocus
                  disabled={isVerifying}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancel} disabled={isVerifying}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} disabled={isVerifying || !password}>
              {isVerifying ? "Проверка..." : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReportAccessContext.Provider>
  );
}

export function useReportAccess() {
  const context = useContext(ReportAccessContext);
  if (!context) {
    throw new Error("useReportAccess must be used within ReportAccessProvider");
  }
  return context;
}
