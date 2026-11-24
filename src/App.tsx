import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Home, LogIn, LogOut, Moon, Settings, ShieldAlert, Sun, X } from "lucide-react";
import { api } from "./api";
import type { Announcement, IntegrationData, LinkRecord, Photo, SiteSettings, User } from "./types";
import { defaultSettings, errorMessage, normalizeSettings, updateFavicon } from "./lib/helpers";
import { applySiteFont } from "./lib/fonts";
import { navigate, routeHref, useHashRoute } from "./lib/router";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Field, Input } from "./components/ui/input";
import { ToastProvider, useToast } from "./components/toast";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/admin/AdminPage";

export function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function initialTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function AppShell() {
  const toast = useToast();
  const route = useHashRoute();
  const [theme, setTheme] = useState(initialTheme);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [liveData, setLiveData] = useState<IntegrationData[]>([]);
  const [liveDataLoading, setLiveDataLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const refreshSettings = useCallback(async () => setSettings(normalizeSettings(await api.settings())), []);
  const refreshPhotos = useCallback(async () => setPhotos(await api.photos()), []);
  const refreshContent = useCallback(async () => {
    const [linkRows, announcementRows] = await Promise.all([api.links(), api.announcements()]);
    setLinks(linkRows);
    setAnnouncements(announcementRows);
  }, []);
  // Live data is fetched separately because it waits on third-party APIs; it
  // must never hold up the rest of the page.
  const refreshLiveData = useCallback(async () => {
    try {
      setLiveData(await api.integrationData());
    } finally {
      setLiveDataLoading(false);
    }
  }, []);

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null)).finally(() => setAuthChecked(true));
    Promise.all([refreshSettings(), refreshContent(), refreshPhotos()]).catch((error) => toast.error(errorMessage(error, "Could not load the page")));
    refreshLiveData().catch((error) => toast.error(errorMessage(error, "Could not load live data")));
  }, []);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      if (event.message) toast.error(event.message);
    }
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      toast.error(event.reason instanceof Error ? event.reason.message : String(event.reason || "Unexpected error"));
    }
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => updateFavicon(settings.faviconUrl), [settings.faviconUrl]);
  useEffect(() => applySiteFont(settings.fontFamily), [settings.fontFamily]);
  useEffect(() => {
    document.title = route.page === "admin" ? `Admin · ${settings.siteName}` : settings.siteName;
  }, [settings.siteName, route.page]);

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      navigate({ page: "home" });
      // Private live-data cards are only for signed-in users.
      void refreshLiveData().catch(() => undefined);
    }
  }

  let content: React.ReactNode;
  if (route.page === "admin") {
    if (!authChecked) content = <Card className="empty-state">Loading…</Card>;
    else if (!isAdmin || !user) content = <AdminGate signedIn={Boolean(user)} onSignIn={() => setLoginOpen(true)} />;
    else content = (
      <AdminPage
        tab={route.tab}
        currentUser={user}
        settings={settings}
        setSettings={setSettings}
        photos={photos}
        onSettingsChanged={refreshSettings}
        onPhotosChanged={refreshPhotos}
        onLiveDataChanged={refreshLiveData}
      />
    );
  } else {
    content = (
      <HomePage
        settings={settings}
        setSettings={setSettings}
        links={links}
        announcements={announcements}
        photos={photos}
        liveData={liveData}
        liveDataLoading={liveDataLoading}
        isAdmin={isAdmin}
        onContentChanged={refreshContent}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="background-fx" aria-hidden="true">
        <div className="background-grid" />
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="orb orb-three" />
      </div>

      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={routeHref({ page: "home" })}>
            <span className="brand-mark">{settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : settings.siteName.slice(0, 1).toUpperCase() || "H"}</span>
            <span className="brand-text">
              <strong>{settings.siteName}</strong>
              {settings.headerSubtitle && <span>{settings.headerSubtitle}</span>}
            </span>
          </a>

          {isAdmin && (
            <nav className="main-nav" aria-label="Main">
              <a href={routeHref({ page: "home" })} aria-current={route.page === "home" ? "page" : undefined}><Home size={16} /><span>Home</span></a>
              <a href={routeHref({ page: "admin", tab: route.page === "admin" ? route.tab : "customize" })} aria-current={route.page === "admin" ? "page" : undefined}><Settings size={16} /><span>Admin</span></a>
            </nav>
          )}

          <div className="top-actions">
            <Button variant="ghost" size="icon" aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            {user ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="outline" className="user-trigger" aria-label={`Account menu for ${user.username}`}>
                    <span className="avatar avatar-sm" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
                    <span className="user-trigger-name">{user.username}</span>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown" align="end" sideOffset={6}>
                    <DropdownMenu.Label className="dropdown-label">
                      <strong>{user.username}</strong>
                      <span>{user.role === "admin" ? "Administrator" : "View-only user"}</span>
                    </DropdownMenu.Label>
                    <DropdownMenu.Separator className="dropdown-separator" />
                    {isAdmin && (
                      <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate({ page: "admin", tab: "customize" })}><Settings size={15} /> Admin</DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item className="dropdown-item" onSelect={logout}><LogOut size={15} /> Sign out</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <Button onClick={() => setLoginOpen(true)}><LogIn size={16} /> <span className="hide-xs">Sign in</span></Button>
            )}
          </div>
        </div>
      </header>

      <main className="content-shell">{content}</main>

      {settings.footerText && <footer className="site-footer">{settings.footerText}</footer>}

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSignedIn={(signedIn) => {
          setUser(signedIn);
          void refreshLiveData().catch((error) => toast.error(errorMessage(error, "Could not load live data")));
          toast.success(`Signed in as ${signedIn.username}`);
        }}
      />
    </div>
  );
}

function AdminGate({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  return (
    <Card className="gate-card">
      <ShieldAlert size={28} aria-hidden="true" />
      <h1>Admins only</h1>
      <p>{signedIn ? "Your account can view the site but not change it." : "Sign in with an admin account to manage this site."}</p>
      <div className="gate-actions">
        <Button asChild variant="outline"><a href={routeHref({ page: "home" })}>Back home</a></Button>
        {!signedIn && <Button onClick={onSignIn}><LogIn size={16} /> Sign in</Button>}
      </div>
    </Card>
  );
}

function LoginDialog({ open, onOpenChange, onSignedIn }: { open: boolean; onOpenChange: (open: boolean) => void; onSignedIn: (user: User) => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await api.login(String(form.get("username")), String(form.get("password")));
      onSignedIn(result.user);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "Could not sign in"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setError(""); onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-sm">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">Welcome back</Dialog.Title>
              <Dialog.Description className="dialog-description">Sign in to manage your Home Hub.</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X size={16} /></Button></Dialog.Close>
          </div>
          <form className="form" onSubmit={login}>
            {error && <div className="form-error" role="alert">{error}</div>}
            <Field label="Username"><Input name="username" autoComplete="username" required autoFocus /></Field>
            <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
