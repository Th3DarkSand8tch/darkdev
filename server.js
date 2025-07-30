const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');
const qs = require('querystring');

const PORT = 3000;
const DB_FILE = 'db.json';

let db = { users: {}, ipToUser: {}, sessions: {} };

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
      console.error('Failed to parse DB file:', e);
    }
  }
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function send(res, status, content, type = 'text/html') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(content);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    cookies[parts[0]] = decodeURIComponent(parts[1]);
  });
  return cookies;
}

function handleHome(req, res, username) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Site de Bios</title></head>
<body>
<h1>Site de Bios</h1>
${username ? `<p>Bonjour ${username} | <a href="/logout">Déconnexion</a> | <a href="/dashboard">Gérer ma bio</a></p>` : `
<h2>Connexion</h2>
<form method="POST" action="/login">
<input name="username" placeholder="Nom d'utilisateur"><br>
<input type="password" name="password" placeholder="Mot de passe"><br>
<button type="submit">Se connecter</button>
</form>
<h2>Inscription</h2>
<form method="POST" action="/register">
<input name="username" placeholder="Nom d'utilisateur"><br>
<input type="password" name="password" placeholder="Mot de passe"><br>
<button type="submit">Créer un compte</button>
</form>
`}
</body></html>`;
  send(res, 200, html);
}

function handleRegister(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const data = qs.parse(body);
    const ip = req.socket.remoteAddress;
    if (db.ipToUser[ip]) {
      send(res, 400, 'Cette IP a déjà créé un compte.');
      return;
    }
    if (!data.username || !data.password) {
      send(res, 400, 'Champs manquants');
      return;
    }
    if (db.users[data.username]) {
      send(res, 400, 'Utilisateur déjà existant');
      return;
    }
    const hash = crypto.createHash('sha256').update(data.password).digest('hex');
    db.users[data.username] = { password: hash, bio: 'Nouvelle bio' };
    db.ipToUser[ip] = data.username;
    saveDb();
    res.writeHead(302, { Location: '/' });
    res.end();
  });
}

function handleLogin(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const data = qs.parse(body);
    const user = db.users[data.username];
    if (!user) {
      send(res, 400, 'Identifiants invalides');
      return;
    }
    const hash = crypto.createHash('sha256').update(data.password).digest('hex');
    if (hash !== user.password) {
      send(res, 400, 'Identifiants invalides');
      return;
    }
    const token = generateToken();
    db.sessions[token] = data.username;
    saveDb();
    res.writeHead(302, { Location: '/', 'Set-Cookie': `session=${token}; HttpOnly` });
    res.end();
  });
}

function handleLogout(req, res, sessionId) {
  delete db.sessions[sessionId];
  saveDb();
  res.writeHead(302, { Location: '/', 'Set-Cookie': 'session=; Max-Age=0' });
  res.end();
}

function requireLogin(req, res, sessionId) {
  const user = db.sessions[sessionId];
  if (!user) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return null;
  }
  return user;
}

function handleDashboard(req, res, username) {
  const bio = db.users[username].bio || '';
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Mon compte</title></head>
<body>
<h1>Mon Compte</h1>
<p><a href="/">Accueil</a> | <a href="/logout">Déconnexion</a></p>
<form method="POST" action="/update">
<textarea name="bio" rows="5" cols="40">${bio}</textarea><br>
<button type="submit">Mettre à jour</button>
</form>
</body></html>`;
  send(res, 200, html);
}

function handleUpdate(req, res, username) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const data = qs.parse(body);
    db.users[username].bio = data.bio || '';
    saveDb();
    res.writeHead(302, { Location: '/dashboard' });
    res.end();
  });
}

function handleUserPage(req, res, username) {
  const user = db.users[username];
  if (!user) {
    send(res, 404, 'Page non trouvée');
    return;
  }
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${username}</title></head>
<body>
<h1>${username}</h1>
<p>${user.bio}</p>
<p><a href="/">Accueil</a></p>
</body></html>`;
  send(res, 200, html);
}

function onRequest(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const path = parsed.pathname;
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.session;
  const username = db.sessions[sessionId];

  if (path === '/' && req.method === 'GET') {
    handleHome(req, res, username);
  } else if (path === '/register' && req.method === 'POST') {
    handleRegister(req, res);
  } else if (path === '/login' && req.method === 'POST') {
    handleLogin(req, res);
  } else if (path === '/logout') {
    handleLogout(req, res, sessionId);
  } else if (path === '/dashboard') {
    const user = requireLogin(req, res, sessionId);
    if (user) handleDashboard(req, res, user);
  } else if (path === '/update' && req.method === 'POST') {
    const user = requireLogin(req, res, sessionId);
    if (user) handleUpdate(req, res, user);
  } else if (path.length > 1) {
    handleUserPage(req, res, path.slice(1));
  } else {
    send(res, 404, 'Not found');
  }
}

loadDb();
http.createServer(onRequest).listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
