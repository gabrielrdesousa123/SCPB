// client/js/pages/competition-match-sheets.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function ensureHtml2PdfLoaded() {
    return new Promise((resolve) => {
        if (window.html2pdf) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

export async function renderCompetitionMatchSheets(root, hashData) {
    root.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif">
        <h2>A preparar Súmulas...</h2>
        <p style="color:#666;">A carregar dados da competição e agenda do Firebase.</p>
    </div>`;

    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/\/competitions\/([a-zA-Z0-9_-]+)/);
    
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId))
        competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) {
        root.innerHTML = `<div style="margin:20px;padding:20px;border:1px solid red">ID da competição ausente.</div>`;
        return;
    }

    const state = { competition: {}, scheduledMatches: [], officials: [], allAthletes: [], allTeams: [], drawPlayers: [], classesDataMap: {}, logos: [] };

    const API = {
        getComp: async () => {
            const docRef = doc(db, "competitions", String(competitionId));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : {};
        },
        updateLogos: async (logosArray) => {
            const docRef = doc(db, "competitions", String(competitionId));
            await updateDoc(docRef, { logos: logosArray });
        },
        getMatches: async () => {
            let allMatches = [];
            const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGroup = await getDocs(qGroup);
            snapGroup.forEach(doc => {
                const data = doc.data();
                const classCode = data.class_code;
                const pools = data.matches || data.data || [];
                pools.forEach(pool => {
                    Object.values(pool.rounds || {}).forEach(roundMatches => {
                        roundMatches.forEach(m => {
                            const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant2_name).toUpperCase() === 'BYE';
                            if (isBye) return;

                            allMatches.push({
                                ...m, class_code: classCode, match_type: 'GROUP', pool_name: pool.pool_name,
                                p1_name: m.entrant1_name, p1_club: m.entrant1_club_sigla || m.entrant1_club_nome, p1_bib: m.entrant1_bib, p1_score: m.score1,
                                p2_name: m.entrant2_name, p2_club: m.entrant2_club_sigla || m.entrant2_club_nome, p2_bib: m.entrant2_bib, p2_score: m.score2
                            });
                        });
                    });
                });
            });

            const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKo = await getDocs(qKo);
            snapKo.forEach(doc => {
                const data = doc.data();
                const classCode = data.class_code;
                const koMatches = data.matches || data.data || [];
                koMatches.forEach(m => {
                    const isBye = m.status === 'BYE' || m.status === 'SCHEDULED_WITH_BYE' || m.is_bye === true || !m.entrant2_id || String(m.entrant_a_name || m.entrant1_name).toUpperCase() === 'BYE' || String(m.entrant_b_name || m.entrant2_name).toUpperCase() === 'BYE';
                    if (isBye) return;

                    allMatches.push({
                        ...m, class_code: classCode, match_type: 'KO',
                        p1_name: m.entrant_a_name || m.entrant1_name, p1_club: m.entrant_a_club_sigla || m.entrant1_club_sigla, p1_bib: m.entrant_a_bib || m.entrant1_bib, p1_score: m.score_a || m.score1,
                        p2_name: m.entrant_b_name || m.entrant2_name, p2_club: m.entrant_b_club_sigla || m.entrant2_club_sigla, p2_bib: m.entrant_b_bib || m.entrant2_bib, p2_score: m.score_b || m.score2
                    });
                });
            });
            return allMatches;
        },
        getOfficials: async () => {
            const q = query(collection(db, "competition_officials"), where("competition_id", "==", String(competitionId)));
            const snap = await getDocs(q);
            if (!snap.empty) return { success: true, data: snap.docs[0].data().officials || [] };
            return { success: true, data: [] };
        },
        getClasses: async () => {
            const snap = await getDocs(collection(db, "classes"));
            snap.forEach(doc => {
                const c = doc.data();
                const code = c.codigo || c.code || doc.id;
                state.classesDataMap[code] = { ends: c.ends || 4 };
            });
        },
        getAthletes: async () => {
            const snap = await getDocs(collection(db, "atletas"));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        getTeams: async () => {
            const snap = await getDocs(collection(db, "equipes"));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        getDrawsPlayers: async () => {
            let players = [];
            const q = query(collection(db, "draws"), where("competition_id", "==", String(competitionId)));
            const snap = await getDocs(q);
            snap.forEach(doc => {
                const data = doc.data();
                if (data.seeds) data.seeds.forEach(p => { if (p && p.id && p.id !== 'BYE') players.push(p); });
                const pools = data.data || data.groups || data.draw_data || [];
                pools.forEach(pool => {
                    if (pool.players) pool.players.forEach(p => { if (p && p.id && p.id !== 'BYE') players.push(p); });
                });
            });
            return players;
        }
    };

    const escapeHTML = s => !s ? '' : String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const formatDate = d => { if (!d) return 'A definir'; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };
    const normalizeName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    function formatMatchTitle(m) {
        const isGroup = m.match_type === 'GROUP' || (m.round_name && m.round_name.toLowerCase().includes('round')) || m.pool_id;
        if (isGroup) return m.pool_name ? `Grupo ${m.pool_name}` : 'Fase de Grupos';
        const map = {'Quarter Final': 'Quartas', 'Semi-Final': 'Semifinal', 'Final': 'Final', '3rd Place': 'Disputa 3º'};
        return map[m.round_name] || m.round_name || 'Eliminatória';
    }

    // 🔥 BUSCA FORTE E FLEXÍVEL (Com "includes" para nomes gigantes)
    function getParticipantData(m, side) {
        const isGroup = m.match_type === 'GROUP' || m.pool_id;
        const prefix = side === 1 ? (isGroup ? 'entrant1' : 'entrant_a') : (isGroup ? 'entrant2' : 'entrant_b');
        
        let pName = m[`${prefix}_name`] || m[`p${side}_name`] || '';
        let club = m[`${prefix}_club_sigla`] || m[`p${side}_club`] || m[`${prefix}_club_nome`] || '';
        let bib = m[`${prefix}_bib`] || m[`p${side}_bib`] || '';
        let id = m[`${prefix}_id`] || m[`${prefix}_athlete_id`];

        const normName = normalizeName(pName);

        let drawPlayer = null;
        if (id && state.drawPlayers.length > 0) drawPlayer = state.drawPlayers.find(p => String(p.id) === String(id));
        if (!drawPlayer && normName && state.drawPlayers.length > 0) {
            drawPlayer = state.drawPlayers.find(p => {
                const n = normalizeName(p.nome || p.name);
                return n === normName || n.includes(normName) || normName.includes(n);
            });
        }

        if (drawPlayer) {
            if (!pName || pName === 'A Definir' || pName.includes(' do Grp ')) pName = drawPlayer.nome || drawPlayer.name || pName;
            if (!bib || bib === '--') bib = drawPlayer.bib || drawPlayer.numero || bib;
            if (!club || club === '--') club = drawPlayer.clube_sigla || drawPlayer.clube_nome || drawPlayer.club || club;
        }

        if ((!bib || !club || bib === '--' || club === '--') && state.allAthletes.length > 0) {
            let ath = null;
            if (id) ath = state.allAthletes.find(a => String(a.id) === String(id));
            if (!ath && normName) {
                ath = state.allAthletes.find(a => {
                    const n = normalizeName(a.nome || a.name);
                    return n === normName || n.includes(normName) || normName.includes(n);
                });
            }
            
            if (ath) {
                if (!pName || pName === 'A Definir' || pName.includes(' do Grp ')) pName = ath.nome || ath.name || pName;
                if (!bib || bib === '--') bib = ath.bib || ath.numero || ath.n_inscricao || bib;
                if (!club || club === '--') club = ath.clube_sigla || ath.clube_nome || club;
            }
        }

        if ((!club || club === '--') && state.allTeams.length > 0) {
            let team = null;
            if (id) team = state.allTeams.find(t => String(t.id) === String(id));
            if (!team && normName) {
                team = state.allTeams.find(t => {
                    const n = normalizeName(t.nome || t.name);
                    return n === normName || n.includes(normName) || normName.includes(n);
                });
            }
            
            if (team) {
                if (!pName || pName === 'A Definir' || pName.includes(' do Grp ')) pName = team.nome || team.name || pName;
                if (!club || club === '--') club = team.sigla || team.club_sigla || team.clube_nome || club;
            }
        }

        if (club === 'CLUBE NÃO INFORMADO' || club === 'undefined' || club === 'null') club = '';

        return { 
            name: escapeHTML(pName || 'A Definir'), 
            club: escapeHTML(club || ''), 
            bib: escapeHTML(bib || '--') 
        };
    }

    function getRefName(id) {
        const o = state.officials.find(x => String(x.referee_id || x.id) === String(id));
        return o ? escapeHTML(o.nome_abreviado || o.nome_completo || o.nome) : '';
    }

    async function loadData() {
        try {
            const [c, m, off, cls, ath, teams, dPlayers] = await Promise.all([
                API.getComp(), API.getMatches(), API.getOfficials(), API.getClasses(), API.getAthletes(), API.getTeams(), API.getDrawsPlayers()
            ]);
            state.competition = c;
            state.officials = off.success ? off.data : [];
            state.allAthletes = ath || [];
            state.allTeams = teams || [];
            state.drawPlayers = dPlayers || [];
            state.logos = c.logos && Array.isArray(c.logos) && c.logos.length > 0 ? c.logos : ['/img/world-boccia.png', '/img/ande.png'];
            
            state.scheduledMatches = m.sort((a,b) => {
                const dA = a.match_date || '9999-99-99';
                const dB = b.match_date || '9999-99-99';
                if (dA !== dB) return dA.localeCompare(dB);
                const tA = a.start_time || '99:99';
                const tB = b.start_time || '99:99';
                return tA.localeCompare(tB);
            });
            renderView();
        } catch (e) { root.innerHTML = `Erro: ${e.message}`; }
    }

    function renderView() {
        const uniqueClasses = [...new Set(state.scheduledMatches.map(m => m.class_code))].filter(Boolean).sort();
        const uniqueDates = [...new Set(state.scheduledMatches.map(m => m.match_date || ''))].sort();
        const uniqueTimes = [...new Set(state.scheduledMatches.map(m => m.start_time || ''))].sort();

        const styles = `
        <style>
            .sheet-container { max-width: 1000px; margin: 20px auto; font-family: sans-serif; }
            .matches-table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #ccc; font-size: 14px; }
            .matches-table th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; }
            .matches-table th, .matches-table td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
            .btn-p { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s; }
            .btn-p:hover { background: #059669; }
            .btn-print-one { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 5px; }
            .btn-print-one:hover { background: #e2e8f0; }
            
            .filter-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; align-items: center; flex-wrap: wrap; }
            .filter-select { padding: 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 14px; min-width: 150px; }
            .logo-config-box { background: #fff; border: 1px solid #cbd5e1; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px; }

            @media screen { #print-render-area { display: none; } }
        </style>
        `;

        root.innerHTML = `
            ${styles}
            <div class="sheet-container">
                <div class="sheet-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h1>Gerador de Súmulas (PDF Oficial)</h1>
                    <button class="btn-p" id="btn-print-filtered">📥 Baixar Súmulas em PDF</button>
                </div>
                
                <div class="logo-config-box">
                    <div style="font-weight:bold; color:#0f172a; font-size: 15px;">🖼️ Logos do Cabeçalho da Súmula</div>
                    <div style="font-size: 12px; color: #64748b;">Adicione links (URLs) de imagens. Máximo de 5 logos. O sistema alinha e distribui o espaço automaticamente para o PDF.</div>
                    <div id="logos-inputs-container" style="display:flex; flex-direction:column; gap:8px;"></div>
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <button id="btn-add-logo" class="btn-print-one" style="font-weight:bold; width: 150px;">+ Adicionar Logo</button>
                        <button id="btn-save-logos" class="btn-p" style="background:#3b82f6; width:auto; margin-left:auto;">💾 Salvar Logos</button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div style="font-weight:bold; color:#475569;">Filtros de Exportação:</div>
                    <select id="filter-date" class="filter-select">
                        <option value="">📅 Todas as Datas</option>
                        ${uniqueDates.map(d => `<option value="${d}">${d ? formatDate(d) : 'A definir'}</option>`).join('')}
                    </select>
                    <select id="filter-time" class="filter-select">
                        <option value="">⏰ Todas as Rodadas</option>
                        ${uniqueTimes.map(t => `<option value="${t}">${t ? `Rodada das ${t}` : 'A definir'}</option>`).join('')}
                    </select>
                    <select id="filter-class" class="filter-select">
                        <option value="">♿ Todas as Classes</option>
                        ${uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div style="margin-left:auto; font-size:13px; color:#64748b;" id="filter-count"></div>
                </div>

                <div id="list-view-container">
                    <table class="matches-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Hora (Jogo)</th>
                                <th>Quadra</th>
                                <th>Classe</th>
                                <th>Atleta 1</th>
                                <th>Atleta 2</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody id="matches-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        renderLogoInputs();

        function renderLogoInputs() {
            const container = document.getElementById('logos-inputs-container');
            container.innerHTML = state.logos.map((url, i) => `
                <div style="display:flex; gap:10px; align-items:center; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                    <img id="preview-logo-${i}" src="${url || 'https://via.placeholder.com/60?text=Logo'}" style="width:60px; height:40px; object-fit:contain; border:1px solid #cbd5e1; border-radius:4px; background:#fff;" onerror="this.src='https://via.placeholder.com/60?text=Erro'">
                    <input type="text" class="filter-select logo-input-val" data-idx="${i}" value="${url}" placeholder="Cole a URL da imagem aqui..." style="flex:1;">
                    <button class="btn-print-one btn-del-logo" data-idx="${i}" style="color:#ef4444; font-weight:bold; width:40px; border-color:#fca5a5; background:#fef2f2;">X</button>
                </div>
            `).join('');
            
            document.getElementById('btn-add-logo').style.display = state.logos.length >= 5 ? 'none' : 'block';

            document.querySelectorAll('.btn-del-logo').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.idx);
                    state.logos.splice(idx, 1);
                    renderLogoInputs();
                };
            });

            document.querySelectorAll('.logo-input-val').forEach(inp => {
                inp.addEventListener('input', (e) => {
                    const idx = e.target.dataset.idx;
                    const val = e.target.value.trim();
                    state.logos[idx] = val;
                    document.getElementById(`preview-logo-${idx}`).src = val || 'https://via.placeholder.com/60?text=Logo';
                });
            });
        }

        document.getElementById('btn-add-logo').onclick = () => {
            if(state.logos.length < 5) { state.logos.push(''); renderLogoInputs(); }
        };

        document.getElementById('btn-save-logos').onclick = async () => {
            const inputs = document.querySelectorAll('.logo-input-val');
            const newLogos = [];
            inputs.forEach(inp => { if(inp.value.trim()) newLogos.push(inp.value.trim()); });
            state.logos = newLogos;
            
            const btn = document.getElementById('btn-save-logos');
            btn.innerText = 'Salvando...';
            try {
                await API.updateLogos(state.logos);
                btn.innerText = '✅ Salvo!';
                setTimeout(() => btn.innerText = '💾 Salvar Logos', 2000);
            } catch(e) { alert("Erro ao salvar logos."); btn.innerText = '💾 Salvar Logos'; }
            renderLogoInputs();
        };

        function updateTable() {
            const fDate = document.getElementById('filter-date').value;
            const fTime = document.getElementById('filter-time').value;
            const fClass = document.getElementById('filter-class').value;
            
            const filtered = state.scheduledMatches.filter(m => {
                if (fDate && (m.match_date || '') !== fDate) return false;
                if (fTime && (m.start_time || '') !== fTime) return false;
                if (fClass && m.class_code !== fClass) return false;
                return true;
            });
            
            const tbody = document.getElementById('matches-tbody');
            
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Nenhum jogo encontrado.</td></tr>`;
            } else {
                tbody.innerHTML = filtered.map(m => {
                    const numJogo = (m.match_number && m.match_number !== 'null') ? `J${m.match_number}` : '-';
                    const dataDisp = m.match_date ? formatDate(m.match_date) : '<span style="color:#94a3b8">A definir</span>';
                    const timeDisp = m.start_time ? `<b>${m.start_time}</b>` : '<span style="color:#94a3b8">A definir</span>';
                    const courtDisp = m.court ? `<b>${m.court}</b>` : '<span style="color:#94a3b8">A definir</span>';
                    
                    const p1 = getParticipantData(m, 1);
                    const p2 = getParticipantData(m, 2);

                    return `
                        <tr>
                            <td>${dataDisp}</td>
                            <td>${timeDisp} <span style="color:#64748b; font-size:12px;">(${numJogo})</span></td>
                            <td>${courtDisp}</td>
                            <td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;">${m.class_code}</span></td>
                            <td>${p1.name}</td>
                            <td>${p2.name}</td>
                            <td><button class="btn-print-one btn-print-single" data-id="${m.id}" title="Gerar PDF desta Súmula">📥 Baixar PDF</button></td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('filter-count').innerText = `${filtered.length} jogo(s) na lista`;

            document.querySelectorAll('.btn-print-single').forEach(b => {
                b.onclick = () => {
                    const matchToPrint = state.scheduledMatches.find(x => String(x.id) === String(b.dataset.id));
                    if (matchToPrint) generateAndDownloadPDF([matchToPrint]);
                };
            });
            return filtered;
        }

        document.getElementById('filter-date').addEventListener('change', updateTable);
        document.getElementById('filter-time').addEventListener('change', updateTable);
        document.getElementById('filter-class').addEventListener('change', updateTable);

        document.getElementById('btn-print-filtered').onclick = () => {
            const matchesToPrint = updateTable();
            if (matchesToPrint.length === 0) { alert("Não há jogos na lista."); return; }
            generateAndDownloadPDF(matchesToPrint);
        };

        updateTable();
    }

    async function generateAndDownloadPDF(matches) {
        await ensureHtml2PdfLoaded();

        const btnMain = document.getElementById('btn-print-filtered');
        const originalText = btnMain.innerText;
        btnMain.innerText = "A Gerar PDF Oficial...";
        btnMain.disabled = true;

        window.scrollTo(0, 0); 

        const fDate = document.getElementById('filter-date').value;
        const fTime = document.getElementById('filter-time').value;
        const fClass = document.getElementById('filter-class').value;

        let pdfFileName = "Sumulas_Bocha";
        if (matches.length === 1) {
            pdfFileName = `Sumula_J${matches[0].match_number || 'Avulso'}_${matches[0].class_code}`;
        } else {
            if (fClass) pdfFileName += `_Classe_${fClass}`;
            if (fDate) pdfFileName += `_Dia_${fDate.replace(/-/g, '_')}`;
            if (fTime) pdfFileName += `_Rodada_${fTime.replace(':', 'h')}`;
        }

        let fullHTML = '';

        matches.forEach((m, index) => {
            const p1 = getParticipantData(m, 1);
            const p2 = getParticipantData(m, 2);
            const ends = state.classesDataMap[m.class_code]?.ends || 4;
            const titleStr = formatMatchTitle(m);
            const compName = escapeHTML(state.competition.nome || state.competition.name || 'SÚMULA DA COMPETIÇÃO');
            
            const refPrincipal = getRefName(m.referee_principal_id || m.referee_id);
            const refLinha = getRefName(m.referee_linha_id);
            const refMesa = getRefName(m.referee_mesa_id);

            let details = {};
            try { if (m.match_details || m.details) details = typeof(m.details) === 'object' ? m.details : JSON.parse(m.match_details || m.details); } catch(e) {}
            
            const p1P = Array.isArray(details.p1_partials) ? details.p1_partials : [];
            const p2P = Array.isArray(details.p2_partials) ? details.p2_partials : [];
            
            const fS1 = (m.p1_score !== null && m.p1_score !== undefined && String(m.p1_score) !== 'null') ? m.p1_score : '';
            const fS2 = (m.p2_score !== null && m.p2_score !== undefined && String(m.p2_score) !== 'null') ? m.p2_score : '';

            let logoJustify = 'center';
            if (state.logos.length === 2) logoJustify = 'space-between'; 
            else if (state.logos.length > 2) logoJustify = 'space-between';

            let logosHTML = '';
            if (state.logos.length > 0) {
                logosHTML = `<div style="display: flex; justify-content: ${logoJustify}; align-items: center; margin-bottom: 10px; width: 100%; height: 50px;">
                    ${state.logos.map(url => `<img src="${url}" style="max-height:45px; max-width:110px; object-fit:contain;">`).join('')}
                </div>`;
            }

            // 🔥 ALTURA REDUZIDA PARA 250MM (Para afastar o rodapé da margem de quebra de página!)
            fullHTML += `
            <div style="width: 190mm; height: 250mm; margin: 0 auto; box-sizing: border-box; page-break-after: always; padding: 2mm 5mm; background: #fff; font-family: Arial, sans-serif; color: #000; overflow: hidden; position: relative;">
                
                ${logosHTML}

                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 6px;">
                    <h2 style="margin: 0; font-size: 15px; letter-spacing: 1px; text-transform: uppercase;">${compName}</h2>
                    <p style="margin: 2px 0 0 0; font-size: 12px; font-weight: bold;">SÚMULA DE JOGO</p>
                </div>
                
                <div style="border: 2px solid #000; border-radius: 8px; overflow: hidden; margin-bottom: 6px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">
                        <tr>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 33%;"><strong>Jogo nº:</strong> ${m.match_number || ''}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 33%;"><strong>Data:</strong> ${m.match_date ? formatDate(m.match_date) : ''}</td>
                            <td style="border-bottom: 1px solid #000; padding: 4px; width: 34%;"><strong>Quadra:</strong> ${m.court || ''}</td>
                        </tr>
                        <tr>
                            <td style="border-right: 1px solid #000; padding: 4px;"><strong>Classe:</strong> ${escapeHTML(m.class_code)}</td>
                            <td style="border-right: 1px solid #000; padding: 4px;"><strong>Fase:</strong> ${escapeHTML(titleStr)}</td>
                            <td style="padding: 4px;"><strong>Horário:</strong> ${m.start_time || ''}</td>
                        </tr>
                    </table>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                    <div style="flex: 1; border: 2px solid #000; border-radius: 8px; padding: 6px; text-align: center;">
                        <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Nº: <span style="font-size:14px; margin-right:8px;">${p1.bib}</span> NOME: ${p1.name}</div>
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 2px;">Equipe: ${p1.club}</div>
                        <div style="font-size: 11px; font-weight: bold;">Cor: VERMELHA</div>
                    </div>
                    <div style="flex: 1; border: 2px solid #000; border-radius: 8px; padding: 6px; text-align: center;">
                        <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Nº: <span style="font-size:14px; margin-right:8px;">${p2.bib}</span> NOME: ${p2.name}</div>
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 2px;">Equipe: ${p2.club}</div>
                        <div style="font-size: 11px; font-weight: bold;">Cor: AZUL</div>
                    </div>
                </div>

                <div style="border: 2px solid #000; border-radius: 8px; overflow: hidden; margin-bottom: 6px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; table-layout: fixed;">
                        <tr style="background-color: #f1f5f9; font-weight: bold;">
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 20%;">Tempo</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 15%;">Pontos</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 30%;">Parcial</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 15%;">Pontos</td>
                            <td style="border-bottom: 1px solid #000; padding: 4px; width: 20%;">Tempo</td>
                        </tr>
                        ${Array.from({length:ends}).map((_,i)=> `
                        <tr>
                            <td style="border-right: 1px solid #000; ${i<ends-1 ? 'border-bottom: 1px solid #000;' : ''} padding: 4px; height: 22px;"></td>
                            <td style="border-right: 1px solid #000; ${i<ends-1 ? 'border-bottom: 1px solid #000;' : ''} padding: 4px; font-weight:bold; font-size:14px;">${p1P[i] !== undefined && p1P[i] !== null ? p1P[i] : ''}</td>
                            <td style="border-right: 1px solid #000; ${i<ends-1 ? 'border-bottom: 1px solid #000;' : ''} padding: 4px; background-color: #f8fafc; font-weight: bold;">${i+1}</td>
                            <td style="border-right: 1px solid #000; ${i<ends-1 ? 'border-bottom: 1px solid #000;' : ''} padding: 4px; font-weight:bold; font-size:14px;">${p2P[i] !== undefined && p2P[i] !== null ? p2P[i] : ''}</td>
                            <td style="${i<ends-1 ? 'border-bottom: 1px solid #000;' : ''} padding: 4px;"></td>
                        </tr>`).join('')}
                    </table>
                </div>

                <div style="border: 2px solid #000; border-radius: 8px; overflow: hidden; margin-bottom: 6px; background-color: #e2e8f0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: center; table-layout: fixed;">
                        <tr style="font-weight: bold;">
                            <td style="border-right: 1px solid #000; padding: 6px; width: 35%; font-size: 16px;">${fS1}</td>
                            <td style="border-right: 1px solid #000; padding: 6px; width: 30%;">PONTUAÇÃO FINAL</td>
                            <td style="padding: 6px; width: 35%; font-size: 16px;">${fS2}</td>
                        </tr>
                    </table>
                </div>

                <div style="border: 2px solid #000; border-radius: 8px; overflow: hidden; margin-bottom: 6px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; table-layout: fixed;">
                        <tr>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 20%; height: 22px;"></td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 15%; font-weight:bold; font-size:14px;">${p1P[4]??''}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 30%; background-color: #f8fafc; font-weight: bold;">1º TIE BREAK</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 4px; width: 15%; font-weight:bold; font-size:14px;">${p2P[4]??''}</td>
                            <td style="border-bottom: 1px solid #000; padding: 4px; width: 20%;"></td>
                        </tr>
                        <tr>
                            <td style="border-right: 1px solid #000; padding: 4px; height: 22px;"></td>
                            <td style="border-right: 1px solid #000; padding: 4px; font-weight:bold; font-size:14px;">${p1P[5]??''}</td>
                            <td style="border-right: 1px solid #000; padding: 4px; background-color: #f8fafc; font-weight: bold;">2º TIE BREAK</td>
                            <td style="border-right: 1px solid #000; padding: 4px; font-weight:bold; font-size:14px;">${p2P[5]??''}</td>
                            <td style="padding: 4px;"></td>
                        </tr>
                    </table>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <div style="flex: 1; border: 2px solid #000; border-radius: 8px; padding: 6px; height: 80px; position: relative;">
                        <strong>Violações/Comentários:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 15px;"></div>
                        <div style="border-bottom: 1px solid #000; margin-top: 15px;"></div>
                        <div style="position: absolute; bottom: 6px; left: 0; width: 100%; text-align: center; font-size: 11px; font-weight: bold;">
                            Aceite do atleta <div style="display:inline-block; width:12px; height:12px; border:1px solid #000; vertical-align:middle; margin-left:4px;"></div>
                        </div>
                    </div>
                    <div style="flex: 1; border: 2px solid #000; border-radius: 8px; padding: 6px; height: 80px; position: relative;">
                        <strong>Violações/Comentários:</strong>
                        <div style="border-bottom: 1px solid #000; margin-top: 15px;"></div>
                        <div style="border-bottom: 1px solid #000; margin-top: 15px;"></div>
                        <div style="position: absolute; bottom: 6px; left: 0; width: 100%; text-align: center; font-size: 11px; font-weight: bold;">
                            Aceite do atleta <div style="display:inline-block; width:12px; height:12px; border:1px solid #000; vertical-align:middle; margin-left:4px;"></div>
                        </div>
                    </div>
                </div>

                <div style="border: 2px solid #000; border-radius: 8px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">
                        <tr>
                            <td colspan="3" style="border-bottom: 1px solid #000; padding: 6px;">
                                <strong>Ganhador:</strong> ___________________________________ &nbsp;&nbsp;&nbsp; <strong>Nº:</strong> _______ &nbsp;&nbsp;&nbsp; <strong>Clube:</strong> __________________
                            </td>
                        </tr>
                        <tr>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 6px; width: 33%;"><strong>Mesário:</strong> ${refMesa}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 6px; width: 33%;"><strong>Linha:</strong> ${refLinha}</td>
                            <td style="border-bottom: 1px solid #000; padding: 6px; width: 34%;"><strong>Árbitro:</strong> ${refPrincipal}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="border-right: 1px solid #000; padding: 6px;"><strong>Árbitro Chefe:</strong> _____________________________________</td>
                            <td style="padding: 6px;"><strong>Hora Final:</strong> _____ : _____</td>
                        </tr>
                    </table>
                </div>
            </div>`;
        });

        // Wrapper invisível
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = fullHTML;

        let loadingOverlay = document.createElement('div');
        loadingOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(255,255,255,0.9); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center;';
        loadingOverlay.innerHTML = `<div style="font-size:24px; font-weight:bold; color:#0f172a;">A Gerar Súmulas Oficiais em PDF... Aguarde.</div>`;
        document.body.appendChild(loadingOverlay);

        setTimeout(() => {
            const opt = {
                margin:       0,
                filename:     pdfFileName + '.pdf',
                image:        { type: 'jpeg', quality: 1 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true, logging: false },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(tempDiv).save().then(() => {
                document.body.removeChild(loadingOverlay);
                btnMain.innerText = originalText;
                btnMain.disabled = false;
            }).catch(e => {
                console.error(e);
                alert("Erro ao gerar o PDF. Verifique sua conexão.");
                document.body.removeChild(loadingOverlay);
                btnMain.innerText = originalText;
                btnMain.disabled = false;
            });
        }, 100);
    }

    loadData();
}