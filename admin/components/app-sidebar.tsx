"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  School,
  Shield,
  ScrollText,
  TrendingDown,
  Smartphone,
  AlertTriangle,
  BookOpen,
  ListTodo,
  Settings,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { title: "Students", href: "/students", icon: Users },
      { title: "Schools", href: "/schools", icon: School },
      { title: "Moderation", href: "/moderation", icon: Shield },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Mobile app", href: "/mobile-app", icon: Smartphone },
      { title: "Uninstalls", href: "/uninstalls", icon: TrendingDown },
      { title: "Errors", href: "/errors", icon: AlertTriangle },
      { title: "Homework", href: "/homework", icon: ListTodo },
      { title: "Synced settings", href: "/settings", icon: Settings },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Lesson mappings", href: "/lessons", icon: BookOpen },
      { title: "Audit log", href: "/audit", icon: ScrollText },
    ],
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">
          BetterLectio Admin
        </span>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/api/auth/logout">
                <LogOut />
                <span>Sign out</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
