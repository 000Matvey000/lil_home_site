import bcrypt from "bcryptjs";
import { db } from "./db";
export function seed() {
    var settings = db.prepare("SELECT value FROM settings WHERE key='siteName'").get();
    if (!settings)
        db.prepare("INSERT INTO settings(key, value) VALUES ('siteName','Home Hub')").run();
    var userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    if (!userCount) {
        var username = process.env.ADMIN_USERNAME || "admin";
        var password = process.env.ADMIN_PASSWORD || "change-me-now";
        db.prepare("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)")
            .run(username, bcrypt.hashSync(password, 12), "admin");
        console.log("Seeded admin account \"".concat(username, "\". Change the password after signing in."));
    }
    var linkCount = db.prepare("SELECT COUNT(*) AS count FROM links").get().count;
    if (!linkCount) {
        var insert_1 = db.prepare("INSERT INTO links(title,url,description,department,color) VALUES (?,?,?,?,?)");
        var oldLinks_1 = [
            ["Google", "https://www.google.com", "Search the web.", "IT", "#4285F4"],
            ["YouTube", "https://www.youtube.com", "Watch and share videos.", "Media", "#FF0000"],
            ["GitHub", "https://github.com", "Host and collaborate on code.", "IT", "#181717"],
            ["Figma", "https://www.figma.com", "Collaborate on interface designs.", "Design", "#F24E1E"],
            ["Canva", "https://www.canva.com", "Create simple graphics and presentations.", "Design", "#00C4CC"],
            ["Salesforce", "https://www.salesforce.com", "Customer relationship management.", "Sales", "#00A1E0"],
            ["HubSpot", "https://www.hubspot.com", "Marketing and sales software.", "Marketing", "#FF7A00"],
            ["WordPress", "https://wordpress.com", "Create and manage websites.", "Development", "#21759B"],
        ];
        db.transaction(function () { return oldLinks_1.forEach(function (link) { return insert_1.run.apply(insert_1, link); }); })();
    }
    var announcementCount = db.prepare("SELECT COUNT(*) AS count FROM announcements").get().count;
    if (!announcementCount) {
        db.prepare("INSERT INTO announcements(title,body,color) VALUES (?,?,?)")
            .run("Welcome home!", "Use Home Hub to find your favorite tools and stay up to date.", "#4f46e5");
    }
}
seed();
