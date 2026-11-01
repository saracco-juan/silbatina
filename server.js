// La Silbatina — servidor
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const SALT = process.env.HASH_SALT || "silbatina";
const MAX_LEN = 280;
const MAX_VOTES = 5;
const TAGS = ["AFA", "Arbitraje", "Torneo y calendario", "Televisación", "Clubes", "Seguridad", "Selección", "Otro"];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      author TEXT UNIQUE NOT NULL,
      text TEXT NOT NULL,
      tag TEXT NOT NULL,
      alias TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      edited_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      author TEXT NOT NULL,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      PRIMARY KEY (author, post_id)
    );
    CREATE INDEX IF NOT EXISTS votes_post ON votes(post_id);
    CREATE INDEX IF NOT EXISTS posts_ip ON posts(ip_hash);
  `);
}

const hash = (s) => crypto.createHash("sha256").update(SALT + ":" + s).digest("hex");

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  });
  next();
});

// Sesión anónima: cookie aleatoria; en la base solo se guarda su hash
function session(req, res, next) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || "");
  let sid = m && m[1];
  if (!sid) {
    sid = crypto.randomBytes(24).toString("hex");
    res.cookie("sid", sid, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 1000 * 60 * 60 * 24 * 365 });
  }
  req.author = hash("sid:" + sid);
  req.ipHash = hash("ip:" + (req.ip || ""));
  next();
}

// Límite de pedidos de escritura por IP (en memoria)
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ipHash + ":" + req.path;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, t: now };
    if (now - b.t > windowMs) { b.n = 0; b.t = now; }
    b.n++;
    buckets.set(key, b);
    if (b.n > max) return res.status(429).json({ error: "Muchos intentos seguidos. Esperá un minuto y probá de nuevo." });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 600000) buckets.delete(k); }, 600000).unref();

function cleanLink(v) {
  v = String(v || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href.slice(0, 500);
  } catch { return null; }
}

app.get("/api/state", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.text, p.tag, p.alias, p.link, p.created_at, COUNT(v.post_id)::int AS votes
      FROM posts p LEFT JOIN votes v ON v.post_id = p.id
      GROUP BY p.id ORDER BY votes DESC, p.created_at DESC LIMIT 1000`);
    res.set("Cache-Control", "no-store");
    res.json({ posts: rows.map((r) => ({ id: r.id, text: r.text, tag: r.tag, alias: r.alias, link: r.link, createdAt: Number(r.created_at), votes: r.votes })) });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo leer la tribuna." }); }
});

app.get("/api/me", session, async (req, res) => {
  try {
    const p = await pool.query("SELECT id, text, tag, alias, link FROM posts WHERE author=$1", [req.author]);
    const v = await pool.query("SELECT post_id FROM votes WHERE author=$1", [req.author]);
    res.set("Cache-Control", "no-store");
    res.json({ post: p.rows[0] || null, votes: v.rows.map((r) => r.post_id), maxVotes: MAX_VOTES });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo leer tu sesión." }); }
});

app.put("/api/post", session, rateLimit(10, 60000), async (req, res) => {
  const b = req.body || {};
  const text = String(b.text || "").trim().replace(/\s+/g, " ");
  const tag = TAGS.includes(b.tag) ? b.tag : "Otro";
  const alias = String(b.alias || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const link = cleanLink(b.link);
  if (text.length < 8) return res.status(400).json({ error: "Escribí al menos una frase corta." });
  if (text.length > MAX_LEN) return res.status(400).json({ error: `Te pasaste de ${MAX_LEN} caracteres.` });
  if (link === null) return res.status(400).json({ error: "El link tiene que empezar con https://" });
  try {
    const existing = await pool.query("SELECT id FROM posts WHERE author=$1", [req.author]);
    const now = Date.now();
    if (existing.rows.length) {
      await pool.query("UPDATE posts SET text=$1, tag=$2, alias=$3, link=$4, edited_at=$5 WHERE author=$6", [text, tag, alias, link, now, req.author]);
      return res.json({ ok: true, updated: true });
    }
    const perIp = await pool.query("SELECT COUNT(*)::int AS n FROM posts WHERE ip_hash=$1 AND created_at > $2", [req.ipHash, now - 86400000]);
    if (perIp.rows[0].n >= 3) return res.status(429).json({ error: "Desde esta conexión ya se publicaron varios mensajes hoy. Probá mañana." });
    await pool.query("INSERT INTO posts (author, text, tag, alias, link, ip_hash, created_at, edited_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)", [req.author, text, tag, alias, link, req.ipHash, now]);
    res.json({ ok: true, created: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo publicar. Probá de nuevo." }); }
});

app.delete("/api/post", session, rateLimit(10, 60000), async (req, res) => {
  try { await pool.query("DELETE FROM posts WHERE author=$1", [req.author]); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "No se pudo borrar." }); }
});

app.post("/api/vote", session, rateLimit(40, 60000), async (req, res) => {
  const postId = Number((req.body || {}).postId);
  if (!Number.isInteger(postId)) return res.status(400).json({ error: "Mensaje inválido." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.author]);
    const had = await client.query("DELETE FROM votes WHERE author=$1 AND post_id=$2 RETURNING post_id", [req.author, postId]);
    if (!had.rows.length) {
      const post = await client.query("SELECT author FROM posts WHERE id=$1", [postId]);
      if (!post.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Ese mensaje ya no está." }); }
      const n = await client.query("SELECT COUNT(*)::int AS n FROM votes WHERE author=$1", [req.author]);
      if (n.rows[0].n >= MAX_VOTES) { await client.query("ROLLBACK"); return res.status(400).json({ error: `Ya usaste tus ${MAX_VOTES} silbidos. Sacá uno para silbar otro.` }); }
      const ipN = await client.query("SELECT COUNT(*)::int AS n FROM votes WHERE ip_hash=$1 AND post_id=$2", [req.ipHash, postId]);
      if (ipN.rows[0].n >= 5) { await client.query("ROLLBACK"); return res.status(429).json({ error: "Este mensaje ya recibió muchos silbidos desde tu conexión." }); }
      await client.query("INSERT INTO votes (author, post_id, ip_hash, created_at) VALUES ($1,$2,$3,$4)", [req.author, postId, req.ipHash, Date.now()]);
    }
    await client.query("COMMIT");
    res.json({ ok: true, voted: !had.rows.length });
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); console.error(e); res.status(500).json({ error: "No se pudo guardar el silbido." }); }
  finally { client.release(); }
});

// Moderación: requiere ADMIN_KEY
app.delete("/api/admin/post/:id", async (req, res) => {
  const key = String(req.get("x-admin-key") || "");
  if (!ADMIN_KEY || key.length !== ADMIN_KEY.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY))) return res.status(401).json({ error: "Clave incorrecta." });
  try { await pool.query("DELETE FROM posts WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "No se pudo quitar." }); }
});

app.get("/healthz", (req, res) => res.send("ok"));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "5m" }));

migrate()
  .then(() => app.listen(PORT, () => console.log("La Silbatina en el puerto " + PORT)))
  .catch((e) => { console.error("Error al preparar la base:", e); process.exit(1); });
