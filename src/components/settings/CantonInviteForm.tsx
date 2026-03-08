import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { UserPlus, Send, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CantonInviteForm() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () => authApi.inviteUser(email.trim(), "canton_viewer"),
    onSuccess: (data) => {
      toast.success(data.message || "Invitation sent successfully");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["canton-users"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send invitation");
    },
  });

  const canSubmit = email.trim().length > 0 && email.includes("@") && !mutation.isPending;

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
          <h2 className="text-sm font-semibold text-foreground">Invite Canton Viewer</h2>
        </div>

        <div className="flex flex-wrap items-end gap-3">
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

          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!canSubmit}>
            {mutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send Invite
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          The user will be invited as a <span className="font-medium">Canton Viewer</span> in your canton.
        </p>
      </form>
    </motion.div>
  );
}
