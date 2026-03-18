// server/routes/atletas.js
// CRUD + filtros + export/import CSV
// Suporta competition_id no GET: se vier, rank = MIN(rank) em comp_results; senão, usa a.rank.

import { Router } from 'express';
import db from '../db.js';
import { stringify as csvStringify } from 'csv-stringify/sync';

const router = Router();

function norm(s='') {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
function valGenero(g){ return g==='M' || g==='F'; }
function safeInt(x,d=null){ const n=Number(x); return Number.isFinite(n)?n:d; }
function parseSort(sort='nome', allowed=['nome','clube','regiao','classe_code','rank']) {
  let dir='ASC', col=String(sort||'').trim();
  if (col.startsWith('-')) { dir='DESC'; col = col.slice(1); }
  if (!allowed.includes(col)) col='nome';
  return { col, dir };
}

/* ============================ GET /api/atletas ============================ */
router.get('/', (req,res)=>{
  try{
    const {
      q = '', classe_code = '', clube_id = '', genero = '',
      regiao = '', sort = 'nome', page = '1', limit = '5000',
      competition_id = ''
    } = req.query;

    const { col, dir } = parseSort(sort);
    const params = [];
    const where = [];
    let joinRank = '';
    let selectRank = 'a.rank AS rank';

    if (competition_id) {
      joinRank = `
        LEFT JOIN (
          SELECT athlete_id, MIN(rank) AS comp_rank
          FROM comp_results
          WHERE competition_id = ?
          GROUP BY athlete_id
        ) cr ON cr.athlete_id = a.id
      `;
      params.push(Number(competition_id));
      selectRank = 'cr.comp_rank AS rank';
    }

    if (q)            { where.push('a.nome_normalizado LIKE ?'); params.push('%'+norm(q)+'%'); }
    if (classe_code)  { where.push('a.classe_code = ?'); params.push(String(classe_code)); }
    if (clube_id)     { where.push('a.clube_id = ?'); params.push(Number(clube_id)); }
    if (valGenero(genero)) { where.push('a.genero = ?'); params.push(genero); }
    if (regiao)       { where.push('c.regiao = ?'); params.push(String(regiao)); }

    const whereSql = where.length ? 'WHERE '+where.join(' AND ') : '';

    let orderSql = '';
    if (col === 'clube')         orderSql = `ORDER BY c.nome COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC`;
    else if (col === 'regiao')   orderSql = `ORDER BY c.regiao COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC`;
    else if (col === 'classe_code') orderSql = `ORDER BY a.classe_code COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC`;
    else if (col === 'rank')     orderSql = `ORDER BY rank IS NULL, rank ${dir}, a.nome COLLATE NOCASE ASC`;
    else                         orderSql = `ORDER BY a.nome COLLATE NOCASE ${dir}`;

    const limitN = Math.min(Math.max(safeInt(limit,5000),1),5000);
    const offset = Math.max((safeInt(page,1)-1),0) * limitN;

    const rows = db.prepare(`
      SELECT
        a.id, a.nome, a.genero, a.classe_code, a.clube_id,
        ${selectRank},
        c.nome AS clube_nome,
        c.regiao AS regiao
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      ${joinRank}
      ${whereSql}
      ${orderSql}
      LIMIT ${limitN} OFFSET ${offset}
    `).all(...params);

    const total = db.prepare(`
      SELECT COUNT(1) AS n
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      ${competition_id ? 'LEFT JOIN (SELECT athlete_id, MIN(rank) AS comp_rank FROM comp_results WHERE competition_id = ? GROUP BY athlete_id) cr ON cr.athlete_id = a.id' : ''}
      ${whereSql}
    `).get(...(competition_id ? [Number(competition_id), ...params.slice(1)] : params)).n;

    res.json({ items: rows, total });
  }catch(e){
    console.error('GET /atletas failed:', e);
    res.status(500).json({ error:'Falha ao listar atletas: '+e.message });
  }
});

/* ============================ POST /api/atletas ============================ */
router.post('/', (req,res)=>{
  try{
    const { nome, genero, classe_code, clube_id, rank=null } = req.body||{};
    if (!nome || !valGenero(genero)) return res.status(400).json({ error:'Campos obrigatórios: nome, genero (M/F).' });
    const nome_normalizado = norm(nome);
    const info = db.prepare(`
      INSERT INTO atletas (nome, nome_normalizado, genero, classe_code, clube_id, rank)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(String(nome).trim(), nome_normalizado, genero, classe_code||null, safeInt(clube_id,null), safeInt(rank,null));
    res.status(201).json({ id: info.lastInsertRowid });
  }catch(e){
    console.error('POST /atletas failed:', e);
    res.status(500).json({ error:'Erro ao criar atleta: '+e.message });
  }
});

/* ============================ PUT /api/atletas/:id ============================ */
router.put('/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { nome, genero, classe_code, clube_id, rank=null } = req.body||{};
    if (!id) return res.status(400).json({ error:'ID inválido.' });
    if (nome && typeof nome !== 'string') return res.status(400).json({ error:'Nome inválido.' });
    if (genero && !valGenero(genero)) return res.status(400).json({ error:'Gênero inválido.' });

    const cur = db.prepare('SELECT * FROM atletas WHERE id=?').get(id);
    if (!cur) return res.status(404).json({ error:'Atleta não encontrado.' });

    const novoNome   = nome!=null ? String(nome).trim() : cur.nome;
    const novoNN     = norm(novoNome);
    const novoGen    = genero!=null ? genero : cur.genero;
    const novaClasse = classe_code!==undefined ? (classe_code||null) : cur.classe_code;
    const novoClube  = (clube_id!==undefined) ? safeInt(clube_id,null) : cur.clube_id;
    const novoRank   = (rank!==undefined) ? safeInt(rank,null) : cur.rank;

    db.prepare(`
      UPDATE atletas SET
        nome=?, nome_normalizado=?, genero=?,
        classe_code=?, clube_id=?, rank=?
      WHERE id=?
    `).run(novoNome, novoNN, novoGen, novaClasse, novoClube, novoRank, id);

    res.json({ ok:true });
  }catch(e){
    console.error('PUT /atletas/:id failed:', e);
    res.status(500).json({ error:'Erro ao atualizar atleta: '+e.message });
  }
});

/* ============================ DELETE /api/atletas/:id ============================ */
router.delete('/:id', (req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!id) return res.status(400).json({ error:'ID inválido.' });
    const info = db.prepare('DELETE FROM atletas WHERE id=?').run(id);
    if (!info.changes) return res.status(404).json({ error:'Atleta não encontrado.' });
    res.status(204).send();
  }catch(e){
    console.error('DELETE /atletas/:id failed:', e);
    res.status(500).json({ error:'Erro ao excluir atleta: '+e.message });
  }
});

/* ============================ POST /api/atletas/bulk-delete ============================ */
router.post('/bulk-delete',(req,res)=>{
  try{
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error:'Nenhum ID enviado.' });
    const stmt = db.prepare('DELETE FROM atletas WHERE id=?');
    const tx = db.transaction(arr=>{ arr.forEach(id=>stmt.run(id)); });
    tx(ids);
    res.json({ deleted: ids.length });
  }catch(e){
    console.error('POST /atletas/bulk-delete failed:', e);
    res.status(500).json({ error:'Erro ao excluir em massa: '+e.message });
  }
});

/* ============================ GET /api/atletas/export.csv ============================ */
router.get('/export.csv',(req,res)=>{
  try{
    const {
      q = '', classe_code = '', clube_id = '', genero = '',
      regiao = '', sort = 'nome', competition_id = ''
    } = req.query;

    const { col, dir } = parseSort(sort);
    const params = [];
    const where = [];
    let joinRank = '';
    let selectRank = 'a.rank AS rank';

    if (competition_id) {
      joinRank = `
        LEFT JOIN (
          SELECT athlete_id, MIN(rank) AS comp_rank
          FROM comp_results
          WHERE competition_id = ?
          GROUP BY athlete_id
        ) cr ON cr.athlete_id = a.id
      `;
      params.push(Number(competition_id));
      selectRank = 'cr.comp_rank AS rank';
    }

    if (q)            { where.push('a.nome_normalizado LIKE ?'); params.push('%'+norm(q)+'%'); }
    if (classe_code)  { where.push('a.classe_code = ?'); params.push(String(classe_code)); }
    if (clube_id)     { where.push('a.clube_id = ?'); params.push(Number(clube_id)); }
    if (valGenero(genero)) { where.push('a.genero = ?'); params.push(genero); }
    if (regiao)       { where.push('c.regiao = ?'); params.push(String(regiao)); }

    const whereSql = where.length ? 'WHERE '+where.join(' AND ') : '';
    let orderSql =
      col==='nome' ? `ORDER BY a.nome COLLATE NOCASE ${dir}` :
      col==='clube' ? `ORDER BY c.nome COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC` :
      col==='regiao' ? `ORDER BY c.regiao COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC` :
      col==='classe_code' ? `ORDER BY a.classe_code COLLATE NOCASE ${dir}, a.nome COLLATE NOCASE ASC` :
      `ORDER BY rank IS NULL, rank ${dir}, a.nome COLLATE NOCASE ASC`;

    const rows = db.prepare(`
      SELECT
        a.id, a.nome, a.genero, a.classe_code, a.clube_id,
        ${selectRank},
        c.nome AS clube_nome, c.regiao AS regiao
      FROM atletas a
      LEFT JOIN clubes c ON c.id = a.clube_id
      ${joinRank}
      ${whereSql}
      ${orderSql}
    `).all(...params);

    const csv = csvStringify(rows, {
      header: true,
      columns: [
        { key:'id', header:'id' },
        { key:'nome', header:'nome' },
        { key:'genero', header:'genero' },
        { key:'classe_code', header:'classe_code' },
        { key:'clube_id', header:'clube_id' },
        { key:'rank', header: competition_id ? 'rank_competicao' : 'rank' },
        { key:'clube_nome', header:'clube_nome' },
        { key:'regiao', header:'regiao' },
      ]
    });
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="atletas-export.csv"');
    res.send(csv);
  }catch(e){
    console.error('GET /atletas/export.csv failed:', e);
    res.status(500).json({ error:'Falha ao exportar CSV: '+e.message });
  }
});

export default router;
