import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "react-router-dom";
import AdminSidebar, { type AdminSection } from "@/components/admin/AdminSidebar";
import LogViewerPanel from "@/components/admin/LogViewerPanel";
import TestApiPanel from "@/components/admin/TestApiPanel";

export default function ApiSettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>("app");

  if (user?.role !== "superadmin") return <Navigate to="/map" replace />;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col bg-background"
    >
      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0">
        <AdminSidebar active={section} onChange={setSection} />

        <div className="flex-1 min-w-0 flex flex-col">
          {section === "app" && <LogViewerPanel channel="app" />}
          {section === "auth" && <LogViewerPanel channel="auth" />}
          {section === "error" && <LogViewerPanel channel="error" />}
          {section === "test-api" && <TestApiPanel />}
        </div>
      </div>
    </motion.div>
  );
}
