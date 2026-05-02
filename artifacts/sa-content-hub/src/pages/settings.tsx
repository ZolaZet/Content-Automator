import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  useGenerateContent,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Zap, Database, Mail, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  notificationEmail: z.string().email("Must be a valid email").or(z.literal("")).optional(),
  supabaseUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  supabaseAnonKey: z.string().optional(),
  supabaseTableName: z.string().optional(),
  dailyScheduleTime: z.string().optional(),
  emailNotificationsEnabled: z.boolean(),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const generateContent = useGenerateContent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      notificationEmail: settings?.notificationEmail ?? "",
      supabaseUrl: settings?.supabaseUrl ?? "",
      supabaseAnonKey: "",
      supabaseTableName: settings?.supabaseTableName ?? "",
      dailyScheduleTime: settings?.dailyScheduleTime ?? "08:00",
      emailNotificationsEnabled: settings?.emailNotificationsEnabled ?? false,
    },
  });

  const handleSave = (values: SettingsValues) => {
    updateSettings.mutate({
      data: {
        notificationEmail: values.notificationEmail || null,
        supabaseUrl: values.supabaseUrl || null,
        supabaseAnonKey: values.supabaseAnonKey || undefined,
        supabaseTableName: values.supabaseTableName || null,
        dailyScheduleTime: values.dailyScheduleTime || null,
        emailNotificationsEnabled: values.emailNotificationsEnabled,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings saved" });
      },
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    });
  };

  const handleManualGenerate = () => {
    generateContent.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: "Content generated", description: "New content is ready for review." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Generation failed";
        toast({ title: "Generation failed", description: msg, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your content automation pipeline</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Notifications</CardTitle>
              </div>
              <CardDescription>Get notified when new content is ready for QA</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="notificationEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notification Email</FormLabel>
                  <FormControl><Input type="email" placeholder="you@example.com" {...field} data-testid="input-notification-email" /></FormControl>
                  <FormDescription>We'll email you when content is ready for your review</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="emailNotificationsEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Enable email notifications</FormLabel>
                    <FormDescription className="text-xs">Send an email each time content is generated</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-email-notifications" />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Supabase Connection</CardTitle>
              </div>
              <CardDescription>Connect your Lovable site's Supabase database to auto-publish content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="supabaseUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase Project URL</FormLabel>
                  <FormControl><Input placeholder="https://xxxx.supabase.co" {...field} data-testid="input-supabase-url" /></FormControl>
                  <FormDescription>Found in your Supabase project settings under API</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="supabaseAnonKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase Anon Key</FormLabel>
                  <FormControl><Input type="password" placeholder="eyJhbGci..." {...field} data-testid="input-supabase-anon-key" /></FormControl>
                  <FormDescription>Your public anon key from Supabase API settings</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="supabaseTableName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase Table Name</FormLabel>
                  <FormControl><Input placeholder="e.g. featured_businesses" {...field} data-testid="input-supabase-table" /></FormControl>
                  <FormDescription>The table in your Lovable site's database that holds page content</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Schedule</CardTitle>
              </div>
              <CardDescription>When to automatically generate each day's content</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="dailyScheduleTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Daily generation time (SAST)</FormLabel>
                  <FormControl><Input type="time" {...field} className="w-36" data-testid="input-schedule-time" /></FormControl>
                  <FormDescription>Content is generated once per day at this time</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Button type="submit" disabled={updateSettings.isPending} className="gap-1.5" data-testid="button-save-settings">
            <Save className="w-4 h-4" />
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </Form>

      <Card className="shadow-sm border-dashed border-muted-foreground/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <CardTitle className="text-base">Manual Trigger</CardTitle>
          </div>
          <CardDescription>Generate content immediately without waiting for the daily schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleManualGenerate}
            disabled={generateContent.isPending}
            className="gap-2"
            data-testid="button-manual-generate"
          >
            <Zap className="w-4 h-4" />
            {generateContent.isPending ? "Generating..." : "Generate Now"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Picks the next pending business, generates AI content, and sends you a notification.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
