-- Electric Man D1 schema (separate from Bus Rush). Run once in the D1 console.
CREATE TABLE IF NOT EXISTS em_players(id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_identities(id TEXT PRIMARY KEY, provider TEXT NOT NULL, player TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS em_identities_player ON em_identities(player);
CREATE TABLE IF NOT EXISTS em_sessions(id TEXT PRIMARY KEY, player TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS em_sessions_player ON em_sessions(player);
CREATE TABLE IF NOT EXISTS em_nonces(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_email_codes(id TEXT PRIMARY KEY, nonce TEXT NOT NULL, email_hash TEXT NOT NULL, digest TEXT NOT NULL, attempts INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_limits(id TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_saves(player TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_clears(id TEXT PRIMARY KEY, player TEXT NOT NULL, week TEXT NOT NULL, level INTEGER NOT NULL, moves INTEGER NOT NULL, stars INTEGER NOT NULL, points INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS em_clears_week ON em_clears(week, player);
CREATE TABLE IF NOT EXISTS em_friends(id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS em_friends_a ON em_friends(a);
CREATE INDEX IF NOT EXISTS em_friends_b ON em_friends(b);
CREATE TABLE IF NOT EXISTS em_blocks(id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL);
-- chat (friends only), translation cache, abuse reports — the API also creates these on first use
CREATE TABLE IF NOT EXISTS em_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, text TEXT NOT NULL, lang TEXT NOT NULL, created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS em_messages_pair ON em_messages(pair, id);
CREATE INDEX IF NOT EXISTS em_messages_unread ON em_messages(recipient, read);
CREATE TABLE IF NOT EXISTS em_translations(msg INTEGER NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(msg, lang));
CREATE TABLE IF NOT EXISTS em_tickets(id TEXT PRIMARY KEY, player TEXT NOT NULL, challenge TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS em_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL, target TEXT NOT NULL, msg INTEGER, snapshot TEXT, reason TEXT, created INTEGER NOT NULL);
