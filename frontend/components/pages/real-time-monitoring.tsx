"use client"

import { useEffect, useState, useMemo } from "react"
import type React from "react"
import {
  AlertCircle,
  AlertTriangle,
  BikeIcon,
  Camera,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  MapPin,
  RotateCw,
  X,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { useRealTimeDetections } from "@/hooks/useRealTimeDetections"
import { useLanguage } from "@/hooks/useLanguage"
import { loadDisplayPrefs } from "@/lib/app-settings"
import { playViolationBeep } from "@/lib/alert-sound"
import { getStreamUrl } from "@/services/helmet-detection.service"
import { DetectionList } from "@/components/real-time/DetectionList"
import type { DetectionResult } from "@/types/detection.types"

import { cn } from "@/lib/utils"

function NowClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!now) return <span suppressHydrationWarning>--:--:--</span>
  return <>{now.toLocaleTimeString("th-TH")}</>
}

function FloatingStatsStack({
  detections,
  isLoading,
  t,
}: {
  detections: DetectionResult[]
  isLoading: boolean
  t: (key: string) => string
}) {
  const stats = useMemo(() => {
    const violations = detections.filter((d) => d.helmetStatus === "not-wearing").length
    const total = detections.length
    const compliance = total > 0 ? Math.round(((total - violations) / total) * 100) : 0
    const overCapacity = detections.filter((d) => d.passengerCount > 2).length
    return { violations, total, compliance, overCapacity }
  }, [detections])

  const statItems = [
    {
      icon: BikeIcon,
      label: t("stats.motorcyclesDetected"),
      value: isLoading ? "-" : stats.total,
      iconBg: "bg-[#DBEAFE] dark:bg-[#1e3a8a]/40",
      iconColor: "text-[#3B82F6] dark:text-[#60a5fa]",
    },
    {
      icon: Users,
      label: t("stats.overCapacity"),
      value: isLoading ? "-" : stats.overCapacity,
      iconBg: "bg-[#FEF3C7] dark:bg-[#78350f]/40",
      iconColor: "text-[#F59E0B] dark:text-[#fbbf24]",
    },
    {
      icon: AlertTriangle,
      label: t("stats.violations"),
      value: isLoading ? "-" : stats.violations,
      iconBg: "bg-[#FEE2E2] dark:bg-[#7f1d1d]/40",
      iconColor: "text-[#EF4444] dark:text-[#f87171]",
    },
    {
      icon: CheckCircle,
      label: t("stats.complianceRate"),
      value: isLoading ? "-" : `${stats.compliance}%`,
      iconBg: "bg-[#D1FAE5] dark:bg-[#064e3b]/40",
      iconColor: "text-[#10B981] dark:text-[#34d399]",
    },
  ]

  return (
    <div className="md:absolute md:top-3 md:right-4 z-20 flex flex-col w-full md:w-56 lg:w-60 mt-3 md:mt-0 pointer-events-auto">
      {/* Cards: 2x2 Grid on Mobile, Vertical Stack on Desktop */}
      <div className="grid grid-cols-2 md:flex md:flex-col gap-2 sm:gap-2.5">
        {statItems.map((item, idx) => {
          const Icon = item.icon
          return (
            <div
              key={idx}
              className={cn(
                "group relative overflow-hidden rounded-[16px] p-3 sm:p-3.5",
                "bg-[rgba(255,255,255,0.88)] dark:bg-[#17181c]/90 backdrop-blur-[14px]",
                "border border-[rgba(255,255,255,0.6)] dark:border-white/15",
                "border-t-white/90 dark:border-t-white/30",
                "shadow-[0_12px_30px_rgba(0,0,0,0.15)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_16px_36px_rgba(0,0,0,0.2)]"
              )}
            >
              <div className="relative flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-[0.5px] truncate">
                    {item.label}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold tracking-tight text-[#111827] dark:text-white mt-0.5">
                    {item.value}
                  </p>
                </div>
                <div
                  className={cn(
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs transition-transform duration-200 group-hover:scale-105",
                    item.iconBg
                  )}
                >
                  <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", item.iconColor)} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Soft reflection effect beneath the floating card stack (desktop only) */}
      <div className="hidden md:block relative h-5 sm:h-6 w-full mt-1 overflow-hidden pointer-events-none opacity-35 dark:opacity-20">
        <div className="w-full h-full bg-gradient-to-b from-black/15 dark:from-white/10 to-transparent blur-md rounded-2xl transform -scale-y-100" />
      </div>
    </div>
  )
}

/** Upper bound for the SSE/history buffer regardless of display settings */
const MAX_SSE_BUFFER = 50

/** Camera location on campus_map.png, as % of image size (building S13) */
const CAMERA_LOCATION = { x: 29.1, y: 6.1, label: "S13" }

/** Pin gradient by violation rate */
const LEVEL_STYLES = {
  high: "linear-gradient(135deg,#E8543E,#C43D2C)", // > 30%
  mid: "linear-gradient(135deg,#E0A23D,#B87F26)", // 10-30%
  low: "linear-gradient(135deg,#2F8F63,#22714D)", // < 10%
} as const

type LevelKey = keyof typeof LEVEL_STYLES

/** Pin color level from violation rate (0-100) */
function levelFromRate(rate: number): LevelKey {
  if (rate > 30) return "high"
  if (rate >= 10) return "mid"
  return "low"
}

function CampusMap({
  t,
  mjpegUrl,
  cameraLabel,
  violationRate = 0,
  detections = [],
  isLoading = false,
}: {
  t: (key: string) => string
  mjpegUrl?: string
  cameraLabel: string
  violationRate?: number
  detections?: DetectionResult[]
  isLoading?: boolean
}) {
  const level = levelFromRate(violationRate)


  // Hover preview — shows instantly on pin enter; popup is a DOM child of the
  // pin wrapper, so moving the cursor onto it keeps the popup open.
  const [showPreview, setShowPreview] = useState(false)

  const [expanded, setExpanded] = useState(false)

  // ESC closes fullscreen (stream <img> below stays mounted, so closing never refetches)
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expanded])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5" />
          {t("camera.campusMap")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="relative">
          <img src="/campus_map.png" alt="KMUTT Bangmod campus map" width={1866} height={1166} className="w-full h-auto rounded-md" />

          {/* Floating Glass Stats Stack overlapping on the right */}
          <FloatingStatsStack detections={detections} isLoading={isLoading} t={t} />

          <div
            className="pin-wrap"
            style={{ left: `${CAMERA_LOCATION.x}%`, top: `${CAMERA_LOCATION.y}%` }}
            onMouseEnter={() => setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
          >
            <button
              type="button"
              className="pin cursor-pointer"
              style={{ background: LEVEL_STYLES[level] }}
              onClick={() => setExpanded(true)}
              aria-label={t("camera.livePreview")}
            >
              <div className="pin-inner">{CAMERA_LOCATION.label}</div>
            </button>
          </div>

          {/* Single persistent stream layer — hover popup and fullscreen share one <img>,
              so toggling between them never opens a second MJPEG connection. */}
          <div
            className={
              expanded
                ? "fixed inset-0 z-50 bg-black"
                : `absolute z-30 w-80 overflow-hidden rounded-lg border bg-popover shadow-xl ${showPreview ? "visible" : "invisible"}`}
            style={expanded ? undefined : { left: `calc(${CAMERA_LOCATION.x}% + 12px)`, top: `calc(${CAMERA_LOCATION.y}% - 12px)` }}
            onMouseEnter={() => setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
            onClick={expanded ? () => setExpanded(false) : undefined}
          >
          {!expanded && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium border-b">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {cameraLabel}
            </div>
          )}
          {mjpegUrl ? (
            <img
              src={mjpegUrl}
              alt="Live stream"
              className={expanded ? "absolute inset-0 h-full w-full object-contain" : "aspect-video w-full object-cover"}
            />
          ) : (
            <div className={`flex aspect-video w-full items-center justify-center bg-muted ${expanded ? "m-auto" : ""}`}>
              <Camera className={expanded ? "h-12 w-12" : "h-6 w-6"} />
            </div>
          )}
          {!expanded && (
            <button
              type="button"
              className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
              onClick={() => setExpanded(true)}
            >
              {t("camera.expandFullscreen")}
            </button>
          )}
          {expanded && (
            <>
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                REC
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-3 right-3"
                onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
                {cameraLabel}
              </div>
            </>
          )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function RealTimeMonitoring() {
  const { t } = useLanguage("en")
  const cameraId = "camera-1"
  const cameraLabel = t("camera.camera1")

  // Client-effective preferences from the settings page (localStorage-backed)
  const [prefs] = useState(loadDisplayPrefs)

  const handleNewDetections = (batch: DetectionResult[]) => {
    if (!prefs.notifyInApp && !prefs.notifySound) return
    const hasViolation = batch.some((detection) => detection.violation)
    if (!hasViolation) return

    if (prefs.notifyInApp) {
      toast.error(t("alerts.newViolation"), { description: t("alerts.newViolationDesc") })
    }
    if (prefs.notifySound) {
      playViolationBeep()
    }
  }

  const { detections, isLoading, error, isRecording, setIsRecording } = useRealTimeDetections({
    maxItems: Math.min(prefs.realtimeRows, MAX_SSE_BUFFER),
    cameraId,
    onDetections: handleNewDetections,
  })

  const visibleDetections = useMemo(
    () =>
      prefs.showOnlyViolations ? detections.filter((d) => d.violation) : detections,
    [detections, prefs.showOnlyViolations]
  )

  const [mjpegUrl, setMjpegUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    setMjpegUrl(isRecording ? getStreamUrl(cameraId) : undefined)
  }, [cameraId, isRecording])

  const violationRate = useMemo(() => {
    if (detections.length === 0) return 0
    const violations = detections.filter(
      (d) => d.violation || d.helmetStatus === "not-wearing"
    ).length
    return Math.round((violations / detections.length) * 100)
  }, [detections])

  return (
    <div className="space-y-5 sm:space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("errors.errorOccurred")}</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()} className="gap-2 rounded-xl">
            <RotateCw className="h-4 w-4" />
            {t("buttons.retry")}
          </Button>
        </div>
      )}

      {/* Top Header & Camera Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("header.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("header.lastUpdate")} <NowClock />
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/80 bg-card shadow-xs">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full",
              isRecording ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
            )} />
            <span className="text-xs font-semibold text-muted-foreground">
              {t("status." + (isRecording ? "running" : "stopped"))}
            </span>
          </div>

          {/* Recording Toggle Button */}
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={() => setIsRecording(!isRecording)}
            disabled={isLoading}
            className="gap-2 rounded-xl h-9 px-3.5 shadow-xs font-semibold"
          >
            {isRecording ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {t("buttons." + (isRecording ? "stopRecording" : "startRecording"))}
          </Button>
        </div>
      </div>

      <CampusMap
        t={t}
        mjpegUrl={mjpegUrl}
        cameraLabel={cameraLabel}
        violationRate={violationRate}
        detections={detections}
        isLoading={isLoading}
      />

      {/* Latest Results Card */}
      <Card className="rounded-2xl border-border/80 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
            <Clock className="h-4.5 w-4.5 text-muted-foreground" />
            {t("detection.latestResults")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && detections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">{t("detection.loading")}</p>
            </div>
          ) : (
            <DetectionList detections={visibleDetections} t={t} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
