import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Package, Plus, Minus, Trash2 } from "lucide-react";
import { useGetProducts, Product } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

// Shared by Orders.tsx's create-order modal and Inbox.tsx's order draft —
// previously duplicated as two separate, non-catalog-aware item editors in
// Orders.tsx and a full search+variant+custom picker in Inbox.tsx. This is
// the Inbox implementation, extracted so both use one.

export interface ProductPickerItem {
  productId?: string;
  productName: string;
  variant?: string;
  quantity: number;
  price: number;
}

// Real product variants are flat strings, but the actual shapes merchants
// enter vary wildly — verified against real store data: only a minority use
// the clean "Color: X" / "Size: Y" labeled form (Products.tsx's default
// editor groups); most are ad-hoc combined strings like "Blanc/Noir - 40",
// "Standard Fit / White (أبيض)", "Blue Royal / 1(s/m)", or flat lists with
// no separator at all ("Noir", "Rose", "Vanille"). There is no reliable way
// to regex-split an arbitrary "X / Y" string into "which part is the size"
// and "which part is the color" — "Standard Fit" and "1(s/m)" aren't sizes
// in any standard sense. Rather than guess wrong, only split into Size/Color
// pickers when EVERY variant uses the explicit labeled form; otherwise fall
// back to a flat picker of the real variant strings, which is correct for
// every format instead of silently showing nothing.
interface ParsedVariants {
  mode: "labeled" | "raw" | "none";
  sizes: string[];
  colors: string[];
  options: string[];
}
function parseProductVariants(variants: string[] | undefined): ParsedVariants {
  if (!Array.isArray(variants) || variants.length === 0) return { mode: "none", sizes: [], colors: [], options: [] };
  const labelPattern = /^\s*(colou?r|couleur|size|taille)\s*:/i;
  if (variants.every(v => labelPattern.test(v))) {
    const extract = (pattern: RegExp) => {
      const values = new Set<string>();
      for (const v of variants) {
        const idx = v.indexOf(":");
        const label = v.slice(0, idx).trim();
        const value = v.slice(idx + 1).trim();
        if (pattern.test(label) && value) values.add(value);
      }
      return Array.from(values);
    };
    const sizes = extract(/size|taille/i);
    const colors = extract(/colou?r|couleur/i);
    if (sizes.length > 0 || colors.length > 0) return { mode: "labeled", sizes, colors, options: [] };
  }
  return { mode: "raw", sizes: [], colors: [], options: variants };
}

interface ProductPickerProps {
  items: ProductPickerItem[];
  onChange: (items: ProductPickerItem[]) => void;
  // Keyed like the rest of this codebase's inline form errors: "items" for
  // the list-level "add at least one item" message, "item_{idx}" for a
  // missing product name, "item_{idx}_price" for an invalid price.
  errors?: Record<string, string>;
}

