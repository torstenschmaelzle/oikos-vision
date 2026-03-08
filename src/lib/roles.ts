import { Map, Settings, Terminal, LucideIcon } from "lucide-react";
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
  { to: "/settings", label: "User Settings", icon: Settings, roles: ["superadmin"] },
];

export function getNavItemsForRole(role: AppRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

export function hasAccess(role: AppRole, allowedRoles: AppRole[]): boolean {
  return allowedRoles.includes(role);
}
