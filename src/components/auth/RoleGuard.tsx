import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { AppRole } from "@/lib/roles";
import { hasAccess } from "@/lib/roles";

interface RoleGuardProps {
  allowed: AppRole[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user || !hasAccess(user.role, allowed)) {
    return <Navigate to="/map" replace />;
  }

  return <>{children}</>;
}
