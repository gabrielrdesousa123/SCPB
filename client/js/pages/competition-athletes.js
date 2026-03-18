// client/js/pages/competition-athletes.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionAthletes(root, hashData) {
  let competitionId = null;
  
  if (typeof hashData === 'string' && hashData.includes('?')) {
    const urlParams = new URLSearchParams(hashData.split('?')[1]);
    competitionId = urlParams.get('id');
  } else if (hashData && hashData.competitionId) {
    competitionId = hashData.competitionId;
  } else {
     const match = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/);
     if (match) competitionId = match[1];
  }

  if (!competitionId) {
    root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro: ID da competição ausente.</div>`;
    return;
  }

  const state = {
    competitionName: 'Carregando...',
    athletesByClass: {},
    colorsMap: {}
  };

  const API = {
    getCompetition: async (id) => {
      const docRef = doc(db, "competitions", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return { name: 'Competição Oficial' };
    },
    getClasses: async (id) => {
      // Busca todas as chaves (draws) dessa competição para saber quais classes existem
      const q = query(collection(db, "draws"), where("competition_id", "==", String(id)));
      const snap = await getDocs(q);
      const classes = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.class_code) classes.push({ class_code: data.class_code });
      });
      return classes;
    },
    getDrawData: async (compId, classCode) => {
       // Busca o sorteio específico da classe
       const q = query(collection(db, "draws"), 
          where("competition_id", "==", String(compId)), 
          where("class_code", "==", classCode)
       );
       const snap = await getDocs(q);
       if (snap.empty) return [];
       
       const drawDoc = snap.docs[0].data();
       // Retorna os dados do sorteio (pode estar salvo em .data, .groups ou direto na raiz dependendo de como você salva)
       return drawDoc.data || drawDoc.groups || drawDoc.draw_data || [];
    },
    getGlobalColors: async () => {
      const snap = await getDocs(collection(db, "classes"));
      snap.forEach(d => {
        const c = d.data();
        // Usa o ID do documento ou o campo codigo
        const code = c.codigo || c.code || d.id; 
        state.colorsMap[code] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529' };
      });
    }
  };

  async function loadData() {
    root.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 50vh; flex-direction: column;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; color: #64748b; font-family: sans-serif;">A rastrear atletas nos sorteios oficiais da nuvem...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;

    try {
      const compData = await API.getCompetition(competitionId);
      state.competitionName = compData.name || compData.nome || 'Competição Oficial';

      await API.getGlobalColors();
      
      const classes = await API.getClasses(competitionId);
      
      for (const cls of classes) {
         const code = cls.class_code || cls.codigo || cls.name;
         const drawData = await API.getDrawData(competitionId, code);
         
         if (drawData && drawData.length > 0) {
            let athletesInClass = [];
            drawData.forEach(group => {
               if (group.players) athletesInClass = athletesInClass.concat(group.players);
            });
            
            if (athletesInClass.length > 0) {
                const uniqueAthletes = Array.from(new Map(athletesInClass.filter(a => a.id).map(a => [a.id, a])).values());
                uniqueAthletes.sort((a, b) => parseInt(a.bib || '999', 10) - parseInt(b.bib || '999', 10));
                state.athletesByClass[code] = uniqueAthletes;
            }
         }
      }

      render();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px;">Erro crítico de ligação ao Firebase: ${e.message}</div>`;
    }
  }

  function escapeHTML(str) {
    if (!str) return '-';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function render() {
    const classCodes = Object.keys(state.athletesByClass).sort();
    let contentHtml = '';

    if (classCodes.length === 0) {
      contentHtml = `
        <div style="text-align:center; padding: 60px; background: #fff; border-radius: 8px; border: 1px dashed #cbd5e1; margin-top: 20px;">
           <div style="font-size: 40px; margin-bottom: 10px;">📋</div>
           <h3 style="color: #475569; margin: 0;">Nenhum Atleta Oficializado</h3>
           <p style="color: #94a3b8; font-size: 14px; margin-top: 5px;">A relação de atletas só é construída após o sorteio das chaves no Painel da Classe.</p>
        </div>
      `;
    } else {
      contentHtml = classCodes.map(code => {
        const athletes = state.athletesByClass[code];
        const colors = state.colorsMap[code] || { bg: '#0f172a', fg: '#ffffff' };
        
        return `
          <div class="print-break-inside-avoid" style="margin-bottom: 30px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #cbd5e1;">
            <div style="background-color: ${colors.bg}; color: ${colors.fg}; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;" class="force-print-color">
                <h2 style="margin: 0; font-size: 16px; font-weight: 700; text-transform: uppercase;">Classe ${escapeHTML(code)}</h2>
                <span style="font-size: 12px; font-weight: bold; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px;">
                    ${athletes.length} Inscritos
                </span>
            </div>
            
            <div style="overflow-x: auto; padding: 15px;">
              <table class="wb-table" style="width: 100%;">
                <thead>
                  <tr class="force-print-color">
                    <th style="width: 80px; text-align: center;">BIB</th>
                    <th style="width: 45%;">Atleta / Equipa</th>
                    <th>Clube / Delegação</th>
                  </tr>
                </thead>
                <tbody>
                  ${athletes.map(a => `
                    <tr>
                      <td style="text-align: center;">
                        <div class="wb-bib-badge force-print-color">
                            ${escapeHTML(a.bib)}
                        </div>
                      </td>
                      <td style="font-weight: 600; color: #1e293b;">${escapeHTML(a.nome)}</td>
                      <td style="color: #475569;">
                        ${escapeHTML(a.clube_nome)} ${a.clube_sigla && a.clube_sigla !== a.clube_nome ? `<strong>(${escapeHTML(a.clube_sigla)})</strong>` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }

    const styles = `
      <style>
        .wb-container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
        .wb-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        
        /* Tabela Visual com Bordas e Divisórias Claras */
        .wb-table { border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0; }
        .wb-table th { background: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 12px; padding: 10px 15px; text-align: left; border: 1px solid #e2e8f0; }
        .wb-table td { padding: 8px 15px; border: 1px solid #e2e8f0; vertical-align: middle; }
        .wb-table tr:hover { background-color: #f8fafc; }
        
        .wb-bib-badge { background: #eff6ff; color: #2563eb; width: 40px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: bold; margin: 0 auto; border: 1px solid #bfdbfe; font-size: 13px; }

        .btn-outline-secondary { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-outline-secondary:hover { background: #f1f5f9; color: #0f172a; }
        
        .btn-primary-print { background: #0d6efd; border: 1px solid #0b5ed7; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary-print:hover { background: #0b5ed7; }

        /* ESTILOS DE IMPRESSÃO CEGOS PARA GARANTIR MARGENS NO PAPEL */
        @media print {
          @page { size: A4; margin: 1.5cm !important; }
          header, nav, .no-print { display: none !important; }
          body, html { background-color: #fff !important; font-size: 10pt !important; padding: 0 !important; }
          .wb-container { max-width: 100% !important; padding: 0 !important; }
          .force-print-color { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          .print-break-inside-avoid { 
            page-break-inside: avoid !important; 
            break-inside: avoid !important; 
            box-shadow: none !important; 
            margin-bottom: 25px !important; 
            border: 1px solid #cbd5e1 !important; 
          }
          
          h1 { font-size: 16pt !important; color: #000 !important; }
          .wb-header { border-bottom: 2px solid #000; margin-bottom: 20px !important; padding-bottom: 10px !important; }
          
          .wb-table { font-size: 10pt !important; }
          .wb-table th { font-size: 9pt !important; padding: 8px 10px !important; color: #000 !important; background: #eee !important; border: 1px solid #ccc !important; }
          .wb-table td { padding: 8px 10px !important; border: 1px solid #ccc !important; }
          .wb-bib-badge { width: 32px !important; height: 22px !important; font-size: 9pt !important; background: #fff !important; border: 1px solid #000 !important; color: #000 !important;}
          
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      </style>
    `;

    root.innerHTML = `
      ${styles}
      <div class="wb-container">
        <div class="wb-header">
          <div>
            <h1 style="margin: 0; font-size: 26px; color: #0f172a;">Relação de Atletas (Start List)</h1>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">${escapeHTML(state.competitionName)}</p>
          </div>
          <div class="no-print" style="display: flex; gap: 10px;">
            <button class="btn-primary-print" onclick="window.print()">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              Imprimir / PDF
            </button>
            <button class="btn-outline-secondary" onclick="window.history.back()">← Voltar</button>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;
  }

  loadData();
}