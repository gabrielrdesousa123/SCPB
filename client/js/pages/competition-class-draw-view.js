import { db } from '../firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionClassDrawView(root, hash) {
  const match = hash.match(/#\/competitions\/([a-zA-Z0-9_-]+)\/class\/([^/]+)\/draw-view/) || hash.match(/#\/competitions\/(\d+)\/class\/([^/]+)\/draw-view/);
  if (!match) return;

  const competitionId = match[1];
  const classCode = decodeURIComponent(match[2]);

  let drawData = null;
  let colors = { bg: '#007bff', fg: '#ffffff' };

  async function loadData() {
    root.innerHTML = `<div style="padding:40px; text-align:center;">Carregando sorteio do Firebase...</div>`;
    
    try {
      const snapClasses = await getDocs(collection(db, "classes"));
      snapClasses.forEach(doc => {
          const c = doc.data();
          if (c.codigo === classCode || c.code === classCode || doc.id === classCode) {
              colors = { bg: c.ui_bg || '#007bff', fg: c.ui_fg || '#ffffff' };
          }
      });
    } catch (e) {}

    try {
      const q = query(collection(db, "draws"), 
          where("competition_id", "==", String(competitionId)), 
          where("class_code", "==", classCode)
      );
      const snapDraw = await getDocs(q);
      
      if (!snapDraw.empty) {
          drawData = snapDraw.docs[0].data();
      }
    } catch (e) {}

    render();
  }

  function render() {
    if (!drawData) {
      root.innerHTML = `<div class="card" style="padding:20px; margin:20px;">Sorteio não encontrado para esta classe.</div>`;
      return;
    }

    const isKnockout = drawData.format && drawData.format.type === 'PURE_KNOCKOUT';
    const pools = drawData.data || drawData.groups || drawData.draw_data || [];

    if (!isKnockout && (!pools || pools.length === 0)) {
       root.innerHTML = `<div class="card" style="padding:20px; margin:20px;">Sorteio de grupos vazio para esta classe.</div>`;
       return;
    }

    let contentHtml = '';

    if (isKnockout) {
        const seeds = drawData.seeds || [];
        contentHtml = `
            <h3 style="color: #334155; margin-bottom: 15px;">Sorteio Eliminatória Direta (Mata-Mata)</h3>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="background: ${colors.bg}; color: ${colors.fg}; padding: 10px 15px; font-weight: bold; font-size: 14px;">
                    Ordem de Chaveamento (Seeds)
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                            <th style="padding: 10px; text-align: center; width: 60px; color: #475569;">Seed</th>
                            <th style="padding: 10px; text-align: center; width: 80px; color: #475569;">BIB</th>
                            <th style="padding: 10px; text-align: left; color: #475569;">Atleta</th>
                            <th style="padding: 10px; text-align: left; color: #475569;">Clube</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${seeds.map((p, idx) => {
                            if (!p) return `
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: bold; color: #94a3b8;">${idx + 1}º</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8;">-</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-style: italic;">BYE (Passagem Direta)</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #94a3b8;">-</td>
                                </tr>`;
                            
                            // 🔥 BANDEIRA AQUI (SEEDS)
                            const logoHtml = p.logo_url ? `<img src="${p.logo_url}" style="height: 16px; width: 24px; object-fit: contain; border-radius: 2px; border: 1px solid #e2e8f0; background: white;">` : '';

                            return `
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: bold; color: #1e293b;">${idx + 1}º</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: bold; color: #3b82f6;">${escapeHTML(p.bib)}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-weight: 500;">${escapeHTML(p.nome)}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span>${escapeHTML(p.clube_sigla || p.clube_nome || '-')}</span>
                                            ${logoHtml}
                                        </div>
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        const groupsHtml = pools.map(pool => `
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: ${colors.bg}; color: ${colors.fg}; padding: 10px 15px; font-weight: bold; font-size: 14px;">
              ${pool.name}
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tbody>
                ${pool.players.map(p => {
                  // 🔥 BANDEIRA AQUI (GRUPOS)
                  const logoHtml = p.logo_url ? `<img src="${p.logo_url}" style="height: 14px; width: 22px; object-fit: contain; border-radius: 2px;">` : '';
                  return `
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; width: 40px; font-weight: bold; color: #64748b; text-align: center;">${p.bib}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b;">
                      <div style="font-weight: 500;">${escapeHTML(p.nome)}</div>
                      <div style="font-size: 11px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                          <span>${escapeHTML(p.clube_nome || p.clube_sigla || 'Clube não informado')}</span>
                          ${logoHtml}
                      </div>
                    </td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
        `).join('');

        const numPools = pools.length;
        const allPlayers = [];
        pools.forEach(pool => pool.players.forEach(p => allPlayers.push(p)));
        
        allPlayers.sort((a, b) => Number(a.bib) - Number(b.bib));

        const potsHtml = [];
        for (let i = 0; i < allPlayers.length; i += numPools) {
          const potPlayers = allPlayers.slice(i, i + numPools);
          const potNumber = (i / numPools) + 1;
          
          potsHtml.push(`
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 15px;">
              <h4 style="margin: 0 0 10px 0; color: #475569; font-size: 14px; text-transform: uppercase;">Pote ${potNumber}</h4>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${potPlayers.map(p => {
                  // 🔥 BANDEIRA AQUI (POTES)
                  const logoHtml = p.logo_url ? `<img src="${p.logo_url}" style="height: 14px; width: 22px; object-fit: contain; border-radius: 2px;">` : '';
                  return `
                  <div style="background: #fff; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 4px; font-size: 13px; display: flex; align-items: center; gap: 10px;">
                    <span style="background: #eff6ff; color: #3b82f6; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">${p.bib}</span>
                    <span style="color: #334155; font-weight: 500;">${escapeHTML(p.nome)}</span>
                    <div style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 11px; color: #94a3b8;">${escapeHTML(p.clube_sigla || '')}</span>
                        ${logoHtml}
                    </div>
                  </div>
                `}).join('')}
              </div>
            </div>
          `);
        }

        contentHtml = `
            <h3 style="color: #334155; margin-bottom: 15px;">Grupos Formados</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px;">
              ${groupsHtml}
            </div>

            <h3 style="color: #334155; margin-bottom: 15px;">Potes do Sorteio (Ordem de Ranking)</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
              ${potsHtml.join('')}
            </div>
        `;
    }

    root.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 24px;">Visão do Sorteio: <span style="color: ${colors.bg};">${classCode}</span></h2>
          <button class="btn btn-outline-secondary" onclick="location.hash='#/competitions/view?id=${competitionId}'">← Dashboard</button>
        </div>

        ${contentHtml}
      </div>
    `;
  }

  function escapeHTML(s = '') {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  loadData();
}

export default renderCompetitionClassDrawView;