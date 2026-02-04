import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

interface StrengthResult {
  score: number; // 0-4
  label: string;
  color: string;
}

function calculateStrength(password: string): StrengthResult {
  if (!password) {
    return { score: 0, label: "", color: "" };
  }

  let score = 0;

  // Длина
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;

  // Содержит буквы
  if (/[a-zA-Zа-яА-Я]/.test(password)) score++;

  // Содержит цифры
  if (/\d/.test(password)) score++;

  // Содержит спецсимволы
  if (/[^a-zA-Zа-яА-Я0-9]/.test(password)) score++;

  // Нормализуем до 4
  const normalizedScore = Math.min(4, score);

  const labels: Record<number, { label: string; color: string }> = {
    0: { label: "", color: "" },
    1: { label: "Слабый", color: "bg-red-500" },
    2: { label: "Средний", color: "bg-orange-500" },
    3: { label: "Хороший", color: "bg-yellow-500" },
    4: { label: "Сильный", color: "bg-green-500" },
  };

  return {
    score: normalizedScore,
    ...labels[normalizedScore],
  };
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const strength = useMemo(() => calculateStrength(password), [password]);

  if (!password) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              level <= strength.score ? strength.color : "bg-muted"
            )}
          />
        ))}
      </div>
      {strength.label && (
        <p className={cn(
          "text-xs",
          strength.score <= 1 && "text-red-500",
          strength.score === 2 && "text-orange-500",
          strength.score === 3 && "text-yellow-600",
          strength.score >= 4 && "text-green-500"
        )}>
          {strength.label}
        </p>
      )}
    </div>
  );
}

export function PasswordHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Минимум 6 символов. Рекомендуем использовать буквы, цифры и спецсимволы.
    </p>
  );
}
