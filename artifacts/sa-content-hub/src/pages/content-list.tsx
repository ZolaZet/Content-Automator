import { useListContent, getListContentQueryKey, useDeleteContent, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useSearch, useLocation } from "wouter";
import { Link } from "wouter";
import { Clock, CheckCircle2, XCircle, FileText, Send, ChevronRight, ThumbsUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_META: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending_review: { label: "Pending Review", icon: Clock, className: "bg-accent/20 text-accent-foreground border-accent/30" },
  draft: { label: "Draft", icon: FileText, className: "bg-muted text-muted-foreground border-border" },
  approved: { label: "Approved", icon: ThumbsUp, className: "bg-secondary/15 text-secondary border-secondary/30" },
  published: { label: "Published", icon: Send, className: "bg-primary/10 text-primary border-primary/20" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function ContentList() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const statusFilter = params.get("status") as "draft" | "pending_review" | "approved" | "published" | "rejected" | undefined ?? undefined;

  const { data: entries, isLoading } = useListContent(
    statusFilter ? { status: statusFilter } : undefined,
    { query: { queryKey: getListContentQueryKey(statusFilter ? { status: statusFilter } : undefined) } }
  );

  const deleteContent = useDeleteContent();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteContent.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: "Entry deleted" });
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  };

  const handleStatusChange = (val: string) => {
    if (val === "all") setLocation("/content");
    else setLocation(`/content?status=${val}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Content Queue</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Review and approve generated business content</p>
        </div>
        <Select value={statusFilter ?? "all"} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !entries?.length ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {statusFilter ? `No content with status "${statusFilter}"` : "No content yet. Generate content from the dashboard."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const meta = STATUS_META[entry.status] ?? STATUS_META.draft;
                const Icon = meta.icon;
                return (
                  <li key={entry.id} data-testid={`row-content-${entry.id}`} className="group">
                    <div className="flex items-center hover:bg-muted/30 transition-colors">
                      <Link href={`/content/${entry.id}`} className="flex-1 min-w-0">
                        <div className="px-5 py-4 flex items-center gap-4 cursor-pointer">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${meta.className}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">{entry.businessName}</span>
                              <Badge variant="outline" className={`text-xs ${meta.className}`}>{meta.label}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {entry.standoutProduct && <span className="text-xs text-muted-foreground truncate max-w-[240px]">{entry.standoutProduct}</span>}
                              {entry.scheduledDate && <span className="text-xs text-muted-foreground">{entry.scheduledDate}</span>}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-3 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                        onClick={(e) => handleDelete(entry.id, e)}
                        disabled={deleteContent.isPending}
                        data-testid={`button-delete-content-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
