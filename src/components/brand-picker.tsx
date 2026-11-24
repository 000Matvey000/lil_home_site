import { useMemo, useState } from "react";
import { Ban, ChevronDown, Search } from "lucide-react";
import { BRAND_GROUPS, BRANDS, BrandIcon, brandStyle, getBrand } from "../lib/brands";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";

/** Link type picker: a searchable grid of brand logos, plus "None". */
export function BrandPicker({ value, onChange, autoDetected }: {
  value: string;
  onChange: (key: string) => void;
  /** True when the current value was guessed from the URL rather than picked. */
  autoDetected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = getBrand(value);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? BRANDS.filter((brand) => brand.title.toLowerCase().includes(needle) || brand.key.includes(needle)) : BRANDS),
    [needle],
  );

  function choose(key: string) {
    onChange(key);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="field">
      <span className="field-label" id="link-type-label">Link type</span>
      <button
        type="button"
        className="brand-current"
        aria-expanded={open}
        aria-labelledby="link-type-label"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="brand-chip" style={current ? brandStyle(current) : undefined}>
          {current ? <BrandIcon brand={current} size={18} className="brand-logo" /> : <Ban size={16} aria-hidden="true" />}
        </span>
        <span className="brand-current-name">
          {current ? current.title : "None"}
          {current && autoDetected && <span className="brand-auto"> · detected from URL</span>}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={cn("brand-caret", open && "is-open")} />
      </button>
      {!open && <span className="field-hint">Shows the organisation's logo on the card when there's no thumbnail image.</span>}

      {open && (
        <div className="brand-panel">
          <div className="search-box brand-search">
            <Search size={16} aria-hidden="true" />
            <Input
              autoFocus
              type="search"
              aria-label="Search logos"
              placeholder="Search logos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the first match instead of submitting the link form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches[0]) choose(matches[0].key);
                }
              }}
            />
          </div>
          <div className="brand-scroll">
            {!needle && (
              <button type="button" className="brand-option" aria-pressed={!value} onClick={() => choose("")}>
                <span className="brand-chip"><Ban size={16} aria-hidden="true" /></span>
                <span>None</span>
              </button>
            )}
            {BRAND_GROUPS.map((group) => {
              const items = matches.filter((brand) => brand.group === group.key);
              if (!items.length) return null;
              return (
                <div key={group.key} className="brand-group">
                  <span className="brand-group-label">{group.label}</span>
                  <div className="brand-grid">
                    {items.map((brand) => (
                      <button
                        key={brand.key}
                        type="button"
                        className="brand-option"
                        aria-pressed={brand.key === value}
                        title={brand.title}
                        onClick={() => choose(brand.key)}
                      >
                        <span className="brand-chip" style={brandStyle(brand)}><BrandIcon brand={brand} size={18} className="brand-logo" /></span>
                        <span>{brand.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!matches.length && <p className="muted-text brand-empty">No logo matches "{query}". Choose None to use the thumbnail or initials.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
