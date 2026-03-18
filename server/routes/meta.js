import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();
const seedPath = path.resolve('data/classes.seed.json');

router.get('/classes', (_req, res) => {
  try {
    const raw = fs.readFileSync(seedPath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível ler classes.seed.json', detail: String(e) });
  }
});

export default router;
