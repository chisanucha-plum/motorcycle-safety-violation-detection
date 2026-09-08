"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  AUTH_USER_UPDATED_EVENT,
  getStoredUserEmail,
  getStoredUserRole,
  type UserRole,
} from "@/stores/auth-store"
import {
  BarChart3,
  HelpCircle,
  History as HistoryIcon,
  Home,
  Settings,
  ShieldAlert,
  User,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "@/hooks/useLanguage"

interface NavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  path: string
  description?: string
  badge?: string
}

export function FloatingToolbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage("en")
  const [role, setRole] = useState<UserRole>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const syncUserFromStorage = () => {
      setRole(getStoredUserRole())
      setEmail(getStoredUserEmail())
    }

    syncUserFromStorage()
    window.addEventListener(AUTH_USER_UPDATED_EVENT, syncUserFromStorage)

    return () => {
      window.removeEventListener(AUTH_USER_UPDATED_EVENT, syncUserFromStorage)
    }
  }, [])

  const mainNavItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        icon: Home,
        label: t("sidebar.home"),
        path: "/real-time-monitoring",
        description: t("sidebar.realtimeMonitoring"),
      },
      {
        icon: HistoryIcon,
        label: t("sidebar.history"),
        path: "/history",
        description: t("sidebar.historyDesc"),
      },
    ]

    if (role === "admin") {
      items.push({
        icon: BarChart3,
        label: t("sidebar.dashboard"),
        path: "/dashboard",
        description: t("sidebar.dashboardDesc"),
      })
    }

    return items
  }, [role, t])

  const secondaryNavItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = []

    if (role === "admin" || role === "security") {
      items.push({
        icon: Settings,
        label: t("sidebar.settings"),
        path: "/settings",
        description: t("sidebar.settingsDesc"),
      })
    }

    items.push({
      icon: HelpCircle,
      label: t("sidebar.help"),
      path: "/help",
      description: t("sidebar.helpDesc"),
    })

    return items
  }, [role, t])

  const handleNavigate = (path: string) => {
    router.push(path)
  }

  const roleDisplay = role ?? "unknown"
  const roleBadgeColor =
    role === "admin"
      ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
      : role === "security"
        ? "bg-green-500/15 text-green-500 border-green-500/30"
        : "bg-card/90 text-muted-foreground border-border/80"

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        aria-label="Floating Navigation Toolbar"
        className="fixed left-3 sm:left-4 top-3 sm:top-4 bottom-3 sm:bottom-4 z-40 flex flex-col items-center justify-between pointer-events-none select-none"
      >
        {/* 1. Top group: Logo icon — own small rounded-square background, floating alone */}
        <div className="pointer-events-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleNavigate("/real-time-monitoring")}
                className={cn(
                  "flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 p-2",
                  "bg-card/90 dark:bg-card/95 backdrop-blur-xl border border-border/80 shadow-lg rounded-2xl",
                  "hover:scale-105 active:scale-95 transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                aria-label="KMUTT Helmet Detection Home"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white rounded-xl flex items-center justify-center shadow-xs border border-border/40 overflow-hidden">
                  <img
                    src="/icon.png"
                    alt="Logo"
                    className="w-6 h-6 sm:w-7 sm:h-7 object-contain transition-transform duration-200 group-hover:scale-110"
                  />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="font-semibold">
              <div className="text-center">
                <p className="text-xs font-bold text-foreground">{t("login.title")}</p>
                <p className="text-[10px] text-muted-foreground">KMUTT</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 2. Middle group: 3 main navigation icons (home, history, analytics) — 
               share ONE small pill-shaped background together, floating in the vertical center of screen */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-auto">
          <nav
            aria-label="Main Navigation"
            className={cn(
              "flex flex-col items-center gap-2 sm:gap-2.5 py-2.5 sm:py-3 px-1.5 sm:px-2",
              "bg-card/90 dark:bg-card/95 backdrop-blur-xl border border-border/80 shadow-xl rounded-2xl sm:rounded-3xl",
              "transition-all duration-200"
            )}
          >
            {mainNavItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.path

              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleNavigate(item.path)}
                      className={cn(
                        "relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl transition-all duration-200",
                        "hover:scale-105 active:scale-95",
                        isActive
                          ? "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/30 font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      aria-label={item.label}
                    >
                      <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12}>
                    <p className="font-semibold text-xs">{item.label}</p>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground opacity-90">{item.description}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </nav>
        </div>

        {/* 3 & 4. Bottom section: Settings + Help group, and Avatar floating at the very bottom */}
        <div className="flex flex-col items-center gap-3 pointer-events-auto">
          {/* 3. Bottom group: Settings + Help icons — own separate small pill/rounded background */}
          {secondaryNavItems.length > 0 && (
            <div
              className={cn(
                "flex flex-col items-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-1.5 sm:px-2",
                "bg-card/90 dark:bg-card/95 backdrop-blur-xl border border-border/80 shadow-lg rounded-2xl sm:rounded-3xl",
                "transition-all duration-200"
              )}
            >
              {secondaryNavItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.path

                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleNavigate(item.path)}
                        className={cn(
                          "relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl transition-all duration-200",
                          "hover:scale-105 active:scale-95",
                          isActive
                            ? "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/30 font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        aria-label={item.label}
                      >
                        <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      <p className="font-semibold text-xs">{item.label}</p>
                      {item.description && (
                        <p className="text-[11px] text-muted-foreground opacity-90">{item.description}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          )}

          {/* 4. Avatar — own circular background, no shared container, floating at the very bottom */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border shadow-lg backdrop-blur-xl cursor-default transition-all duration-200 hover:scale-105",
                  roleBadgeColor
                )}
              >
                {role === "admin" ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">{email ?? "User"}</p>
                <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-background/80 border border-border">
                  {roleDisplay}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
