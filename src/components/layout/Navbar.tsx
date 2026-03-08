import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sun, LogIn, LogOut, User, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getNavItemsForRole } from "@/lib/roles";

export default function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();

  const links = user ? getNavItemsForRole(user.role) : [];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-50 glass border-b border-border/50"
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between h-16 px-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
            <Sun className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl text-foreground tracking-tight">
            Oikos <span className="text-gradient">Solar</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "text-primary bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <l.icon className="w-4 h-4" />
                {l.label}
                {active && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-2 right-2 h-0.5 gradient-primary rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}

          <div className="w-px h-6 bg-border mx-2" />

          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-muted">
                <User className="w-3.5 h-3.5" />
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity"
            >
              <LogIn className="w-4 h-4" />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </motion.header>
  );
}
