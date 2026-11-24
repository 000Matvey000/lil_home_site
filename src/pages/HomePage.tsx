import { Fragment, useEffect, useMemo, useState } from "react";
import { Activity, Bell, ChevronLeft, ChevronRight, ExternalLink, FileDown, Images, Link2, Lock, Search, Settings2, Trash2 } from "lucide-react";
import { api } from "../api";
import type { Announcement, IntegrationData, LinkRecord, Photo, SiteSettings } from "../types";
import { categoryFilterMatch, orderedSections, parseCategoryText, type HomeSectionKey } from "../lib/helpers";
import { BrandIcon, brandStyle, getBrand } from "../lib/brands";
import { routeHref, type AdminTab } from "../lib/router";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ConfirmDialog } from "../components/confirm-dialog";
import { AnnouncementDialog, LinkDialog } from "../components/home/editors";
import { PhotoCarousel } from "../components/home/PhotoCarousel";
import { IntegrationFields } from "../components/integration-field";
import { SectionToggles } from "../components/section-toggles";

type HomePageProps = {
  settings: SiteSettings;
  setSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  links: LinkRecord[];
  announcements: Announcement[];
  photos: Photo[];
  liveData: IntegrationData[];
  liveDataLoading: boolean;
  isAdmin: boolean;
  onContentChanged: () => Promise<void>;
};

export function HomePage({ settings, setSettings, links, announcements, photos, liveData, liveDataLoading, isAdmin, onContentChanged }: HomePageProps) {
  // Visitors only see sections that are switched on *and* have something in
  // them; admins also see empty sections so they know where to add content.
  const hasBannerContent = Boolean(settings.bannerUrl || settings.bannerTitle || settings.bannerSubtitle);
  const visible: Record<HomeSectionKey, boolean> = {
    showHero: settings.showHero && hasBannerContent,
    showPhotos: settings.showPhotos && (photos.length > 0 || isAdmin),
    showIntegrations: settings.showIntegrations && (liveData.length > 0 || liveDataLoading || isAdmin),
    showAnnouncements: settings.showAnnouncements && (announcements.length > 0 || isAdmin),
    showLinks: settings.showLinks,
  };
  const sections = orderedSections(settings).filter(({ key }) => visible[key]);
  // The admin's section toggles sit on the banner when it's at the top of the
  // page; otherwise (or when the banner is hidden) they get their own row.
  const togglesOnBanner = isAdmin && sections[0]?.key === "showHero";

  const render: Record<HomeSectionKey, () => React.ReactNode> = {
    showHero: () => (
      <Banner settings={settings}>
        {togglesOnBanner && <SectionToggles settings={settings} setSettings={setSettings} overlay />}
      </Banner>
    ),
    showPhotos: () => (
      <section className="home-section" aria-labelledby="photos-heading">
        <SectionHeading id="photos-heading" icon={<Images size={18} />} title={settings.photosTitle}>
          {isAdmin && <ManageLink tab="photos" label="Manage photos" />}
        </SectionHeading>
        {photos.length
          ? <PhotoCarousel photos={photos} label={settings.photosTitle} intervalMs={settings.photoIntervalSeconds * 1000} />
          : <EmptyState tab="photos" message="No photos yet." action="Add photos" />}
      </section>
    ),
    showIntegrations: () => <LiveDataSection data={liveData} loading={liveDataLoading} isAdmin={isAdmin} />,
    showAnnouncements: () => (
      <AnnouncementsSection title={settings.announcementsTitle} announcements={announcements} isAdmin={isAdmin} onChanged={onContentChanged} />
    ),
    showLinks: () => <LinksSection title={settings.linksTitle} links={links} isAdmin={isAdmin} onChanged={onContentChanged} />,
  };

  return (
    <div className="home-page">
      {isAdmin && !togglesOnBanner && <SectionToggles settings={settings} setSettings={setSettings} />}
      {sections.map(({ key }) => <Fragment key={key}>{render[key]()}</Fragment>)}
      {!sections.length && (
        <Card className="empty-state">
          Every home section is hidden.
          {isAdmin && " Use the section buttons above to turn some back on."}
        </Card>
      )}
    </div>
  );
}

