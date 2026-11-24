import bcrypt from "bcryptjs";
import { db } from "./db";

export function seed() {
  const defaultSettings: Record<string, string> = {
    siteName: "Home Hub",
    headerSubtitle: "Quick links & updates",
    announcementsTitle: "Announcements",
    linksTitle: "Useful links",
    footerText: "Home Hub keeps your household informed.",
    showHero: "true",
    showIntegrations: "true",
    showAnnouncements: "true",
    showLinks: "true",
  };
  const upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  db.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      const existing = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
      if (!existing) upsert.run(key, value);
    }
  })();

  const userCount = (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
  if (!userCount) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "change-me-now";
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)")
      .run(username, bcrypt.hashSync(password, 12), "admin");
    console.log(`Seeded admin account "${username}". Change the password after signing in.`);
  }

  const linkCount = (db.prepare("SELECT COUNT(*) AS count FROM links").get() as { count: number }).count;
  if (!linkCount) {
    const insert = db.prepare("INSERT INTO links(title,url,description,department,category,color) VALUES (?,?,?,?,?,?)");
    const oldLinks = [
      ["Google", "https://www.google.com", "Search the web.", "IT", "Search", "#4285F4"],
      ["YouTube", "https://www.youtube.com", "Watch and share videos.", "Media", "Video", "#FF0000"],
      ["GitHub", "https://github.com", "Host and collaborate on code.", "IT", "Development", "#181717"],
      ["Figma", "https://www.figma.com", "Collaborate on interface designs.", "Design", "Design", "#F24E1E"],
      ["Canva", "https://www.canva.com", "Create simple graphics and presentations.", "Design", "Design", "#00C4CC"],
      ["Salesforce", "https://www.salesforce.com", "Customer relationship management.", "Sales", "CRM", "#00A1E0"],
      ["HubSpot", "https://www.hubspot.com", "Marketing and sales software.", "Marketing", "Marketing", "#FF7A00"],
      ["WordPress", "https://wordpress.com", "Create and manage websites.", "Development", "CMS", "#21759B"],
    ];
    db.transaction(() => oldLinks.forEach((link) => insert.run(...link)))();
  }

  const announcementCount = (db.prepare("SELECT COUNT(*) AS count FROM announcements").get() as { count: number }).count;
  if (!announcementCount) {
    db.prepare("INSERT INTO announcements(title,body,color,category) VALUES (?,?,?,?)")
      .run("Welcome home!", "Use Home Hub to find your favorite tools and stay up to date.", "#4f46e5", "General");
  }
}

seed();
