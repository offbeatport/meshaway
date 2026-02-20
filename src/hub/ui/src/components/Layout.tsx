import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  Cpu,
  Home,
  Activity,
  Play,
  ChevronLeft,
  ChevronRight,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import {
  getStoredAppearance,
  setStoredAppearance,
  applyAppearance,
  subscribeToSystemPreference,
  type Appearance,
} from "@/lib/theme";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/sessions", label: "Sessions", icon: Activity },
  { to: "/playground", label: "Playground", icon: Play },
];

export function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [appearance, setAppearanceState] = useState<Appearance>(() => getStoredAppearance());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    return subscribeToSystemPreference(() => {
      if (getStoredAppearance() === "system") applyAppearance("system");
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const setAppearance = (value: Appearance) => {
    setAppearanceState(value);
    setStoredAppearance(value);
    setSettingsOpen(false);
  };

  return (
    <div className="h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 flex">
      {/* Left sidebar */}
      <aside
        className={`flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/30 flex flex-col p-1.5 ${
          collapsed ? "w-[4.25rem]" : "w-52"
        }`}
      >
        {/* Logo + collapse */}
        <div
          className={`border-b border-zinc-200 dark:border-zinc-800/80 ${
            collapsed ? "px-2 py-2.5" : "flex items-center gap-2 px-3 py-3"
          }`}
        >
          {collapsed ? (
            <div className="group relative mx-auto h-9 w-9">
              <Link
                to="/"
                className="absolute inset-0 flex items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 transition-opacity group-hover:opacity-0"
                aria-label="Go to Home"
              >
                <Cpu className="h-5 w-5 text-sky-500 dark:text-sky-400" />
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="absolute inset-0 flex items-center justify-center rounded-lg text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Expand menu"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Link to="/" className="flex flex-1 min-w-0 items-center gap-3 overflow-hidden hover:opacity-90">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 flex-shrink-0">
                  <Cpu className="h-5 w-5 text-sky-500 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-md font-semibold tracking-tight truncate">Meshaway</h1>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Collapse menu"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 py-2 px-2 space-y-0.5" role="navigation" aria-label="Main">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-2 rounded-lg text-sm font-medium ${isActive
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                  } ${collapsed ? "justify-center p-2.5" : "px-3 py-2"}`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Settings at bottom; menu hovers above */}
        <div className="relative border-t border-zinc-200 dark:border-zinc-800/80 m-2 pt-2" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className={`flex items-center w-full rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200 ${collapsed ? "justify-center p-2" : "gap-2 px-3 py-2.5"
              }`}
            aria-expanded={settingsOpen}
            aria-haspopup="true"
          >
            <Settings className="h-4 w-4 flex-shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">Settings</span>}
          </button>
          {settingsOpen && (
            <div
              className={`absolute z-30 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg ${collapsed ? "bottom-full left-0 right-0 mb-1 mx-1 min-w-[10rem]" : "bottom-full left-2 right-2 mb-1"
                }`}
            >
              <p className="px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Appearance
              </p>
              {(
                [
                  { value: "light" as const, label: "Light", icon: Sun },
                  { value: "dark" as const, label: "Dark", icon: Moon },
                  { value: "system" as const, label: "System", icon: Monitor },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAppearance(value)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${appearance === value ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
                    }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <Outlet />
      </main>
    </div>
  );
}