function Banner({ settings, children }: { settings: SiteSettings; children?: React.ReactNode }) {
  const hasText = Boolean(settings.bannerTitle || settings.bannerSubtitle);
  return (
    <section className="banner-frame" data-has-image={Boolean(settings.bannerUrl)} data-has-text={hasText} aria-label="Banner">
      {settings.bannerUrl && <img src={settings.bannerUrl} className="banner-image" alt="" />}
      {children}
      {hasText && (
        <div className="banner-text">
          {settings.bannerTitle && <h1>{settings.bannerTitle}</h1>}
          {settings.bannerSubtitle && <p>{settings.bannerSubtitle}</p>}
        </div>
      )}
    </section>
  );
}

function SectionHeading({ id, icon, title, count, children }: { id: string; icon: React.ReactNode; title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div className="section-title">
        <span className="section-icon">{icon}</span>
        <h2 id={id}>{title}</h2>
        {count !== undefined && <Badge>{count}</Badge>}
      </div>
      {children && <div className="section-tools">{children}</div>}
    </div>
  );
}

function ManageLink({ tab, label }: { tab: AdminTab; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <a href={routeHref({ page: "admin", tab })}><Settings2 size={14} /> {label}</a>
    </Button>
  );
}

function EmptyState({ tab, message, action }: { tab: AdminTab; message: string; action: string }) {
  return (
    <Card className="empty-state">
      <p>{message}</p>
      <Button asChild size="sm" variant="outline"><a href={routeHref({ page: "admin", tab })}>{action}</a></Button>
    </Card>
  );
}

function FilterChips({ options, value, onChange, label }: { options: string[]; value: string; onChange: (value: string) => void; label: string }) {
  if (!options.length) return null;
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {["all", ...options].map((option) => (
        <button
          key={option}
          type="button"
          className="chip"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option === "all" ? "All" : option}
        </button>
      ))}
    </div>
  );
}

function LiveDataSection({ data, loading, isAdmin }: { data: IntegrationData[]; loading: boolean; isAdmin: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index > data.length - 1) setIndex(Math.max(0, data.length - 1));
  }, [data.length, index]);
  const current = data[index];
  const updated = current?.fetchedAt ? new Date(current.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <section className="home-section" aria-labelledby="live-heading">
      <SectionHeading id="live-heading" icon={<Activity size={18} />} title="Live data">
        {data.length > 1 && (
          <div className="pager">
            <Button variant="ghost" size="icon-sm" aria-label="Previous integration" onClick={() => setIndex((i) => (i - 1 + data.length) % data.length)}><ChevronLeft size={16} /></Button>
            <span>{index + 1} / {data.length}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next integration" onClick={() => setIndex((i) => (i + 1) % data.length)}><ChevronRight size={16} /></Button>
          </div>
        )}
        {isAdmin && <ManageLink tab="integrations" label="Manage" />}
      </SectionHeading>
      {current ? (
        <Card className="live-card">
          <div className="live-card-header">
            <h3>
              <span aria-hidden="true">{current.icon}</span> {current.title}
              {current.isPublic === false && <Badge className="private-badge" title="Only signed-in users can see this card"><Lock size={11} /> Signed-in only</Badge>}
            </h3>
            {updated && <span className="muted-text">Updated {updated}</span>}
          </div>
          <IntegrationFields data={current} />
        </Card>
      ) : loading ? (
        <Card className="live-card"><div className="skeleton-lines"><span /><span /><span /></div></Card>
      ) : (
        <EmptyState tab="integrations" message="No integrations yet." action="Set up an integration" />
      )}
    </section>
  );
}

