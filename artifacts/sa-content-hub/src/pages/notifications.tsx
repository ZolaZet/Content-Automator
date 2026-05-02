import {
  useListNotifications,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, CheckCheck, Clock, Send, XCircle, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const TYPE_META: Record<string, { icon: React.ElementType; className: string }> = {
  content_ready: { icon: Clock, className: "bg-accent/20 text-accent-foreground" },
  published: { icon: Send, className: "bg-primary/10 text-primary" },
  rejected: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  system: { icon: Info, className: "bg-muted text-muted-foreground" },
};

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
      onError: () => toast({ title: "Failed to mark read", variant: "destructive" }),
    });
  };

  const unreadCount = notifications?.filter(n => !n.read).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Notifications</h1>
            {unreadCount > 0 && <Badge className="bg-primary text-primary-foreground">{unreadCount}</Badge>}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">Stay updated on content generation and approvals</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !notifications?.length ? (
            <div className="py-16 text-center">
              <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No notifications yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.system;
                const Icon = meta.icon;
                return (
                  <li key={n.id} className={`px-5 py-4 flex items-start gap-3 transition-colors ${n.read ? "opacity-60" : "bg-background hover:bg-muted/20"}`} data-testid={`notification-${n.id}`}>
                    <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${meta.className}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{n.title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(n.createdAt).toLocaleString("en-ZA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {n.contentId && (
                            <Link href={`/content/${n.contentId}`}>
                              <Button variant="outline" size="sm" className="text-xs h-7" data-testid={`link-view-content-${n.id}`}>View</Button>
                            </Link>
                          )}
                          {!n.read && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkRead(n.id)} title="Mark as read" data-testid={`button-mark-read-${n.id}`}>
                              <CheckCheck className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
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
