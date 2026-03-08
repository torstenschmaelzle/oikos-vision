import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export default function AuthRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Navigate to={user ? "/map" : "/login"} replace />;
}