function AnnouncementsSection({ title, announcements, isAdmin, onChanged }: { title: string; announcements: Announcement[]; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => [...new Set(announcements.flatMap((item) => parseCategoryText(item.category)))].sort((a, b) => a.localeCompare(b)), [announcements]);
  const visible = useMemo(() => announcements.filter((item) => categoryFilterMatch(item.category, category)), [announcements, category]);
  if (!announcements.length && !isAdmin) return null;

  return (
    <section className="home-section" aria-labelledby="announcements-heading">
      <SectionHeading id="announcements-heading" icon={<Bell size={18} />} title={title}>
        {isAdmin && <AnnouncementDialog onSaved={onChanged} />}
      </SectionHeading>
      <FilterChips options={categories} value={category} onChange={setCategory} label="Filter announcements by category" />
      <div className="announcement-grid">
        {visible.map((item) => (
          <Card key={item.id} className="announcement-card" style={{ "--accent": item.color } as React.CSSProperties}>
            <div className="announcement-icon"><Bell size={17} /></div>
            <div className="announcement-body">
              <h3>{item.title}</h3>
              {item.body && <p>{item.body}</p>}
              {item.category && <div className="tag-row">{parseCategoryText(item.category).map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>}
            </div>
            {isAdmin && (
              <div className="card-actions">
                <AnnouncementDialog item={item} onSaved={onChanged} compact />
                <ConfirmDialog title="Delete announcement?" description={`"${item.title}" will be removed for everyone.`} onConfirm={() => api.deleteAnnouncement(item.id).then(onChanged)}>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.title}`}><Trash2 size={15} /></Button>
                </ConfirmDialog>
              </div>
            )}
          </Card>
        ))}
        {!visible.length && <Card className="empty-state">{announcements.length ? "No announcements in this category." : "No announcements yet."}</Card>}
      </div>
    </section>
  );
}

function LinksSection({ title, links, isAdmin, onChanged }: { title: string; links: LinkRecord[]; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => [...new Set(links.flatMap((item) => parseCategoryText(item.category)))].sort((a, b) => a.localeCompare(b)), [links]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return links.filter((link) => {
      const searchMatch = !needle || `${link.title} ${link.description} ${link.department} ${link.category}`.toLowerCase().includes(needle);
      return searchMatch && categoryFilterMatch(link.category, category);
    });
  }, [links, search, category]);
  const groups = useMemo(() => [...new Set(filtered.map((link) => link.department))], [filtered]);

  return (
    <section className="home-section" aria-labelledby="links-heading">
      <SectionHeading id="links-heading" icon={<Link2 size={18} />} title={title} count={filtered.length}>
        <div className="search-box">
          <Search size={16} aria-hidden="true" />
          <Input type="search" aria-label="Search links" placeholder="Search links…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin && <LinkDialog onSaved={onChanged} />}
      </SectionHeading>
      <FilterChips options={categories} value={category} onChange={setCategory} label="Filter links by category" />
      {groups.map((group) => (
        <div className="link-group" key={group}>
          <h3 className="group-label">{group}</h3>
          <div className="link-grid">
            {filtered.filter((link) => link.department === group).map((link) => (
              <LinkCard key={link.id} link={link} isAdmin={isAdmin} onChanged={onChanged} />
            ))}
          </div>
        </div>
      ))}
      {!filtered.length && <Card className="empty-state">{links.length ? "No links match your search." : "No links yet."}</Card>}
    </section>
  );
}

function LinkCard({ link, isAdmin, onChanged }: { link: LinkRecord; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const tags = parseCategoryText(link.category);
  const brand = getBrand(link.linkType);
  // Uploaded thumbnail > brand logo > initials. With both, the logo becomes a corner badge.
  return (
    <Card className="link-card" style={{ "--accent": link.color } as React.CSSProperties}>
      <div className="link-thumb" data-brand={brand && !link.thumbnail ? brand.key : undefined} style={brand ? brandStyle(brand) : undefined}>
        {link.thumbnail
          ? <img src={link.thumbnail.url} alt="" loading="lazy" />
          : brand
            ? <BrandIcon brand={brand} size={26} className="brand-logo" />
            : <span>{link.title.slice(0, 2).toUpperCase()}</span>}
        {link.thumbnail && brand && (
          <span className="link-thumb-badge" title={brand.title}><BrandIcon brand={brand} size={12} className="brand-logo" /></span>
        )}
      </div>
      <div className="link-content">
        <h3>
          {link.url
            ? <a className="stretched-link" href={link.url} target="_blank" rel="noreferrer">{link.title}<ExternalLink size={13} aria-hidden="true" /></a>
            : link.title}
        </h3>
        {link.description && <p>{link.description}</p>}
        {(tags.length > 0 || link.attachment) && (
          <div className="tag-row">
            {tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
            {link.attachment && (
              <a href={`/api/links/${link.id}/attachment`} className="attachment-link"><FileDown size={13} /> {link.attachment.name}</a>
            )}
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="card-actions">
          <LinkDialog item={link} onSaved={onChanged} compact />
          <ConfirmDialog title="Delete link?" description={`"${link.title}" will be removed for everyone.`} onConfirm={() => api.deleteLink(link.id).then(onChanged)}>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${link.title}`}><Trash2 size={15} /></Button>
          </ConfirmDialog>
        </div>
      )}
    </Card>
  );
}
