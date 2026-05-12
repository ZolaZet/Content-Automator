import { useState } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  useTestSupabaseConnection,
  getGetSettingsQueryKey,
  useGenerateContent,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Save, Zap, Database, Mail, Clock,
  CheckCircle2, XCircle, AlertCircle, Loader2,
  ExternalLink, Eye, EyeOff, ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

type ConnectionStatus = "idle" | "testing" | "connected" | "error";

function ConnectionBadge({ status, error }: { status: ConnectionStatus; error?: string | null }) {
  if (status === "idle") return null;
  if (status === "testing") {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground border-muted-foreground/30">
        <Loader2 className="w-3 h-3 animate-spin" /> Testing…
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge variant="outline" className="gap-1.5 text-secondary border-secondary/40 bg-secondary/10">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-destructive border-destructive/40 bg-destructive/5">
      <XCircle className="w-3 h-3" /> {error ?? "Connection failed"}
    </Badge>
  );
}

const SUPABASE_SQL = `-- Run this in your Supabase project: SQL Editor → New query
create table if not exists featured_businesses (
  id            bigint primary key generated always as identity,
  created_at    timestamptz default now(),

  -- Business identity
  business_name       text not null,
  website_url         text,
  location            text,
  made_in_sa          text,

  -- Founder
  founder_name        text,
  founder_bio         text,

  -- Product
  standout_product    text,
  product_description text,

  -- Page content
  business_description text,
  call_to_action       text,

  -- Scheduling
  scheduled_date  text,
  published_at    timestamptz
);

-- Allow the hub to insert rows using your anon key
alter table featured_businesses enable row level security;

create policy "Allow anon insert"
  on featured_businesses for insert
  to anon
  with check (true);

create policy "Allow anon select"
  on featured_businesses for select
  to anon
  using (true);`;

function SqlSchema() {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
      >
        <span className="text-xs font-medium text-muted-foreground">View SQL schema to create your table</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs text-muted-foreground">Paste this into <strong>Supabase → SQL Editor → New query</strong></span>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 h-7 text-xs">
              {copied ? <><Check className="w-3 h-3 text-secondary" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy SQL</>}
            </Button>
          </div>
          <pre className="px-4 pb-4 text-[11px] leading-relaxed text-foreground font-mono overflow-x-auto whitespace-pre bg-muted/50 rounded-b-lg">
            {SUPABASE_SQL}
          </pre>
        </div>
      )}
    </div>
  );
}

function HowToFind({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
      >
        <span className="text-xs font-medium text-muted-foreground">Where do I find these?</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
          <div>
            <p className="font-semibold text-foreground mb-1">1. Open your Supabase project</p>
            <p>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">supabase.com/dashboard <ExternalLink className="w-2.5 h-2.5" /></a> and select your project.</p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">2. Find your Project URL</p>
            <p>Go to <span className="font-mono bg-muted px-1 rounded">Settings → API</span> and copy the <strong>Project URL</strong> (looks like <span className="font-mono bg-muted px-1 rounded">https://abcxyz.supabase.co</span>).</p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">3. Copy your Anon Key</p>
            <p>On the same page, copy the <strong>anon public</strong> key under <span className="font-mono bg-muted px-1 rounded">Project API keys</span>. It starts with <span className="font-mono bg-muted px-1 rounded">eyJ…</span></p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">4. Table name (add later)</p>
            <p>You can leave this blank for now and fill it in once you've created your Lovable project and set up your content table.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const testConnection = useTestSupabaseConnection();
  const generateContent = useGenerateContent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [connProjectRef, setConnProjectRef] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

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

  const handleTestConnection = () => {
    const url = form.getValues("supabaseUrl");
    const key = form.getValues("supabaseAnonKey");
    if (!url || !key) {
      toast({ title: "Enter your Project URL and Anon Key first", variant: "destructive" });
      return;
    }
    setConnStatus("testing");
    setConnError(null);
    setConnProjectRef(null);
    testConnection.mutate(
      { data: { supabaseUrl: url, supabaseAnonKey: key } },
      {
        onSuccess: (result) => {
          if (result.connected) {
            setConnStatus("connected");
            setConnProjectRef(result.projectRef ?? null);
            toast({ title: "Supabase connected!", description: result.projectRef ? `Project: ${result.projectRef}` : undefined });
          } else {
            setConnStatus("error");
            setConnError(result.error ?? "Connection failed");
          }
        },
        onError: () => {
          setConnStatus("error");
          setConnError("Could not reach Supabase");
        },
      }
    );
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
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  const alreadyConfigured = settings?.supabaseConfigured ?? false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your content automation pipeline</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">

          {/* ── Supabase Connection ── */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Supabase Connection</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {alreadyConfigured && connStatus === "idle" && (
                    <Badge variant="outline" className="gap-1.5 text-secondary border-secondary/40 bg-secondary/10">
                      <CheckCircle2 className="w-3 h-3" /> Configured
                    </Badge>
                  )}
                  {(!alreadyConfigured && connStatus === "idle") && (
                    <Badge variant="outline" className="gap-1.5 text-muted-foreground border-muted-foreground/30">
                      <AlertCircle className="w-3 h-3" /> Not connected
                    </Badge>
                  )}
                  <ConnectionBadge status={connStatus} error={connError} />
                </div>
              </div>
              <CardDescription>
                Connect to your Supabase project so approved content can be published automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {connStatus === "connected" && connProjectRef && (
                <div className="flex items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/8 px-3 py-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0" />
                  <span className="text-secondary font-medium">Connected to <span className="font-mono">{connProjectRef}</span></span>
                </div>
              )}

              <FormField control={form.control} name="supabaseUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://xxxxxxxxxxxx.supabase.co"
                      {...field}
                      onChange={(e) => { field.onChange(e); setConnStatus("idle"); }}
                      data-testid="input-supabase-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="supabaseAnonKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Anon Key</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        placeholder="eyJhbGci…"
                        {...field}
                        onChange={(e) => { field.onChange(e); setConnStatus("idle"); }}
                        className="pr-10"
                        data-testid="input-supabase-anon-key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormDescription>Your public anon key — safe to use in the browser</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={connStatus === "testing"}
                className="gap-2 w-full"
                data-testid="button-test-supabase"
              >
                {connStatus === "testing"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing connection…</>
                  : <><Database className="w-4 h-4" /> Test Connection</>}
              </Button>

              <div className="border-t border-border pt-4">
                <FormField control={form.control} name="supabaseTableName" render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>Table Name</FormLabel>
                      <span className="text-[10px] font-medium text-muted-foreground border border-muted-foreground/30 rounded px-1.5 py-0.5">optional</span>
                    </div>
                    <FormControl>
                      <Input placeholder="e.g. featured_businesses" {...field} data-testid="input-supabase-table" />
                    </FormControl>
                    <FormDescription>
                      The table that holds your page content. You can add this later once your Lovable project is ready.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <SqlSchema />
              <HowToFind open={howToOpen} onToggle={() => setHowToOpen(o => !o)} />
            </CardContent>
          </Card>

          {/* ── Notifications ── */}
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

          {/* ── Schedule ── */}
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

      {/* ── Manual Trigger ── */}
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
