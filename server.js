const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');
const qs = require('querystring');
const pathModule = require('path');

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
<head>
<meta charset="UTF-8">
<title>Site de Bios</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <h1>Site de Bios</h1>
    ${username ? `<p>Bonjour ${username} | <a href="/dashboard">Dashboard</a> | <a href="/customise">Customise</a> | <a href="/logout">Déconnexion</a></p>` : `<p><a href="/login">Connexion</a> | <a href="/register">Créer un compte</a></p>`}
  </div>
</body></html>`;
  send(res, 200, html);
}

function handleLoginPage(req, res) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Connexion</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <h1>Connexion</h1>
    <form method="POST" action="/login">
      <input name="username" placeholder="Nom d'utilisateur" required>
      <input type="password" name="password" placeholder="Mot de passe" required>
      <div class="actions"><button type="submit">Se connecter</button></div>
    </form>
    <p><a href="/register">Créer un compte</a></p>
    <p><a href="/">Accueil</a></p>
  </div>
</body></html>`;
  send(res, 200, html);
}

function handleRegisterPage(req, res) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Inscription</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <h1>Inscription</h1>
    <form method="POST" action="/register">
      <input name="username" placeholder="Nom d'utilisateur" required>
      <input type="password" name="password" placeholder="Mot de passe" required>
      <div class="actions"><button type="submit">Créer un compte</button></div>
    </form>
    <p><a href="/login">Connexion</a></p>
    <p><a href="/">Accueil</a></p>
  </div>
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
    db.users[data.username] = {
      password: hash,
      bio: 'Nouvelle bio',
      style: { bgColor: '#000000', textColor: '#f0f0f0' }
    };
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
<head>
<meta charset="UTF-8">
<title>Mon compte</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <h1>Mon Compte</h1>
    <p><a href="/">Accueil</a> | <a href="/customise">Personnaliser</a> | <a href="/logout">Déconnexion</a></p>
    <form method="POST" action="/update">
      <textarea name="bio" rows="5" cols="40">${bio}</textarea>
      <div class="actions"><button type="submit">Mettre à jour</button></div>
    </form>
  </div>
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

function handleCustomisePage(req, res, username) {
  const user = db.users[username];
  const style = user.style || { bgColor: '#000000', textColor: '#f0f0f0' };
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Customise</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <h1>Personnaliser</h1>
    <form method="POST" action="/customise">
      <label>Couleur de fond</label>
      <input type="color" name="bgColor" value="${style.bgColor}">
      <label>Couleur du texte</label>
      <input type="color" name="textColor" value="${style.textColor}">
      <div class="actions"><button type="submit">Enregistrer</button></div>
    </form>
    <p><a href="/dashboard">Retour</a></p>
  </div>
</body></html>`;
  send(res, 200, html);
}

function handleCustomiseUpdate(req, res, username) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const data = qs.parse(body);
    db.users[username].style = {
      bgColor: data.bgColor || '#000000',
      textColor: data.textColor || '#f0f0f0'
    };
    saveDb();
    res.writeHead(302, { Location: '/customise' });
    res.end();
  });
}

function handleUserPage(req, res, username) {
  const user = db.users[username];
  if (!user) {
    send(res, 404, 'Page non trouvée');
    return;
  }
  const style = user.style || { bgColor: '#000000', textColor: '#f0f0f0' };
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${username}</title>
<link rel="stylesheet" href="/styles.css">
<style>body{background:${style.bgColor};color:${style.textColor};}</style>
</head>
<body>
  <div class="container">
    <h1>${username}</h1>
    <p>${user.bio}</p>
    <p><a href="/">Accueil</a></p>
  </div>
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
  } else if (path === '/styles.css' && req.method === 'GET') {
    fs.readFile(pathModule.join(__dirname, 'styles.css'), (err, data) => {
      if (err) {
        send(res, 404, 'Not found');
      } else {
        send(res, 200, data, 'text/css');
      }
    });
  } else if (path === '/login' && req.method === 'GET') {
    handleLoginPage(req, res);
  } else if (path === '/register' && req.method === 'GET') {
    handleRegisterPage(req, res);
  } else if (path === '/register' && req.method === 'POST') {
    handleRegister(req, res);
  } else if (path === '/login' && req.method === 'POST') {
    handleLogin(req, res);
  } else if (path === '/logout') {
    handleLogout(req, res, sessionId);
  } else if (path === '/dashboard') {
    const user = requireLogin(req, res, sessionId);
    if (user) handleDashboard(req, res, user);
  } else if (path === '/customise' && req.method === 'GET') {
    const user = requireLogin(req, res, sessionId);
    if (user) handleCustomisePage(req, res, user);
  } else if (path === '/customise' && req.method === 'POST') {
    const user = requireLogin(req, res, sessionId);
    if (user) handleCustomiseUpdate(req, res, user);
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
