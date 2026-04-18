import { useState } from "react"
import { Link, useRoute } from "wouter"
import { Search, ArrowLeft, BookOpen, ChevronDown, ChevronRight, Lightbulb, AlertTriangle } from "lucide-react"
import { AppLayout } from "@/components/AppLayout"
import { DOCS, DocPage } from "@/data/docs"

// ─── DocArticle — renders a single full doc page ─────────────────────────────
function DocArticle({ doc }: { doc: DocPage }) {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0, 1]))

  function toggle(i: number) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const relatedDocs = DOCS.filter((d) => doc.relatedFeatures.includes(d.id))

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <span className="text-3xl">{doc.icon}</span>
        <h1 className="text-3xl font-bold text-foreground mt-3">{doc.title}</h1>
        <p className="text-muted-foreground mt-2 text-lg leading-relaxed">{doc.description}</p>
      </div>

      <div className="space-y-2">
        {doc.sections.map((section, i) => {
          const isOpen = openSections.has(i)
          return (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/50 transition-colors"
              >
                <span className="font-semibold text-foreground">{section.title}</span>
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                }
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 space-y-3 bg-secondary/10">
                  {section.content && (
                    <p className="text-muted-foreground leading-relaxed">{section.content}</p>
                  )}
                  {section.steps && (
                    <ol className="space-y-2.5">
                      {section.steps.map((step, si) => (
                        <li key={si} className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            {si + 1}
                          </span>
                          <span className="text-foreground leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {section.tip && (
                    <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                      <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">{section.tip}</p>
                    </div>
                  )}
                  {section.warning && (
                    <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-800 dark:text-red-300">{section.warning}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {relatedDocs.length > 0 && (
        <div className="mt-8 p-5 bg-secondary/30 rounded-2xl border border-border">
          <p className="text-sm font-semibold text-muted-foreground mb-3">Related features</p>
          <div className="flex flex-wrap gap-2">
            {relatedDocs.map((rel) => (
              <Link
                key={rel.id}
                href={`/docs/${rel.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
              >
                <span>{rel.icon}</span>
                {rel.feature}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Docs Index — grid of all docs ───────────────────────────────────────────
function DocsIndex() {
  const [query, setQuery] = useState("")

  const filtered = DOCS.filter(
    (d) =>
      !query ||
      d.title.toLowerCase().includes(query.toLowerCase()) ||
      d.description.toLowerCase().includes(query.toLowerCase()) ||
      d.feature.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          Documentation
        </h1>
        <p className="text-muted-foreground mt-2">
          Everything you need to get the most out of FlyChat COD.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((doc) => (
          <Link
            key={doc.id}
            href={`/docs/${doc.id}`}
            className="group p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{doc.icon}</span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {doc.title}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {doc.description}
                </p>
                <p className="text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  Read more →
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No docs found for "{query}"</p>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Docs() {
  const [matchArticle, paramsArticle] = useRoute("/docs/:id")
  const docId = matchArticle ? paramsArticle?.id : null
  const currentDoc = docId ? DOCS.find((d) => d.id === docId) : null

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Back link when viewing an article */}
          {currentDoc && (
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All docs
            </Link>
          )}

          {currentDoc ? <DocArticle doc={currentDoc} /> : <DocsIndex />}
        </div>
      </div>
    </AppLayout>
  )
}
