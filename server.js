const http = require('http');
const { WebSocketServer } = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('airgame ok');
});
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host, players: Map(id -> ws) }
let nextId = 1;

const makeCode = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};
const send = (ws, o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'host') {
      let code;
      do { code = makeCode(); } while (rooms.has(code));
      rooms.set(code, { host: ws, players: new Map() });
      ws.room = code; ws.role = 'host';
      send(ws, { t: 'room', code });

    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase();
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'error', msg: 'اتاقی با این کد پیدا نشد' });
      if (r.players.size >= 8) return send(ws, { t: 'error', msg: 'اتاق پره' });
      ws.id = nextId++; ws.room = code; ws.role = 'player';
      r.players.set(ws.id, ws);
      send(ws, { t: 'joined', id: ws.id });
      send(r.host, { t: 'join', id: ws.id, name: String(m.name || 'بازیکن').slice(0, 12) });

    } else if (m.t === 'input' && ws.role === 'player') {
      const r = rooms.get(ws.room);
      if (r) send(r.host, { t: 'input', id: ws.id, d: m.d });

    } else if (m.t === 'to' && ws.role === 'host') {
      const r = rooms.get(ws.room);
      if (r) send(r.players.get(m.id), { t: 'msg', d: m.d });
    }
  });

  ws.on('close', () => {
    const r = rooms.get(ws.room);
    if (!r) return;
    if (ws.role === 'host') {
      r.players.forEach((p) => send(p, { t: 'error', msg: 'میزبان بازی رو بست' }));
      rooms.delete(ws.room);
    } else {
      r.players.delete(ws.id);
      send(r.host, { t: 'leave', id: ws.id });
    }
  });
});

// heartbeat: قطع‌شده‌ها پاک می‌شن و اتصال‌ها روی Render زنده می‌مونن
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(process.env.PORT || 3000, () => console.log('listening'));
