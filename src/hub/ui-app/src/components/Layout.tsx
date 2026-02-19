import { Outlet, Link, useLocation } from "react-router-dom";
import { Cpu, Activity, Wifi, WifiOff, ShieldCheck, Route, Stethoscope } from "lucide-react";
import { useHealth } from "@/lib/useApi";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/sessions", label: "Sessions", icon: Activity },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck },
  { to: "/routing", label: "Routing", icon: Route },
  { to: "/system", label: "Health", icon: Stethoscope },
];

export function Layout() {
  const healthy = useHealth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Cpu className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Meshaway Hub
              </h1>
              <p className="text-xs text-zinc-500 font-mono">
                Control plane
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-1" role="navigation" aria-label="Main">
            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive =
                to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" aria-hidden />}
                  {label}
                </Link>
              );
            })}

            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ml-2 ${
                healthy === true
                  ? "text-emerald-400/90"
                  : healthy === false
                    ? "text-amber-400/90"
                    : "text-zinc-500"
              }`}
              title={healthy === true ? "Connected" : "Disconnected"}
              aria-live="polite"
            >
              {healthy === true ? (
                <Wifi className="h-4 w-4" aria-hidden />
              ) : (
                <WifiOff className="h-4 w-4" aria-hidden />
              )}
              <span className="text-xs font-mono">
                {healthy === true ? "Live" : healthy === false ? "Offline" : "…"}
              </span>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
