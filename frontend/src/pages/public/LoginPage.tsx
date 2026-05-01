import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sun, LogIn, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      console.info("[Login] Starting login…");
      await login(email, password);
      console.info("[Login] Login succeeded, navigating to /map");
      navigate("/map");
    } catch (err: any) {
      const msg = err?.message ?? "Login failed";
      console.error("[Login] Error:", msg);
      if (msg.includes("CORS") || msg.includes("Network")) {
        setError("Cannot reach the server. The backend may need to allow this origin in its CORS settings.");
      } else if (msg.includes("401")) {
        setError("Invalid email or password.");
      } else if (msg.includes("403")) {
        setError("Account not activated or temporarily locked.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-lg shadow-elevated p-8 space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-primary flex items-center justify-center">
              <Sun className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Sign in to Oikos</h1>
            <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
