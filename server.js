const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
  next();
}
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, email: row.email,
    bio: row.bio || "", avatar: row.avatar || "",
    followers: row.followers || 0, following: row.following || 0,
    isFollowing: Boolean(row.isFollowing), isMe: Boolean(row.isMe)
  };
}
function getUser(userId, viewerId = null) {
  return db.prepare(`
    SELECT u.id, u.username, u.email, u.bio, u.avatar,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) AS isFollowing,
      (u.id=?) AS isMe
    FROM users u WHERE u.id=?
  `).get(viewerId || -1, viewerId || -1, userId);
}

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: publicUser(getUser(req.session.userId, req.session.userId)) });
});

app.post("/api/auth/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (username.length < 3 || username.length > 24) return res.status(400).json({ error: "Username must be 3–24 characters." });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: "Username can contain letters, numbers and underscores only." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (db.prepare("SELECT id FROM users WHERE email=? OR username=?").get(email, username))
    return res.status(409).json({ error: "That email or username is already registered." });
  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare("INSERT INTO users (username,email,password) VALUES (?,?,?)").run(username, email, hash);
  req.session.userId = result.lastInsertRowid;
  res.status(201).json({ user: publicUser(getUser(result.lastInsertRowid, result.lastInsertRowid)) });
});

app.post("/api/auth/login", async (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE lower(email)=? OR lower(username)=?").get(login, login);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: "Incorrect username/email or password." });
  req.session.userId = user.id;
  res.json({ user: publicUser(getUser(user.id, user.id)) });
});
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/feed", (req, res) => {
  const viewerId = req.session.userId || -1;
  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS likeCount,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) AS commentCount,
      EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) AS liked
    FROM posts p JOIN users u ON u.id=p.user_id
    ORDER BY p.created_at DESC LIMIT 100
  `).all(viewerId);
  res.json({ posts });
});

app.post("/api/posts", requireAuth, upload.single("image"), (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content && !req.file) return res.status(400).json({ error: "Write something or add an image." });
  if (content.length > 2000) return res.status(400).json({ error: "Post must be 2,000 characters or fewer." });
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare("INSERT INTO posts (user_id,content,image) VALUES (?,?,?)").run(req.session.userId, content, image);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.post("/api/posts/:id/like", requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  if (!db.prepare("SELECT id FROM posts WHERE id=?").get(postId)) return res.status(404).json({ error: "Post not found." });
  const existing = db.prepare("SELECT id FROM likes WHERE post_id=? AND user_id=?").get(postId, req.session.userId);
  if (existing) db.prepare("DELETE FROM likes WHERE post_id=? AND user_id=?").run(postId, req.session.userId);
  else db.prepare("INSERT INTO likes (post_id,user_id) VALUES (?,?)").run(postId, req.session.userId);
  const count = db.prepare("SELECT COUNT(*) AS count FROM likes WHERE post_id=?").get(postId).count;
  res.json({ liked: !existing, likeCount: count });
});

app.get("/api/posts/:id/comments", (req, res) => {
  const comments = db.prepare(`
    SELECT c.id,c.comment_text,c.created_at,u.id AS user_id,u.username,u.avatar
    FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.post_id=? ORDER BY c.created_at ASC
  `).all(Number(req.params.id));
  res.json({ comments });
});
app.post("/api/posts/:id/comments", requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  const comment = String(req.body.comment || "").trim();
  if (!comment || comment.length > 500) return res.status(400).json({ error: "Comment must be between 1 and 500 characters." });
  if (!db.prepare("SELECT id FROM posts WHERE id=?").get(postId)) return res.status(404).json({ error: "Post not found." });
  const result = db.prepare("INSERT INTO comments (post_id,user_id,comment_text) VALUES (?,?,?)").run(postId, req.session.userId, comment);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/users/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ users: [] });
  const rows = db.prepare(`
    SELECT u.id,u.username,u.bio,u.avatar,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) AS isFollowing,
      (u.id=?) AS isMe
    FROM users u WHERE u.username LIKE ? AND u.id != ?
    ORDER BY followers DESC LIMIT 20
  `).all(req.session.userId || -1, req.session.userId || -1, `%${q}%`, req.session.userId || -1);
  res.json({ users: rows.map(publicUser) });
});

app.get("/api/users/:id", (req, res) => {
  const user = getUser(Number(req.params.id), req.session.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  const posts = db.prepare(`
    SELECT p.*,u.username,u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS likeCount,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) AS commentCount,
      EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) AS liked
    FROM posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=?
    ORDER BY p.created_at DESC
  `).all(req.session.userId || -1, Number(req.params.id));
  res.json({ user: publicUser(user), posts });
});

app.put("/api/profile", requireAuth, upload.single("avatar"), (req, res) => {
  const bio = String(req.body.bio || "").trim().slice(0, 160);
  const avatar = req.file ? `/uploads/${req.file.filename}` : null;
  if (avatar) db.prepare("UPDATE users SET bio=?,avatar=? WHERE id=?").run(bio, avatar, req.session.userId);
  else db.prepare("UPDATE users SET bio=? WHERE id=?").run(bio, req.session.userId);
  res.json({ user: publicUser(getUser(req.session.userId, req.session.userId)) });
});

app.post("/api/users/:id/follow", requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.session.userId) return res.status(400).json({ error: "You cannot follow yourself." });
  if (!db.prepare("SELECT id FROM users WHERE id=?").get(targetId)) return res.status(404).json({ error: "User not found." });
  const existing = db.prepare("SELECT id FROM follows WHERE follower_id=? AND following_id=?").get(req.session.userId, targetId);
  if (existing) db.prepare("DELETE FROM follows WHERE follower_id=? AND following_id=?").run(req.session.userId, targetId);
  else db.prepare("INSERT INTO follows (follower_id,following_id) VALUES (?,?)").run(req.session.userId, targetId);
  res.json({ following: !existing });
});

app.get("/api/users/:id/followers", (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.username,u.bio,u.avatar,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) AS isFollowing,
      (u.id=?) AS isMe
    FROM follows f JOIN users u ON u.id=f.follower_id
    WHERE f.following_id=? ORDER BY u.username
  `).all(req.session.userId || -1, req.session.userId || -1, Number(req.params.id));
  res.json({ users: rows.map(publicUser) });
});
app.get("/api/users/:id/following", (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.username,u.bio,u.avatar,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) AS isFollowing,
      (u.id=?) AS isMe
    FROM follows f JOIN users u ON u.id=f.following_id
    WHERE f.follower_id=? ORDER BY u.username
  `).all(req.session.userId || -1, req.session.userId || -1, Number(req.params.id));
  res.json({ users: rows.map(publicUser) });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong." });
});

app.listen(PORT, () => console.log(`SocialHub running at http://localhost:${PORT}`));
