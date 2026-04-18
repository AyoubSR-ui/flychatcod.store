import { useEffect, useState } from "react"
import { X, ChevronDown, ChevronRight, Lightbulb, AlertTriangle, ExternalLink } from "lucide-react"
import { DOCS, DocPage } from "@/data/docs"
import { Link } from "wouter"

interface DocViewerProps {
  docId: string
  onClose: () => void
}

export function DocViewer({ docId, onClose }: DocViewerProps) {
  const doc = DOCS.find((d) => d.id === docId)
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  if (!doc) return null

  function toggleSection(i: number) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const relatedDocs = DOCS.filter((d) => doc.relatedFeatures.includes(d.id))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border shadow-2xl z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">{doc.icon}</span>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-0.5">
                {doc.feature}
              </p>
              <h2 className="text-lg font-bold text-foreground leading-snug">{doc.title}</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{doc.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0 ml-2"
            aria-label="Close documentation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-1">
            {doc.sections.map((section, i) => {
              const isOpen = openSections.has(i)
              return (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => toggleSection(i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <span className="font-medium text-sm text-foreground">{section.title}</span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 bg-secondary/20">
                      {section.content && (
                        <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                          {section.content}
                        </p>
                      )}

                      {section.steps && (
                        <ol className="space-y-2">
                          {section.steps.map((step, si) => (
                            <li key={si} className="flex items-start gap-3 text-sm">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                {si + 1}
                              </span>
                              <span className="text-foreground leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}

                      {section.tip && (
                        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                            {section.tip}
                          </p>
                        </div>
                      )}

                      {section.warning && (
                        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                            {section.warning}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Related features */}
          {relatedDocs.length > 0 && (
            <div className="px-4 pb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Related features
              </p>
              <div className="flex flex-wrap gap-2">
                {relatedDocs.map((rel) => (
                  <button
                    key={rel.id}
                    onClick={() => {
                      // Navigate to the related doc (replace current)
                      window.dispatchEvent(new CustomEvent("open-doc", { detail: rel.id }))
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                  >
                    <span>{rel.icon}</span>
                    {rel.feature}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer link */}
          <div className="px-4 pb-5">
            <Link
              href={`/docs#${doc.id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View full documentation
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
