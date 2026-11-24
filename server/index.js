import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { db } from "./db";
import "./seed";
var app = express();
var port = Number(process.env.PORT || 3001);
var jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret";
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());
function decodeBlob(row, prefix) {
    if (!row["".concat(prefix, "_data")])
        return null;
    return {
        name: row["".concat(prefix, "_name")],
        type: row["".concat(prefix, "_type")],
        base64: Buffer.from(row["".concat(prefix, "_data")]).toString("base64"),
    };
}
function mapLink(row) {
    var thumbnail = decodeBlob(row, "thumbnail");
    var attachment = decodeBlob(row, "attachment");
    return {
        id: row.id,
        title: row.title,
        url: row.url,
        description: row.description,
        department: row.department,
        color: row.color,
        thumbnail: thumbnail ? { name: thumbnail.name, type: thumbnail.type, dataUrl: "data:".concat(thumbnail.type, ";base64,").concat(thumbnail.base64) } : null,
        attachment: attachment ? { name: attachment.name, type: attachment.type } : null,
    };
}
function auth(req, res, next) {
    var _a;
    var token = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.token;
    if (!token)
        return res.status(401).json({ error: "Authentication required" });
    try {
        req.user = jwt.verify(token, jwtSecret);
        next();
    }
    catch (_b) {
        res.status(401).json({ error: "Invalid or expired session" });
    }
}
function admin(req, res, next) {
    var user = req.user;
    if (user.role !== "admin")
        return res.status(403).json({ error: "Admin access required" });
    next();
}
function blobFromBase64(value) {
    if (!value)
        return null;
    var match = /^data:(.+);base64,(.*)$/.exec(value);
    if (!match)
        throw new Error("Invalid base64 file");
    return { type: match[1], data: Buffer.from(match[2], "base64") };
}
app.post("/api/auth/login", function (req, res) {
    var _a = req.body, username = _a.username, password = _a.password;
    var user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
        return res.status(401).json({ error: "Incorrect username or password" });
    }
    var payload = { id: user.id, username: user.username, role: user.role };
    var token = jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user: payload });
});
app.post("/api/auth/logout", function (_req, res) {
    res.clearCookie("token");
    res.status(204).end();
});
app.get("/api/auth/me", auth, function (req, res) {
    res.json({ user: req.user });
});
app.get("/api/settings", function (_req, res) {
    var settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map(function (row) { return [row.key, row.value]; }));
    res.json(settings);
});
app.put("/api/settings", auth, admin, function (req, res) {
    var upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    db.transaction(function () {
        if (typeof req.body.siteName === "string")
            upsert.run("siteName", req.body.siteName);
    })();
    res.json(Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map(function (row) { return [row.key, row.value]; })));
});
app.get("/api/announcements", function (_req, res) {
    res.json(db.prepare("SELECT id, title, body, color, created_at AS createdAt FROM announcements ORDER BY id DESC").all());
});
app.post("/api/announcements", auth, admin, function (req, res) {
    var _a = req.body, title = _a.title, _b = _a.body, body = _b === void 0 ? "" : _b, _c = _a.color, color = _c === void 0 ? "#4f46e5" : _c;
    if (!(title === null || title === void 0 ? void 0 : title.trim()))
        return res.status(400).json({ error: "Title is required" });
    var result = db.prepare("INSERT INTO announcements(title, body, color) VALUES (?, ?, ?)").run(title.trim(), body.trim(), color);
    res.status(201).json(db.prepare("SELECT id, title, body, color, created_at AS createdAt FROM announcements WHERE id = ?").get(result.lastInsertRowid));
});
app.put("/api/announcements/:id", auth, admin, function (req, res) {
    var _a = req.body, title = _a.title, _b = _a.body, body = _b === void 0 ? "" : _b, _c = _a.color, color = _c === void 0 ? "#4f46e5" : _c;
    var result = db.prepare("UPDATE announcements SET title=?, body=?, color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title === null || title === void 0 ? void 0 : title.trim(), body.trim(), color, req.params.id);
    if (!result.changes)
        return res.status(404).json({ error: "Announcement not found" });
    res.json(db.prepare("SELECT id, title, body, color, created_at AS createdAt FROM announcements WHERE id = ?").get(req.params.id));
});
app.delete("/api/announcements/:id", auth, admin, function (req, res) {
    db.prepare("DELETE FROM announcements WHERE id=?").run(req.params.id);
    res.status(204).end();
});
app.get("/api/links", function (_req, res) {
    res.json(db.prepare("SELECT * FROM links ORDER BY department, title").all().map(mapLink));
});
app.post("/api/links", auth, admin, function (req, res) {
    var _a = req.body, title = _a.title, _b = _a.url, url = _b === void 0 ? "" : _b, _c = _a.description, description = _c === void 0 ? "" : _c, _d = _a.department, department = _d === void 0 ? "General" : _d, _e = _a.color, color = _e === void 0 ? "#4f46e5" : _e, thumbnail = _a.thumbnail, attachment = _a.attachment;
    if (!(title === null || title === void 0 ? void 0 : title.trim()))
        return res.status(400).json({ error: "Title is required" });
    try {
        var thumb = (thumbnail === null || thumbnail === void 0 ? void 0 : thumbnail.base64) ? blobFromBase64(thumbnail.base64) : null;
        var attach = (attachment === null || attachment === void 0 ? void 0 : attachment.base64) ? blobFromBase64(attachment.base64) : null;
        var result = db.prepare("INSERT INTO links(title,url,description,department,color,thumbnail_name,thumbnail_type,thumbnail_data,attachment_name,attachment_type,attachment_data)\n      VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(title.trim(), url.trim(), description.trim(), department.trim(), color, (thumbnail === null || thumbnail === void 0 ? void 0 : thumbnail.name) || null, (thumb === null || thumb === void 0 ? void 0 : thumb.type) || null, (thumb === null || thumb === void 0 ? void 0 : thumb.data) || null, (attachment === null || attachment === void 0 ? void 0 : attachment.name) || null, (attach === null || attach === void 0 ? void 0 : attach.type) || null, (attach === null || attach === void 0 ? void 0 : attach.data) || null);
        res.status(201).json(mapLink(db.prepare("SELECT * FROM links WHERE id=?").get(result.lastInsertRowid)));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.put("/api/links/:id", auth, admin, function (req, res) {
    var existing = db.prepare("SELECT * FROM links WHERE id=?").get(req.params.id);
    if (!existing)
        return res.status(404).json({ error: "Link not found" });
    var _a = req.body, title = _a.title, _b = _a.url, url = _b === void 0 ? "" : _b, _c = _a.description, description = _c === void 0 ? "" : _c, _d = _a.department, department = _d === void 0 ? "General" : _d, _e = _a.color, color = _e === void 0 ? "#4f46e5" : _e, thumbnail = _a.thumbnail, attachment = _a.attachment;
    try {
        var thumb = (thumbnail === null || thumbnail === void 0 ? void 0 : thumbnail.base64) ? blobFromBase64(thumbnail.base64) : null;
        var attach = (attachment === null || attachment === void 0 ? void 0 : attachment.base64) ? blobFromBase64(attachment.base64) : null;
        db.prepare("UPDATE links SET title=?,url=?,description=?,department=?,color=?,\n      thumbnail_name=COALESCE(?,thumbnail_name),thumbnail_type=COALESCE(?,thumbnail_type),thumbnail_data=COALESCE(?,thumbnail_data),\n      attachment_name=COALESCE(?,attachment_name),attachment_type=COALESCE(?,attachment_type),attachment_data=COALESCE(?,attachment_data),\n      updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title.trim(), url.trim(), description.trim(), department.trim(), color, thumb ? thumbnail.name : null, (thumb === null || thumb === void 0 ? void 0 : thumb.type) || null, (thumb === null || thumb === void 0 ? void 0 : thumb.data) || null, attach ? attachment.name : null, (attach === null || attach === void 0 ? void 0 : attach.type) || null, (attach === null || attach === void 0 ? void 0 : attach.data) || null, req.params.id);
        res.json(mapLink(db.prepare("SELECT * FROM links WHERE id=?").get(req.params.id)));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.delete("/api/links/:id", auth, admin, function (req, res) {
    db.prepare("DELETE FROM links WHERE id=?").run(req.params.id);
    res.status(204).end();
});
app.get("/api/links/:id/attachment", function (req, res) {
    var row = db.prepare("SELECT attachment_name, attachment_type, attachment_data FROM links WHERE id=?").get(req.params.id);
    if (!(row === null || row === void 0 ? void 0 : row.attachment_data))
        return res.status(404).json({ error: "Attachment not found" });
    res.setHeader("Content-Type", row.attachment_type);
    res.setHeader("Content-Disposition", "attachment; filename=\"".concat(encodeURIComponent(row.attachment_name), "\""));
    res.send(row.attachment_data);
});
app.get("/api/users", auth, admin, function (_req, res) {
    res.json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users ORDER BY username").all());
});
app.post("/api/users", auth, admin, function (req, res) {
    var _a = req.body, username = _a.username, password = _a.password, _b = _a.role, role = _b === void 0 ? "user" : _b;
    if (!(username === null || username === void 0 ? void 0 : username.trim()) || !password || !["user", "admin"].includes(role))
        return res.status(400).json({ error: "Valid username, password, and role are required" });
    try {
        var result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)").run(username.trim(), bcrypt.hashSync(password, 12), role);
        res.status(201).json(db.prepare("SELECT id, username, role, created_at AS createdAt FROM users WHERE id=?").get(result.lastInsertRowid));
    }
    catch (_c) {
        res.status(409).json({ error: "Username already exists" });
    }
});
app.delete("/api/users/:id", auth, admin, function (req, res) {
    var current = req.user;
    if (Number(req.params.id) === current.id)
        return res.status(400).json({ error: "You cannot delete the signed-in account" });
    db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
    res.status(204).end();
});
var distDir = path.join(process.cwd(), "dist");
if (fs.existsSync(distDir))
    app.use(express.static(distDir));
app.use(function (_req, res) {
    if (fs.existsSync(path.join(distDir, "index.html")))
        res.sendFile(path.join(distDir, "index.html"));
    else
        res.status(404).json({ error: "Not found" });
});
app.listen(port, "0.0.0.0", function () { return console.log("Home Hub API listening on http://0.0.0.0:".concat(port)); });
