import { Map, Settings, Cpu, LucideIcon } from "lucide-react";
import type { AuthUser } from "./api";

export type AppRole = AuthUser["role"];

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
}

export const navItems: NavItem[] = [
  { to: "/map", label: "Map", icon: Map, roles: ["superadmin", "canton_admin", "canton_viewer"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["superadmin", "canton_admin"] },
  { to: "/api-settings", label: "API Settings", icon: Cpu, roles: ["superadmin"] },
];

export function getNavItemsForRole(role: AppRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

export function hasAccess(role: AppRole, allowedRoles: AppRole[]): boolean {
  return allowedRoles.includes(role);
}
