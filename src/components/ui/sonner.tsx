"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import { Capacitor } from "@capacitor/core"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // في Android WebView نستخدم offset أكبر لتجنب الـ status bar
  const offset = Capacitor.isNativePlatform() ? "48px" : "16px"

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      offset={offset}
      toastOptions={{
        style: { direction: "rtl" },
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
