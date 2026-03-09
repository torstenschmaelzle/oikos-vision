import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <Outlet />
    </div>
  );
}
