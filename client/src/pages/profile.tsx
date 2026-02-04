import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Check, Eye, EyeOff, CalendarDays, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PasswordStrength, PasswordHint } from "@/components/password-strength";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  hasReportPassword: boolean;
  createdAt: string | null;
}

const profileSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().optional(),
  currentPassword: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(6, "Минимум 6 символов"),
  confirmPassword: z.string().min(1, "Подтвердите пароль"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

const reportPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  reportPassword: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;
type ReportPasswordFormValues = z.infer<typeof reportPasswordSchema>;

// Компонент Input с возможностью показать/скрыть пароль
function PasswordInput({ 
  value, 
  onChange, 
  placeholder,
  "data-testid": dataTestId 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  placeholder?: string;
  "data-testid"?: string;
}) {
  const [show, setShow] = useState(false);
  
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={dataTestId}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { toast } = useToast();
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      email: "",
      name: "",
      currentPassword: "",
    },
  });

  // Отслеживаем изменение email для показа поля пароля
  const watchedEmail = profileForm.watch("email");
  const emailChanged = profile && watchedEmail !== profile.email;

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        email: profile.email,
        name: profile.name || "",
        currentPassword: "",
      });
    }
  }, [profile, profileForm]);

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const reportPasswordForm = useForm<ReportPasswordFormValues>({
    resolver: zodResolver(reportPasswordSchema),
    defaultValues: {
      currentPassword: "",
      reportPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) => apiRequest("PATCH", "/api/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      profileForm.setValue("currentPassword", "");
      toast({ 
        title: "Профиль сохранён",
        description: "Ваши данные успешно обновлены",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormValues) => 
      apiRequest("PATCH", "/api/profile", { 
        currentPassword: data.currentPassword, 
        newPassword: data.newPassword 
      }),
    onSuccess: () => {
      passwordForm.reset();
      toast({ 
        title: "Пароль изменён",
        description: "Новый пароль успешно установлен",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const updateReportPasswordMutation = useMutation({
    mutationFn: (data: ReportPasswordFormValues) => 
      apiRequest("POST", "/api/profile/report-password", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      reportPasswordForm.reset();
      toast({ 
        title: "Пароль для отчётов обновлён",
        description: reportPasswordForm.getValues("reportPassword") 
          ? "Защита отчётов активирована" 
          : "Защита отчётов отключена",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const onSubmitProfile = (data: ProfileFormValues) => {
    // Если email изменён, проверяем что пароль введён
    if (emailChanged && !data.currentPassword) {
      profileForm.setError("currentPassword", { 
        message: "Введите пароль для подтверждения смены email" 
      });
      return;
    }
    updateProfileMutation.mutate(data);
  };

  const onSubmitPassword = (data: PasswordFormValues) => {
    updatePasswordMutation.mutate(data);
  };

  const onSubmitReportPassword = (data: ReportPasswordFormValues) => {
    updateReportPasswordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Layout title="Профиль">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Профиль">
      <div className="max-w-2xl space-y-6">
        {/* Информация об аккаунте */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Информация об аккаунте
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Дата регистрации</p>
                <p className="font-medium">
                  {profile?.createdAt 
                    ? format(new Date(profile.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })
                    : "—"
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{profile?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Основные данные */}
        <Card>
          <CardHeader>
            <CardTitle>Основные данные</CardTitle>
            <CardDescription>Ваш email и имя для отображения</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя (опционально)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Поле пароля появляется только при изменении email */}
                {emailChanged && (
                  <FormField
                    control={profileForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Текущий пароль</FormLabel>
                        <FormControl>
                          <PasswordInput 
                            value={field.value || ""} 
                            onChange={field.onChange}
                            data-testid="input-profile-password"
                          />
                        </FormControl>
                        <FormDescription>
                          Требуется для подтверждения смены email
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Сохранить
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Изменить пароль */}
        <Card>
          <CardHeader>
            <CardTitle>Изменить пароль</CardTitle>
            <CardDescription>Пароль для входа в систему</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Текущий пароль</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          value={field.value} 
                          onChange={field.onChange}
                          data-testid="input-current-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Новый пароль</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          value={field.value} 
                          onChange={field.onChange}
                          data-testid="input-new-password"
                        />
                      </FormControl>
                      <PasswordStrength password={field.value} className="mt-2" />
                      <PasswordHint />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Подтвердите пароль</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          value={field.value} 
                          onChange={field.onChange}
                          data-testid="input-confirm-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={updatePasswordMutation.isPending} data-testid="button-change-password">
                  {updatePasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Изменить пароль
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Пароль для отчётов */}
        <Card>
          <CardHeader>
            <CardTitle>Пароль для отчётов</CardTitle>
            <CardDescription>
              Защитите отчёты ДДС и Прибыль дополнительным паролем.
              {profile?.hasReportPassword && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 mt-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Пароль установлен
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...reportPasswordForm}>
              <form onSubmit={reportPasswordForm.handleSubmit(onSubmitReportPassword)} className="space-y-4">
                <FormField
                  control={reportPasswordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пароль от аккаунта</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          value={field.value} 
                          onChange={field.onChange}
                          data-testid="input-account-password-for-report"
                        />
                      </FormControl>
                      <FormDescription>
                        Требуется для подтверждения
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reportPasswordForm.control}
                  name="reportPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{profile?.hasReportPassword ? "Новый пароль для отчётов" : "Пароль для отчётов"}</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          value={field.value || ""} 
                          onChange={field.onChange}
                          placeholder="Оставьте пустым для отключения"
                          data-testid="input-report-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={updateReportPasswordMutation.isPending} data-testid="button-save-report-password">
                  {updateReportPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {profile?.hasReportPassword ? "Обновить" : "Установить"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
