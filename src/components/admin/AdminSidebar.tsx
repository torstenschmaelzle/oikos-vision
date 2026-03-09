import {
  AppWindow,
  ShieldCheck,
  AlertTriangle,
  FlaskConical,
  Cpu,
} from "lucide-react";

export type AdminSection = "app" | "auth" | "error" | "test-api";

interface SidebarItem {
  id: AdminSection;
  label: string;
  description: string;
  icon: React.ElementType;
}

const ITEMS: SidebarItem[] = [
  { id: "app", label: "App Logs", description: "General backend activity", icon: AppWindow },
  { id: "auth", label: "Auth Logs", description: "Login & invite events", icon: ShieldCheck },
  { id: "error", label: "Error Logs", description: "Failures & problems", icon: AlertTriangle },
  { id: "test-api", label: "Test API", description: "Run backend tests", icon: FlaskConical },
];

interface Props {
  active: AdminSection;
  onChange: (s: AdminSection) => void;
}

export default function AdminSidebar({ active, onChange }: Props) {
  return (
    <nav className="w-56 shrink-0 border-r bg-card/60 flex flex-col">
      {/* Sidebar header */}
      <div className="px-4 py-4 border-b flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <Cpu className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-foreground">
            API Settings
          </span>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Logs &amp; Diagnostics
          </p>
        </div>
      </div>

      <div className="flex-1 py-2 space-y-0.5 px-2">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`
                w-full flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-100
                ${isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }
              `}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm leading-tight truncate">{item.label}</p>
                {isActive && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                    {item.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