export function ProductPicker({ items, onChange, errors }: ProductPickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantSize, setVariantSize] = useState("");
  const [variantColor, setVariantColor] = useState("");
  const [variantRawOption, setVariantRawOption] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useGetProducts(
    { search, limit: 8 },
    { query: { enabled: search.length >= 1, queryKey: ["products", search] } }
  );

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  const addProduct = useCallback((product: Product, variant?: string) => {
    const idx = items.findIndex(i => i.productId === product.id && (i.variant || undefined) === (variant || undefined));
    if (idx >= 0) {
      const next = [...items];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      onChange(next);
    } else {
      onChange([...items, { productId: product.id, productName: product.name, variant, quantity: 1, price: product.price }]);
    }
    setSearch(""); setDropOpen(false);
  }, [items, onChange]);

  // Selecting a product from search: any product with variants (labeled or
  // raw) holds for picking instead of adding immediately. Only a product
  // with a genuinely empty variants array keeps the single-click-add flow.
  const selectProductFromSearch = useCallback((product: Product) => {
    const parsed = parseProductVariants(product.variants);
    if (parsed.mode === "none") {
      addProduct(product);
      return;
    }
    setVariantProduct(product); setVariantSize(""); setVariantColor(""); setVariantRawOption("");
    setDropOpen(false);
  }, [addProduct]);

  const addVariantProduct = useCallback(() => {
    if (!variantProduct) return;
    const parsed = parseProductVariants(variantProduct.variants);
    const variant = parsed.mode === "raw"
      ? (variantRawOption || undefined)
      : ([variantColor, variantSize].filter(Boolean).join(" / ") || undefined);
    addProduct(variantProduct, variant);
    setVariantProduct(null); setVariantSize(""); setVariantColor(""); setVariantRawOption("");
  }, [variantProduct, variantColor, variantSize, variantRawOption, addProduct]);

  const addCustomItem = useCallback(() => {
    onChange([...items, { productName: "", quantity: 1, price: 0 }]);
  }, [items, onChange]);

  const removeItem = useCallback((idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  }, [items, onChange]);

  const updateItem = useCallback((idx: number, field: keyof ProductPickerItem, value: string | number) => {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }, [items, onChange]);

  return (
    <div>
      {errors?.items && <p className="text-red-500 text-[10px] mb-2">{errors.items}</p>}
      <div ref={dropRef} className="relative mb-2">
        <input ref={inputRef} value={search}
          onChange={e => { setSearch(e.target.value); setDropOpen(true); }}
          onFocus={() => search.length >= 1 && setDropOpen(true)}
          placeholder={t("order.search_product")}
          className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs outline-none focus:ring-2 focus:ring-primary/20 pr-7" />
        <Search className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {search && dropOpen && (
          <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {!productsData?.products?.length ? (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">{t("inbox.no_products_found")}</div>
            ) : productsData.products.map(p => (
              <button key={p.id} onClick={() => selectProductFromSearch(p)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 flex items-center gap-2 transition-colors">
                <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-primary font-bold shrink-0">DZD {p.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {variantProduct && (() => {
        const parsed = parseProductVariants(variantProduct.variants);
        return (
          <div className="mb-3 p-2.5 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
            <p className="text-xs font-bold text-foreground truncate">{variantProduct.name}</p>
            {parsed.mode === "labeled" ? (
              <>
                {parsed.colors.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">{t("products.modal.type_color")}</p>
                    <div className="flex flex-wrap gap-1">
                      {parsed.colors.map(c => (
                        <button key={c} onClick={() => setVariantColor(prev => prev === c ? "" : c)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${variantColor === c ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {parsed.sizes.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">{t("inbox.size_label")}</p>
                    <div className="flex flex-wrap gap-1">
                      {parsed.sizes.map(s => (
                        <button key={s} onClick={() => setVariantSize(prev => prev === s ? "" : s)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${variantSize === s ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">{t("inbox.variant_label")}</p>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {parsed.options.map(o => (
                    <button key={o} onClick={() => setVariantRawOption(prev => prev === o ? "" : o)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${variantRawOption === o ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-1.5 pt-1">
              <button onClick={() => { setVariantProduct(null); setVariantSize(""); setVariantColor(""); setVariantRawOption(""); }}
                className="flex-1 py-1.5 border border-border rounded-lg text-[11px] font-medium hover:bg-secondary transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={addVariantProduct}
                className="flex-1 py-1.5 bg-primary text-white rounded-lg text-[11px] font-bold hover:bg-primary/90 transition-colors">
                {t("inbox.add_to_order")}
              </button>
            </div>
          </div>
        );
      })()}

      <button onClick={addCustomItem}
        className="w-full text-xs text-primary font-semibold py-1.5 rounded-lg border border-dashed border-primary/30 hover:bg-primary/5 flex items-center justify-center gap-1 transition-colors mb-3">
        <Plus className="w-3 h-3" /> {t("order.add_custom_item")}
      </button>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="bg-secondary/30 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <input value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)}
                  className={`flex-1 px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-primary/20 min-w-0 ${errors?.[`item_${idx}`] ? "border-red-400" : "border-border"}`}
                  placeholder={t("orders.modal.product_placeholder")} />
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {item.variant && <p className="text-[10px] text-muted-foreground -mt-1">{item.variant}</p>}
              <div className="flex gap-1.5">
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button onClick={() => updateItem(idx, "quantity", Math.max(1, item.quantity - 1))} className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors"><Minus className="w-2.5 h-2.5" /></button>
                  <span className="px-2 text-xs font-bold text-foreground">{item.quantity}</span>
                  <button onClick={() => updateItem(idx, "quantity", item.quantity + 1)} className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors"><Plus className="w-2.5 h-2.5" /></button>
                </div>
                <div className="flex-1">
                  <input type="number" min={0} value={item.price || ""}
                    onChange={e => updateItem(idx, "price", Number(e.target.value))}
                    className={`w-full px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-primary/20 ${errors?.[`item_${idx}_price`] ? "border-red-400" : "border-border"}`}
                    placeholder={t("orders.modal.price_placeholder")} />
                </div>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                = <span className="font-bold text-foreground">DZD {(item.price * item.quantity).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
