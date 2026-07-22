import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  CalendarCheck2,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Settings,
  Users,
  Layers,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const navMain = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Persone", path: "/people" },
  { icon: BriefcaseBusiness, label: "Progetti", path: "/projects" },
  { icon: Layers, label: "Staffing", path: "/staffing" },
];

const navCalendar = [
  { icon: CalendarDays, label: "Settimanale", path: "/calendar/weekly" },
  { icon: CalendarRange, label: "Mensile", path: "/calendar/monthly" },
  { icon: CalendarCheck2, label: "Annuale", path: "/calendar/yearly" },
];

const SIDEBAR_WIDTH_KEY = "wfm-sidebar-width";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="flex flex-col items-center gap-8 p-10 max-w-md w-full">
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center mb-2">
              <BarChart3 className="h-7 w-7 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white text-center">
              WorkForce Manager
            </h1>
            <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
              Pianifica, monitora e ottimizza le allocazioni del tuo team sui progetti aziendali.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition-all"
          >
            Accedi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const allItems = [...navMain, ...navCalendar];
  const activeItem = allItems.find(i => i.path === location || (i.path !== "/" && location.startsWith(i.path)));

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newW = e.clientX - left;
      if (newW >= MIN_WIDTH && newW <= MAX_WIDTH) setSidebarWidth(newW);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/50">
            <div className="flex items-center gap-3 px-3">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors shrink-0"
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <span className="font-semibold text-sidebar-foreground tracking-tight truncate text-sm">
                    WorkForce Manager
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Content */}
          <SidebarContent className="pt-3 gap-0 scrollbar-thin">
            {/* Main nav */}
            <SidebarGroup className="px-2 pb-2">
              {!isCollapsed && (
                <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                  Principale
                </SidebarGroupLabel>
              )}
              <SidebarMenu>
                {navMain.map(item => {
                  const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:text-sidebar-foreground data-[active=true]:bg-sidebar-accent"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>

            {/* Calendar nav */}
            <SidebarGroup className="px-2 pb-2">
              {!isCollapsed && (
                <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                  Calendario
                </SidebarGroupLabel>
              )}
              <SidebarMenu>
                {navCalendar.map(item => {
                  const isActive = location.startsWith(item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:text-sidebar-foreground data-[active=true]:bg-sidebar-accent"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>

            {/* Settings */}
            <SidebarGroup className="px-2 mt-auto">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={location === "/settings"}
                    onClick={() => setLocation("/settings")}
                    tooltip="Impostazioni"
                    className="h-9 font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:text-sidebar-foreground data-[active=true]:bg-sidebar-accent"
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Impostazioni</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-indigo-500/20 text-indigo-300">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                        {user?.name ?? "Utente"}
                      </p>
                      <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
                        {user?.email ?? ""}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors z-50"
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </div>

      <SidebarInset className="bg-background">
        {/* Mobile header */}
        {isMobile && (
          <div className="flex border-b h-14 items-center gap-3 bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
            <SidebarTrigger className="h-9 w-9 rounded-lg" />
            <span className="font-medium text-sm">{activeItem?.label ?? "Menu"}</span>
          </div>
        )}
        <main className="flex-1 min-h-screen p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
