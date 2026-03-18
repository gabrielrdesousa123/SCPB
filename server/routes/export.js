// server/routes/export.js
// Rota de exportação de PDF via Puppeteer (A4 paisagem)

import express from 'express';
import puppeteer from 'puppeteer';

const router = express.Router();

/**
 * POST /api/simulator/export/pdf
 * Body: {
 *   competition: {name, startDate, endDate, dayStart, dayEnd, interval, courts},
 *   classes: [{code, name, entries, pools, poolSize, counts:{G,E,T}}],
 *   allocationsByDay: [{
 *     dayLabel: "dd/mm/yyyy",
 *     startMin: number,
 *     endMin: number,
 *     interval: number,
 *     courts: number,
 *     blocks: [{court,start,duration,label,details,bg,fg,className}]
 *   }, ...]
 * }
 */
router.post('/pdf', async (req, res) => {
  try {
    const payload = req.body || {};
    const comp = payload.competition || {};
    const classes = Array.isArray(payload.classes) ? payload.classes : [];
    const days = Array.isArray(payload.allocationsByDay) ? payload.allocationsByDay : [];

    const css = `
      @page { size: A4 landscape; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif; color:#111827; }
      h1 { font-size: 20pt; margin: 0 0 6pt; }
      .muted { color:#6b7280; }
      .header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:14pt; }
      .chip { display:inline-block; padding:.5pt 6pt; border:1px solid #D1D5DB; border-radius:999px; font-size:9pt; color:#374151; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border:1px solid #E5E7EB; padding:6pt 8pt; font-size:10pt; }
      th { background:#F3F4F6; text-align:left; }
      .section-title { font-size: 14pt; font-weight:700; margin: 16pt 0 8pt; }

      /* Agenda */
      .day { page-break-after: always; }
      .day:last-child { page-break-after: auto; }
      .grid { width:100%; border:1px solid #E5E7EB; border-radius:8px; overflow:hidden; }
      .grid-header { display:grid; grid-template-columns: 80pt repeat(VAR_COURTS, 1fr); background:#F9FAFB; border-bottom:1px solid #E5E7EB; }
      .grid-header div { padding:8pt; text-align:center; font-weight:700; font-size:10pt; }
      .row { display:grid; grid-template-columns: 80pt repeat(VAR_COURTS, 1fr); border-bottom:1px solid #F3F4F6; min-height: 18pt; }
      .time { padding:4pt 6pt; text-align:right; font-size:9pt; color:#6B7280; border-right:1px solid #F3F4F6; }
      .cell { position:relative; border-right:1px solid #F3F4F6; }
      .block {
        position:absolute; left:3pt; right:3pt;
        border-radius:4pt; padding:3pt 4pt;
        box-shadow:0 .5pt 1.5pt rgba(0,0,0,0.12);
        font-size:8.5pt; line-height:1.25; color:white;
      }
      .block .label { font-weight:700; }
      .legend { display:flex; gap:6pt; flex-wrap:wrap; margin-top:6pt; }
      .legend-item { display:flex; align-items:center; gap:4pt; font-size:9pt; }
      .swatch { width:12pt; height:12pt; border-radius:3pt; border:1px solid #E5E7EB; }
    `;

    const firstPageHTML = `
      <div class="header">
        <div>
          <h1>${escapeHtml(comp.name || 'Competição')}</h1>
          <div class="muted">${dateRange(comp.startDate, comp.endDate)}</div>
        </div>
        <div class="chip">Visualizador: ${comp.interval || 15} min &nbsp; • &nbsp; Quadras: ${comp.courts || 1}</div>
      </div>

      <div class="section-title">Classes e Chaveamentos</div>
      <table>
        <thead>
          <tr>
            <th style="width:38%;">Classe</th>
            <th style="width:14%;">Atletas</th>
            <th style="width:24%;">Formato</th>
            <th style="width:24%;">Contagens</th>
          </tr>
        </thead>
        <tbody>
          ${classes.map(c => {
            const fmt = `${c.pools}g × ${c.poolSize}`;
            const cnt = `G:${c.counts?.G ?? '-'} • E:${c.counts?.E ?? '-'} • T:${c.counts?.T ?? '-'}`;
            return `<tr>
              <td>${escapeHtml(c.name || c.code || '')}</td>
              <td>${c.entries ?? ''}</td>
              <td>${fmt}</td>
              <td>${cnt}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

    const daysHTML = days.map(day => {
      const rows = [];
      for (let t = day.startMin; t < day.endMin; t += day.interval) {
        rows.push(`
          <div class="row">
            <div class="time">${toHHMM(t)}</div>
            ${Array.from({length: day.courts}).map(() => `<div class="cell"></div>`).join('')}
          </div>
        `);
      }

      // grade vazia
      let grid = `
        <div class="grid">
          <div class="grid-header">
            <div></div>
            ${Array.from({length: day.courts}).map((_,i)=>`<div>Quadra ${i+1}</div>`).join('')}
          </div>
          ${rows.join('')}
        </div>
      `;

      // agora “injeta” os blocos posicionados
      // estratégia: substituir células por wrappers com blocks via search & replace após construir
      // mais simples: adicionar uma camada absoluta por cima da grid com posição por cálculo CSS
      // (mas para manter o HTML simples, vamos gerar uma “overlay” por court)
      const heightPerMin = 18 / day.interval; // 18pt por linha visual
      const overlays = Array.from({length: day.courts}, (_,i) => {
        const blocks = day.blocks.filter(b => b.court === (i+1));
        const htmlBlocks = blocks.map(b => {
          const top = ( (b.start - day.startMin) * heightPerMin ) + 0;              // pt
          const h   = ( b.duration * heightPerMin );
          const bg  = b.bg || '#3b82f6';
          const fg  = b.fg || '#ffffff';
          const label = escapeHtml(b.className || '');
          const details = escapeHtml(b.label + (b.details ? ' ' + b.details : ''));
          return `<div class="block" style="top:${top}pt;height:${h}pt;background:${bg};color:${fg};">
              <div class="label">${label}</div>
              <div>${details}</div>
              <div class="muted" style="color:rgba(255,255,255,.9);">${toHHMM(b.start)}–${toHHMM(b.start + b.duration)}</div>
            </div>`;
        }).join('');
        return `<div style="position:absolute; left:${80 + (i*(100/(day.courts))) }%; right:${( (day.courts-1-i) * (100/(day.courts)) ) }%; top:32pt; bottom:0; transform: translateX(-${ ( ( (day.courts-1-i) * (100/day.courts) ) ) }%); pointer-events:none;">${htmlBlocks}</div>`;
      }).join('');

      // container relativo para overlays
      grid = `<div style="position:relative;">${grid}${overlays}</div>`;

      // legenda de cores das classes usadas neste dia
      const legendMap = new Map();
      day.blocks.forEach(b => {
        const key = b.className || b.label;
        if (!legendMap.has(key)) legendMap.set(key, {bg:b.bg, name:key});
      });
      const legend = `
        <div class="legend">
          ${Array.from(legendMap.values()).map(item =>
            `<div class="legend-item"><span class="swatch" style="background:${item.bg};"></span>${escapeHtml(item.name)}</div>`
          ).join('')}
        </div>
      `;

      return `
        <div class="day">
          <div class="header">
            <div>
              <h1>${escapeHtml(comp.name || 'Competição')}</h1>
              <div class="muted">${escapeHtml(day.dayLabel || '')}</div>
            </div>
            <div class="chip">Horário: ${toHHMM(day.startMin)}–${toHHMM(day.endMin)} • Visualizador ${day.interval} min</div>
          </div>
          ${grid}
          ${legend}
        </div>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>${css.replaceAll('VAR_COURTS', String(Math.max(1, comp.courts || 1)))}</style>
      </head>
      <body>
        ${firstPageHTML}
        ${daysHTML}
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="agenda-${Date.now()}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    res.status(500).json({ error: 'Falha ao gerar PDF' });
  }
});

function escapeHtml(s='') {
  return String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function toHHMM(min) {
  const h = String(Math.floor(min/60)).padStart(2,'0');
  const m = String(min%60).padStart(2,'0');
  return `${h}:${m}`;
}
function dateRange(start, end) {
  if (!start && !end) return '';
  const fmt = (d) => {
    if (!d) return '';
    const p = d.split('-'); // yyyy-mm-dd
    if (p.length !== 3) return d;
    return `${p[2]}/${p[1]}/${p[0]}`;
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start || end);
}

export default router;
