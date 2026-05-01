import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Sun, KeyRound, Loader2, AlertCircle } from "lucide-react";

export default function SetupAccountPage() {
  const { setupAccount } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (!token) { setError("Missing invitation token"); return; }
    setError(null);
    setLoading(true);
    try {
      await setupAccount(token, password);
      navigate("/map");
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-lg shadow-elevated p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-primary flex items-center justify-center">
              <Sun className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Set up your account</h1>
            <p className="text-sm text-muted-foreground">Choose a password to get started</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">New password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Min. 8 characters" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Confirm password</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Repeat password" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? "Setting up…" : "Set password & sign in"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
