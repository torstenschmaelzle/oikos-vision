import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import GuestRoute from "@/components/auth/GuestRoute";
import AuthRedirect from "@/components/auth/AuthRedirect";
import RoleGuard from "@/components/auth/RoleGuard";
import MapPage from "@/pages/app/MapPage";
import SettingsPage from "@/pages/app/SettingsPage";
import ApiSettingsPage from "@/pages/app/ApiSettingsPage";
import LoginPage from "@/pages/public/LoginPage";
import SetupAccountPage from "@/pages/public/SetupAccountPage";
import NotFound from "@/pages/public/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/setup-account" element={<SetupAccountPage />} />

            {/* Auth redirect */}
            <Route path="/" element={<AuthRedirect />} />

            {/* Authenticated routes inside AppShell */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/map" element={<MapPage />} />
              <Route
                path="/settings"
                element={
                  <RoleGuard allowed={["superadmin"]}>
                    <SettingsPage />
                  </RoleGuard>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
