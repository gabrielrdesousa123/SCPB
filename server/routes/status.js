// server/routes/status.js
import { Router } from 'express';
import os from 'os';
import db from '../db.js';

const router = Router();

// Mesmo critério usado em server.js
function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

router.get('/', (_req, res) => {
  try {
    const q = (sql) => {
      try {
        return db.prepare(sql).get() || { n: 0 };
      } catch {
        return { n: 0 };
      }
    };

    const classes = q(`SELECT COUNT(*) n FROM classes`);
    const clubes  = q(`SELECT COUNT(*) n FROM clubes`);
    const atletas = q(`SELECT COUNT(*) n FROM atletas`);
    const comps   = q(`SELECT COUNT(*) n FROM competitions`);

    const port = Number(process.env.PORT) || 3000;
    const ip   = getLocalIPv4();
    const localUrl   = `http://localhost:${port}/#/home`;
    const networkUrl = ip ? `http://${ip}:${port}/#/home` : null;

    res.json({
      db_path: db.name || '(sqlite)',
      counts: {
        classes: classes.n,
        clubes: clubes.n,
        atletas: atletas.n,
        competitions: comps.n,
      },
      network: {
        port,
        ip,
        local_url: localUrl,
        network_url: networkUrl,
      },
    });
  } catch (e) {
    console.error('GET /api/status erro:', e);
    res.status(500).json({ error: 'Falha ao obter status.' });
  }
});

export default router;
