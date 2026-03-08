import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { UserPlus, Send, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const INVITE_ROLES = [
  { value: "canton_admin", label: "Canton Admin" },
  { value: "canton_viewer", label: "Canton Viewer" },
] as const;

type InviteRole = (typeof INVITE_ROLES)[number]["value"];

export default function InviteUserForm() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("canton_admin");
  const [cantonCode, setCantonCode] = useState("");

  const needsCanton = role === "canton_admin";

  const mutation = useMutation({
    mutationFn: async () => {
      if (role === "canton_admin") {
        return authApi.createCantonAdmin(email.trim(), cantonCode.trim().toUpperCase());
      }
      return authApi.inviteUser(email.trim(), role);
    },
    onSuccess: (data) => {
      toast.success(data.message || "Invitation sent successfully");
      setEmail("");
      setCantonCode("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send invitation");
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    email.includes("@") &&
    (!needsCanton || cantonCode.trim().length >= 2) &&
    !mutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) mutation.mutate();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Invite User</h2>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Role */}
          <div className="space-y-1.5 min-w-[150px]">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email */}
          <div className="space-y-1.5 flex-1 min-w-[220px]">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              placeholder="user@example.ch"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 text-sm"
              required
            />
          </div>

          {/* Canton (conditional) */}
          {needsCanton && (
            <div className="space-y-1.5 min-w-[100px] w-[120px]">
              <Label className="text-xs text-muted-foreground">Canton Code</Label>
              <Input
                placeholder="ZH"
                value={cantonCode}
                onChange={(e) => setCantonCode(e.target.value)}
                className="h-9 text-sm uppercase"
                maxLength={2}
                required
              />
            </div>
          )}

          {/* Submit */}
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!canSubmit}>
            {mutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send Invite
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
