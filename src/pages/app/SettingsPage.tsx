import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Search, AlertCircle, UserX, Filter } from "lucide-react";
import DeleteUserButton from "@/components/settings/DeleteUserButton";
import { authApi } from "@/lib/api";
import InviteUserForm from "@/components/settings/InviteUserForm";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type UserRecord = {
  id: number;
  email: string;
  role: string;
  canton_code: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "superadmin", label: "Superadmin" },
  { value: "canton_admin", label: "Canton Admin" },
  { value: "canton_viewer", label: "Canton Viewer" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function roleBadgeVariant(role: string) {
  switch (role) {
    case "superadmin": return "default";
    case "canton_admin": return "secondary";
    default: return "outline";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function SettingsPage() {
  const { user } = useAuth();

  const [roleFilter, setRoleFilter] = useState("canton_admin");
  const [cantonFilter, setCantonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: users, isLoading, isError, error } = useQuery<UserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: () => authApi.users(),
    staleTime: 30_000,
  });

  const cantonOptions = useMemo(() => {
    if (!users) return [];
    const codes = [...new Set(users.map((u) => u.canton_code).filter(Boolean))] as string[];
    return codes.sort();
  }, [users]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (cantonFilter !== "all" && u.canton_code !== cantonFilter) return false;
        if (statusFilter === "active" && !u.is_active) return false;
        if (statusFilter === "inactive" && u.is_active) return false;
        if (q && !u.email.toLowerCase().includes(q) && !(u.canton_code ?? "").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [users, roleFilter, cantonFilter, statusFilter, search]);

  if (user?.role !== "superadmin") return <Navigate to="/map" replace />;

  return (
    <div className="flex-1 bg-gradient-to-b from-secondary to-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* 1. Intro */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Users className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">User Settings</h1>
              <p className="text-muted-foreground text-sm">
                Manage the users who can access and work with your data.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 2. Invite */}
        <InviteUserForm />

        {/* 3. Filters */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Filter Users</h2>
            </div>
            <p className="text-xs text-muted-foreground">Use these filters to find and review users.</p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[140px]">
                <label className="text-xs font-medium text-muted-foreground">Role</label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-[120px]">
                <label className="text-xs font-medium text-muted-foreground">Canton</label>
                <Select value={cantonFilter} onValueChange={setCantonFilter}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cantons</SelectItem>
                    {cantonOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-[110px]">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Email or canton code…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 4. Users list */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Managed Users</h2>
              {!isLoading && !isError && (
                <Badge variant="outline" className="text-xs">{filtered.length}</Badge>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 text-destructive space-y-2">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm font-medium">Failed to load users</p>
                <p className="text-xs text-muted-foreground">{(error as Error)?.message}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
                <UserX className="w-8 h-8" />
                <p className="text-sm font-medium">No users match the current filters</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Canton</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(u.role) as any} className="text-xs capitalize">
                            {u.role.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.canton_code ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.is_active ? "text-primary" : "text-muted-foreground"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-primary" : "bg-muted-foreground/40"}`} />
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDate(u.created_at)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDate(u.last_login_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
