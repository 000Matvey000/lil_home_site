import { useCallback } from "react";
import { Check, EyeOff, LayoutDashboard } from "lucide-react";
import { api } from "../api";
import type { SiteSettings } from "../types";
import { errorMessage, orderedSections, type HomeSectionKey, type SectionOrderKey } from "../lib/helpers";
import { cn } from "../lib/utils";
import { useToast } from "./toast";

type SetSettings = React.Dispatch<React.SetStateAction<SiteSettings>>;

/**
 * Save home-section settings optimistically: the page updates at once and is
 * rolled back if the server rejects the change.
 */
export function useSectionSettings(setSettings: SetSettings) {
  const toast = useToast();
  const save = useCallback(async (patch: Partial<SiteSettings>, revert: Partial<SiteSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    try {
      await api.updateSettings(patch);
    } catch (error) {
      setSettings((current) => ({ ...current, ...revert }));
      toast.error(errorMessage(error, "Could not update the home sections"));
    }
  }, [setSettings, toast]);

  const toggle = useCallback((key: HomeSectionKey, next: boolean) => save({ [key]: next }, { [key]: !next }), [save]);
  const setOrder = useCallback((key: SectionOrderKey, next: number, previous: number) => save({ [key]: next }, { [key]: previous }), [save]);
  return { toggle, setOrder };
}

/** Admin-only row of show/hide switches for every home section (site-wide). */
export function SectionToggles({ settings, setSettings, overlay = false }: { settings: SiteSettings; setSettings: SetSettings; overlay?: boolean }) {
  const { toggle } = useSectionSettings(setSettings);
  return (
    <div className={cn("section-toggles", overlay && "is-overlay")} role="group" aria-label="Home sections shown to everyone">
      <span className="section-toggles-label"><LayoutDashboard size={14} aria-hidden="true" /> Sections</span>
      {orderedSections(settings).map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className="section-toggle"
          aria-pressed={settings[key]}
          title={settings[key] ? `Hide ${label.toLowerCase()} for everyone` : `Show ${label.toLowerCase()} for everyone`}
          onClick={() => void toggle(key, !settings[key])}
        >
          {settings[key] ? <Check size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  );
}
