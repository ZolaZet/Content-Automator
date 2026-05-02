import { Link, useLocation } from "wouter";
import { LayoutDashboard, Building2, FileText, Bell, Settings, Menu, X, Flag } from "lucide-react";
import { useState } from "react";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/content", label: "Content Queue", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({ href, label, icon: Icon, unread, onClick }: {
  href: string; label: string; icon: React.ElementType; unread?: number; onClick?: () => void;
}) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link href={href} onClick={onClick}>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {unread ? <Badge className="bg-accent text-accent-foreground text-xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center">{unread}</Badge> : null}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: notifications } = useListNotifications(undefined, {
    query: { queryKey: getListNotificationsQueryKey() },
  });
  const unreadCount = notifications?.filter(n => !n.read).length ?? 0;

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Flag className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm text-sidebar-foreground leading-tight" style={{ fontFamily: "var(--app-font-serif)" }}>SA Content Hub</p>
            <p className="text-xs text-muted-foreground">Proudly South African</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.href}
            {...item}
            unread={item.href === "/notifications" ? unreadCount : undefined}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground leading-relaxed">One new SA business featured every day.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 bg-sidebar border-r border-sidebar-border">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex flex-col w-56 h-full bg-sidebar border-r border-sidebar-border">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)} data-testid="button-mobile-menu">
            <Menu className="w-4 h-4" />
          </Button>
          <span className="font-bold text-sm" style={{ fontFamily: "var(--app-font-serif)" }}>SA Content Hub</span>
        </header>
        <main className="flex-1 p-5 lg:p-7 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
