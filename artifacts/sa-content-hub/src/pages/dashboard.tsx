import { useGetDashboardStats, getGetDashboardStatsQueryKey, useListContent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "wouter";
import { Building2, Clock, CheckCircle2, ThumbsUp, TrendingUp, Calendar, ArrowRight, Zap, FileText, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGenerateContent } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function StatCard({ icon: Icon, label, value, color, isLoading, href }: {
  icon: React.ElementType;
  label: string;
  value: number | string | undefined;
  color: string;
  isLoading: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={`shadow-sm transition-all duration-200 ${href ? "hover:shadow-md hover:ring-2 hover:ring-primary/20 cursor-pointer" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-7 w-12 mb-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function activityIcon(type: string) {
  if (type === "content_generated") return "bg-primary/10 text-primary";
  if (type === "content_approved") return "bg-secondary/10 text-secondary";
  if (type === "content_rejected") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const { data: draftEntries, isLoading: isDraftsLoading } = useListContent({ status: "draft" });
  const generate = useGenerateContent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: "Content generated", description: "New content is ready for your review." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Generation failed";
        toast({ title: "Generation failed", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Your daily SA content pipeline</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generate.isPending}
          data-testid="button-generate-content"
          className="gap-2"
        >
          <Zap className="w-4 h-4" />
          {generate.isPending ? "Generating..." : "Generate Today's Content"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Building2} label="Total Businesses" value={stats?.totalBusinesses} color="bg-primary/10 text-primary" isLoading={isLoading} href="/businesses" />
        <StatCard icon={Clock} label="Pending Review" value={stats?.pendingReview} color="bg-accent/20 text-accent-foreground" isLoading={isLoading} href="/content?status=pending_review" />
        <StatCard icon={FileText} label="Draft Queue" value={draftEntries?.length} color="bg-muted text-muted-foreground" isLoading={isDraftsLoading} href="/content?status=draft" />
        <StatCard icon={ThumbsUp} label="Approved Queue" value={stats?.approvedQueue} color="bg-secondary/10 text-secondary" isLoading={isLoading} href="/content?status=approved" />
        <StatCard icon={CheckCircle2} label="Published This Month" value={stats?.publishedThisMonth} color="bg-chart-4/10 text-chart-4" isLoading={isLoading} href="/content?status=published" />
        <StatCard icon={TrendingUp} label="Total Published" value={stats?.totalPublished} color="bg-primary/10 text-primary" isLoading={isLoading} href="/content?status=published" />
      </div>

      {stats?.nextScheduledDate && (
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <p className="text-sm font-medium text-foreground">
              Next scheduled generation: <span className="text-primary font-semibold">{stats.nextScheduledDate}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Draft Queue</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Saved content that still needs review</p>
            </div>
            <Link href="/content?status=draft">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="link-view-all-drafts">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isDraftsLoading ? (
            <div className="px-5 pb-4 space-y-3">
              {[1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
            </div>
          ) : draftEntries?.length ? (
            <ul className="divide-y divide-border">
              {draftEntries.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <Link href={`/content/${entry.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{entry.businessName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.standoutProduct || "Draft content"}
                        {entry.generatedAt && ` · ${new Date(entry.generatedAt).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No saved drafts yet.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <Link href="/content">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="link-view-all-content">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-6 pb-4 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : stats?.recentActivity?.length ? (
              <ul className="divide-y divide-border">
                {stats.recentActivity.slice(0, 8).map((item) => (
                  <li key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activityIcon(item.type).split(" ")[0]}`} />
                    <span className="text-sm text-foreground flex-1 leading-snug">{item.description}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No activity yet — generate your first content above.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Link href="/businesses">
              <Button variant="outline" className="w-full justify-start gap-2 h-10" data-testid="link-manage-businesses">
                <Building2 className="w-4 h-4 text-primary" />
                Manage business seed list
              </Button>
            </Link>
            <Link href="/content?status=pending_review">
              <Button variant="outline" className="w-full justify-start gap-2 h-10" data-testid="link-review-content">
                <Clock className="w-4 h-4 text-accent" />
                Review pending content
                {(stats?.pendingReview ?? 0) > 0 && (
                  <Badge className="ml-auto" variant="secondary">{stats?.pendingReview}</Badge>
                )}
              </Button>
            </Link>
            <Link href="/notifications">
              <Button variant="outline" className="w-full justify-start gap-2 h-10" data-testid="link-notifications">
                <CheckCircle2 className="w-4 h-4 text-secondary" />
                View notifications
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" className="w-full justify-start gap-2 h-10" data-testid="link-settings">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                Configure settings & Supabase
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
