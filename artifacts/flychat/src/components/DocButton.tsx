import { useState, useEffect } from "react"
import { BookOpen } from "lucide-react"
import { DocViewer } from "./DocViewer"

interface DocButtonProps {
  docId: string
  label?: string
  variant?: "default" | "ghost"
}

export function DocButton({ docId, label = "How it works", variant = "default" }: DocButtonProps) {
  const [open, setOpen] = useState(false)

  // Listen for cross-doc navigation from DocViewer's related-feature buttons
  useEffect(() => {
    function handler(e: CustomEvent) {
      if (e.detail === docId) setOpen(true)
    }
    window.addEventListener("open-doc" as any, handler)
    return () => window.removeEventListener("open-doc" as any, handler)
  }, [docId])

  const base =
    "inline-flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2.5 py-1.5"
  const styles =
    variant === "ghost"
      ? `${base} text-muted-foreground hover:text-foreground hover:bg-secondary`
      : `${base} text-muted-foreground border border-border hover:text-primary hover:border-primary/40 hover:bg-primary/5 bg-card`

  return (
    <>
      <button onClick={() => setOpen(true)} className={styles} title={`Documentation: ${docId}`}>
        <BookOpen className="w-3.5 h-3.5" />
        {label}
      </button>
      {open && <DocViewer docId={docId} onClose={() => setOpen(false)} />}
    </>
  )
}
