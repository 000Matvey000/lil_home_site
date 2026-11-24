import { useEffect, useState } from "react";

export const ADMIN_TABS = ["customize", "photos", "users", "integrations"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
export type Route = { page: "home" } | { page: "admin"; tab: AdminTab };

function parseHash(hash: string): Route {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page === "admin") {
    return { page: "admin", tab: (ADMIN_TABS as readonly string[]).includes(tab) ? (tab as AdminTab) : "customize" };
  }
  return { page: "home" };
}

export function routeHref(route: Route) {
  return route.page === "admin" ? `#/admin/${route.tab}` : "#/";
}

export function navigate(route: Route) {
  window.location.hash = routeHref(route);
}

/** Minimal hash router: keeps the admin tab in the URL so refresh/back work. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
