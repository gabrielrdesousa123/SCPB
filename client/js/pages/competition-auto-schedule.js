// client/js/pages/competition-auto-schedule.js

import { db } from '../firebase-config.js';
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionAutoSchedule(root, hashData) {
    let competitionId = null;
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    
    if (idMatch) competitionId = idMatch[1];
    else if (hashData && (hashData.id || hashData.competitionId)) competitionId = hashData.id || hashData.competitionId;

    if (!competitionId) {
        root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`;
        return;
    }

    const state = {
        competition: {},
        allMatches: [],
        allAthletes: [],
        allTeams: [],
        drawPlayers: [],
        classesDataMap: {},
        generatedSlots: [],
        unscheduledMatches: [],
        customRules: [] 
    };

    const API = {
        getComp: async () => {
            const snap = await getDoc(doc(db, "competitions", String(competitionId)));
            return snap.exists() ? { id: snap.id, ...snap.data() } : {};
        },
        getClasses: async () => {
            const snap = await getDocs(collection(db, "classes"));
            snap.forEach(doc => { 
                const c = doc.data();
                state.classesDataMap[c.codigo || c.code || doc.id] = { bg: c.ui_bg || '#f8f9fa', fg: c.ui_fg || '#212529', match_time: c.match_time || c.tempo_partida || 50 }; 
            });
        },
        getMatches: async () => {
            let matches = [];
            const qGroup = query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId)));
            const snapGroup = await getDocs(qGroup);
            snapGroup.forEach(d => {
                const data = d.data();
                (data.matches || data.data || []).forEach(pool => {
                    Object.values(pool.rounds || {}).forEach(rms => {
                        rms.forEach(m => {
                            if (String(m.status).toUpperCase() === 'BYE' || m.is_bye) return;
                            matches.push({ ...m, class_code: data.class_code, match_type: 'GROUP', dbId: d.id, isGroup: true, pool_name: pool.pool_name });
                        });
                    });
                });
            });

            const qKo = query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId)));
            const snapKo = await getDocs(qKo);
            snapKo.forEach(d => {
                const data = d.data(); 
                (data.matches || data.data || []).forEach(m => {
                    if (String(m.status).toUpperCase() === 'BYE' || m.is_bye) return;
                    matches.push({ ...m, class_code: data.class_code, match_type: 'KO', dbId: d.id, isGroup: false });
                });
            });
            return matches;
        },
        getAthletes: async () => { const snap = await getDocs(collection(db, "atletas")); return snap.docs.map(d => ({ id: d.id, ...d.data() })); },
        getTeams: async () => { const snap = await getDocs(collection(db, "equipes")); return snap.docs.map(d => ({ id: d.id, ...d.data() })); },
        getDrawsPlayers: async () => {
            let players = [];
            const snap = await getDocs(query(collection(db, "draws"), where("competition_id", "==", String(competitionId))));
            snap.forEach(d => {
                const data = d.data();
                if (data.seeds) data.seeds.forEach(p => { if (p && p.id && p.id !== 'BYE') players.push(p); });
                (data.data || data.groups || data.draw_data || []).forEach(pool => {
                    if (pool.players) pool.players.forEach(p => { if (p && p.id && p.id !== 'BYE') players.push(p); });
                });
            });
            return players;
        },
        saveScheduleBatch: async (draftArray) => {
            const draftMap = {};
            draftArray.forEach(d => { draftMap[String(d.matchId)] = d; });

            const groupSnap = await getDocs(query(collection(db, "matches_group"), where("competition_id", "==", String(competitionId))));
            for (const docSnap of groupSnap.docs) {
                let data = docSnap.data(); let pools = data.matches || data.data || []; let modified = false;
                pools.forEach(pool => {
                    Object.values(pool.rounds || {}).forEach(roundMatches => {
                        roundMatches.forEach((m, idx) => {
                            if (draftMap[String(m.id)]) {
                                const d = draftMap[String(m.id)];
                                roundMatches[idx] = { ...m, court: d.court, match_date: d.match_date, start_time: d.start_time };
                                modified = true;
                            }
                        });
                    });
                });
                if (modified) await updateDoc(docSnap.ref, { [data.matches ? 'matches' : 'data']: pools });
            }

            const koSnap = await getDocs(query(collection(db, "matches_ko"), where("competition_id", "==", String(competitionId))));
            for (const docSnap of koSnap.docs) {
                let data = docSnap.data(); let kos = data.matches || data.data || []; let modified = false;
                kos.forEach((m, idx) => {
                    if (draftMap[String(m.id)]) {
                        const d = draftMap[String(m.id)];
                        kos[idx] = { ...m, court: d.court, match_date: d.match_date, start_time: d.start_time };
                        modified = true;
                    }
                });
                if (modified) await updateDoc(docSnap.ref, { [data.matches ? 'matches' : 'data']: kos });
            }
        }
    };

    const escapeHTML = s => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const normalizeName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    function getParticipantData(m, side) {
        const prefix = side === 1 ? (m.isGroup ? 'entrant1' : 'entrant_a') : (m.isGroup ? 'entrant2' : 'entrant_b');
        let pName = m[`${prefix}_name`] || m[`p${side}_name`] || '';
        let club = m[`${prefix}_club_sigla`] || m[`p${side}_club`] || m[`${prefix}_club_nome`] || '';
        let id = m[`${prefix}_id`] || m[`${prefix}_athlete_id`];
        const normName = normalizeName(pName);

        let entity = null;
        if (id && state.drawPlayers.length > 0) entity = state.drawPlayers.find(p => String(p.id) === String(id));
        if (!entity && normName) entity = state.drawPlayers.find(p => normalizeName(p.nome || p.name).includes(normName));
        if (!entity && state.allAthletes.length > 0) {
            if (id) entity = state.allAthletes.find(a => String(a.id) === String(id));
            if (!entity && normName) entity = state.allAthletes.find(a => normalizeName(a.nome || a.name).includes(normName));
        }
        if (!entity && state.allTeams.length > 0) {
            if (id) entity = state.allTeams.find(t => String(t.id) === String(id));
            if (!entity && normName) entity = state.allTeams.find(t => normalizeName(t.nome || t.name).includes(normName));
        }

        if (entity) {
            pName = entity.nome || entity.name || pName;
            club = entity.clube_sigla || entity.clube_nome || entity.sigla || club;
        }

        return { id: id || normName, name: escapeHTML(pName || 'A Definir'), club: escapeHTML(club || '') };
    }

    function timeToMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return (h * 60) + (m || 0); }
    function minsToTime(mins) { return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`; }

    function getMatchDur(classCode) {
        const cData = state.classesDataMap[classCode] || {};
        let d = parseInt(cData.match_time || 50);
        return (isNaN(d) || d < 30) ? 50 : d;
    }

    // 🔥 MOTOR DE INTELIGÊNCIA ALGORÍTMICA 
    function generateSmartSchedule(config) {
        state.generatedSlots = [];
        state.unscheduledMatches = [];

        let pendingMatches = state.allMatches.map((m, index) => {
            const p1 = getParticipantData(m, 1);
            const p2 = getParticipantData(m, 2);
            return { ...m, _tempId: index, p1Id: p1.id, p2Id: p2.id, p1Name: p1.name, p2Name: p2.name, p1Club: p1.club, p2Club: p2.club };
        });

        const dStart = new Date(config.dateStart + 'T00:00:00');
        const dEnd = new Date(config.dateEnd + 'T00:00:00');
        const totalDays = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;

        let classFrequency = {};
        let classRoundsInfo = {};
        
        pendingMatches.forEach(m => {
            classFrequency[m.class_code] = (classFrequency[m.class_code] || 0) + 1;
            
            if (!classRoundsInfo[m.class_code]) classRoundsInfo[m.class_code] = new Set();
            let rName = m.round_name || 'Fase_Final';
            if (m.match_type === 'GROUP') rName = 'Grupo_' + (m.pool_name||'') + '_Rodada_' + (m.round_name||'');
            classRoundsInfo[m.class_code].add(rName);
        });

        let targetRoundsPerDay = {};
        Object.keys(classRoundsInfo).forEach(c => {
            targetRoundsPerDay[c] = Math.ceil(classRoundsInfo[c].size / totalDays);
        });

        pendingMatches.sort((a, b) => {
            if (config.priorityRule === 'MOST_GAMES') {
                if (classFrequency[b.class_code] !== classFrequency[a.class_code]) {
                    return classFrequency[b.class_code] - classFrequency[a.class_code];
                }
            }
            if (a.match_type !== b.match_type) return a.match_type === 'GROUP' ? -1 : 1;
            return Number(a.match_number || 999) - Number(b.match_number || 999);
        });

        let athleteLogs = {}; 
        
        for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const endMin = timeToMins(config.timeEnd);
            let currentMin = 0; 
            
            let dailyGames = {}; 
            let dailyClassRounds = {}; 

            const totalRoundsInDay = config.rMorning + config.rAfternoon + config.rNight;
            let currentShift = '';

            for (let roundIndex = 1; roundIndex <= totalRoundsInDay; roundIndex++) {
                if (pendingMatches.length === 0) break;

                let newShift = '';
                if (roundIndex <= config.rMorning) newShift = 'MORNING';
                else if (roundIndex <= config.rMorning + config.rAfternoon) newShift = 'AFTERNOON';
                else newShift = 'NIGHT';

                // 🔥 MAGIA DO TEMPO: Ajusta a hora quando muda o turno!
                if (newShift !== currentShift) {
                    if (newShift === 'MORNING') currentMin = Math.max(currentMin, timeToMins(config.startMorn));
                    if (newShift === 'AFTERNOON') currentMin = Math.max(currentMin, timeToMins(config.startAft));
                    if (newShift === 'NIGHT') currentMin = Math.max(currentMin, timeToMins(config.startNight));
                    currentShift = newShift;
                }

                if (currentMin >= endMin) break; // Excedeu a hora de encerramento do pavilhão

                let eligibleMatches = [];
                
                for (const m of pendingMatches) {
                    let canPlay = true;
                    const p1 = m.p1Id;
                    const p2 = m.p2Id;
                    
                    // Limite de Jogos por Dia
                    if (config.maxGamesPerDay > 0) {
                        if ((dailyGames[p1] || 0) >= config.maxGamesPerDay) canPlay = false;
                        if ((dailyGames[p2] || 0) >= config.maxGamesPerDay) canPlay = false;
                    }

                    // Limite de Jogos por Turno
                    if (canPlay && config.maxGamesPerShift > 0) {
                        const p1Logs = athleteLogs[p1] || [];
                        const p2Logs = athleteLogs[p2] || [];
                        
                        const shiftGamesP1 = p1Logs.filter(l => l.date === dateStr && l.shift === currentShift).length;
                        const shiftGamesP2 = p2Logs.filter(l => l.date === dateStr && l.shift === currentShift).length;

                        if (shiftGamesP1 >= config.maxGamesPerShift) canPlay = false;
                        if (shiftGamesP2 >= config.maxGamesPerShift) canPlay = false;
                    }
                    
                    // Descanso (Rodadas ou Minutos)
                    if (canPlay && config.restAmount > 0) {
                        const p1Logs = athleteLogs[p1] || [];
                        const p2Logs = athleteLogs[p2] || [];
                        
                        if (config.isRestRounds) {
                            const p1LastRound = p1Logs.filter(l => l.date === dateStr).map(l => l.roundIndex).pop() || -999;
                            const p2LastRound = p2Logs.filter(l => l.date === dateStr).map(l => l.roundIndex).pop() || -999;
                            
                            if (roundIndex - p1LastRound <= config.restAmount) canPlay = false;
                            if (roundIndex - p2LastRound <= config.restAmount) canPlay = false;
                        } else {
                            const recentGameP1 = p1Logs.find(l => l.date === dateStr && Math.abs(currentMin - l.timeMins) < config.restAmount);
                            const recentGameP2 = p2Logs.find(l => l.date === dateStr && Math.abs(currentMin - l.timeMins) < config.restAmount);
                            if (recentGameP1 || recentGameP2) canPlay = false;
                        }
                    }

                    // Regra Igualitária
                    if (canPlay && config.priorityRule === 'EQUAL') {
                        let rName = m.round_name || 'Fase_Final';
                        if (m.match_type === 'GROUP') rName = 'Grupo_' + (m.pool_name||'') + '_Rodada_' + (m.round_name||'');
                        if (!dailyClassRounds[m.class_code]) dailyClassRounds[m.class_code] = new Set();
                        
                        if (!dailyClassRounds[m.class_code].has(rName)) {
                            if (dailyClassRounds[m.class_code].size >= targetRoundsPerDay[m.class_code]) {
                                canPlay = false;
                            }
                        }
                    }

                    // Regras Específicas
                    if (canPlay && state.customRules.length > 0) {
                        for (const rule of state.customRules) {
                            if (m.class_code === rule.classCode) {
                                // Regras de Turno
                                if (rule.target === 'MORNING' && currentShift !== 'MORNING' && rule.type === 'MUST') canPlay = false;
                                if (rule.target === 'MORNING' && currentShift === 'MORNING' && rule.type === 'MUST_NOT') canPlay = false;
                                
                                if (rule.target === 'AFTERNOON' && currentShift !== 'AFTERNOON' && rule.type === 'MUST') canPlay = false;
                                if (rule.target === 'AFTERNOON' && currentShift === 'AFTERNOON' && rule.type === 'MUST_NOT') canPlay = false;

                                if (rule.target === 'NIGHT' && currentShift !== 'NIGHT' && rule.type === 'MUST') canPlay = false;
                                if (rule.target === 'NIGHT' && currentShift === 'NIGHT' && rule.type === 'MUST_NOT') canPlay = false;
                                
                                // Regras da Ordem de Rodada (Ex: 1ª Rodada do dia)
                                if (rule.target.startsWith('ROUND_')) {
                                    const targetRound = parseInt(rule.target.split('_')[1]);
                                    if (roundIndex !== targetRound && rule.type === 'MUST') canPlay = false;
                                    if (roundIndex === targetRound && rule.type === 'MUST_NOT') canPlay = false;
                                }
                            }
                        }
                    }
                    
                    if (canPlay) eligibleMatches.push(m);
                }
                
                let roundPicks = [];
                let playersInRound = new Set();
                
                if (eligibleMatches.length > 0) {
                    let firstMatch = eligibleMatches[0];
                    roundPicks.push(firstMatch);
                    if (firstMatch.p1Id && firstMatch.p1Id !== 'A Definir') playersInRound.add(firstMatch.p1Id);
                    if (firstMatch.p2Id && firstMatch.p2Id !== 'A Definir') playersInRound.add(firstMatch.p2Id);
                    
                    const themeClass = firstMatch.class_code;
                    const themeType = firstMatch.match_type;
                    const themeRound = firstMatch.round_name;
                    const themeDur = getMatchDur(themeClass);

                    let scoredMatches = [];
                    for (let i = 1; i < eligibleMatches.length; i++) {
                        let m = eligibleMatches[i];
                        let score = 0;
                        
                        if (m.class_code === themeClass && m.match_type === themeType && m.round_name === themeRound) score += 10000;
                        if (getMatchDur(m.class_code) === themeDur) score += 1000;
                        score -= i;
                        scoredMatches.push({ match: m, score: score });
                    }
                    
                    scoredMatches.sort((a, b) => b.score - a.score);
                    
                    for (let i = 0; i < scoredMatches.length; i++) {
                        if (roundPicks.length >= config.courtsCount) break;
                        
                        let m = scoredMatches[i].match;
                        if (m.p1Id && playersInRound.has(m.p1Id)) continue;
                        if (m.p2Id && playersInRound.has(m.p2Id)) continue;
                        
                        roundPicks.push(m);
                        if (m.p1Id && m.p1Id !== 'A Definir') playersInRound.add(m.p1Id);
                        if (m.p2Id && m.p2Id !== 'A Definir') playersInRound.add(m.p2Id);
                    }
                }
                
                if (roundPicks.length === 0) {
                    currentMin += 30; // Se não encontrou jogos, avança 30 minutos na mesma rodada
                    continue;
                }
                
                let maxDur = 45;
                for (const m of roundPicks) {
                    let d = getMatchDur(m.class_code);
                    if (d > maxDur) maxDur = d;
                }
                
                if (currentMin + maxDur > endMin) break; 
                
                const tStr = minsToTime(currentMin);
                roundPicks.forEach((m, idx) => {
                    const court = idx + 1;
                    state.generatedSlots.push({
                        date: dateStr,
                        time: tStr,
                        mins: currentMin,
                        court: court,
                        match: m
                    });
                    
                    if (m.p1Id && m.p1Id !== 'A Definir') {
                        if (!athleteLogs[m.p1Id]) athleteLogs[m.p1Id] = [];
                        athleteLogs[m.p1Id].push({ date: dateStr, roundIndex: roundIndex, timeMins: currentMin, shift: currentShift });
                        dailyGames[m.p1Id] = (dailyGames[m.p1Id] || 0) + 1;
                    }
                    if (m.p2Id && m.p2Id !== 'A Definir') {
                        if (!athleteLogs[m.p2Id]) athleteLogs[m.p2Id] = [];
                        athleteLogs[m.p2Id].push({ date: dateStr, roundIndex: roundIndex, timeMins: currentMin, shift: currentShift });
                        dailyGames[m.p2Id] = (dailyGames[m.p2Id] || 0) + 1;
                    }

                    if (config.priorityRule === 'EQUAL') {
                        let rName = m.round_name || 'Fase_Final';
                        if (m.match_type === 'GROUP') rName = 'Grupo_' + (m.pool_name||'') + '_Rodada_' + (m.round_name||'');
                        if (!dailyClassRounds[m.class_code]) dailyClassRounds[m.class_code] = new Set();
                        dailyClassRounds[m.class_code].add(rName);
                    }
                    
                    pendingMatches = pendingMatches.filter(pm => pm._tempId !== m._tempId);
                });
                
                currentMin += maxDur; 
            }
        }
        
        state.unscheduledMatches = pendingMatches;
        renderPreview(); 
    }

    async function init() {
        root.innerHTML = `<div style="text-align:center; padding: 50px;">A carregar motor de agendamento avançado...</div>`;
        const [comp, matches, ath, teams, dp, dummyClass] = await Promise.all([
            API.getComp(), API.getMatches(), API.getAthletes(), API.getTeams(), API.getDrawsPlayers(), API.getClasses()
        ]);
        state.competition = comp; state.allMatches = matches; state.allAthletes = ath; state.allTeams = teams; state.drawPlayers = dp;
        
        if (state.allMatches.length === 0) {
            root.innerHTML = `<div style="text-align:center; padding: 50px;">Não existem jogos gerados nas chaves para agendar.</div>`;
            return;
        }
        renderLayout();
    }

    function renderRulesList() {
        const ctn = document.getElementById('rules-container');
        if(!ctn) return;
        
        if (state.customRules.length === 0) {
            ctn.innerHTML = `<div style="font-size:12px; color:#64748b; padding:10px; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1; text-align:center;">Nenhuma regra configurada. O algoritmo usará padrões.</div>`;
            return;
        }

        const mapTarget = { 
            'MORNING': 'No Turno da Manhã', 
            'AFTERNOON': 'No Turno da Tarde', 
            'NIGHT': 'No Turno da Noite',
            'ROUND_1': 'Na 1ª Rodada do Dia',
            'ROUND_2': 'Na 2ª Rodada do Dia',
            'ROUND_3': 'Na 3ª Rodada do Dia',
            'ROUND_4': 'Na 4ª Rodada do Dia',
            'ROUND_5': 'Na 5ª Rodada do Dia',
            'ROUND_6': 'Na 6ª Rodada do Dia',
            'ROUND_7': 'Na 7ª Rodada do Dia',
            'ROUND_8': 'Na 8ª Rodada do Dia',
            'ROUND_9': 'Na 9ª Rodada do Dia',
            'ROUND_10': 'Na 10ª Rodada do Dia'
        };
        
        ctn.innerHTML = state.customRules.map((r, idx) => `
            <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                <div>A Classe <strong>${escapeHTML(r.classCode)}</strong> <span style="color:${r.type==='MUST'?'#16a34a':'#dc2626'}; font-weight:bold;">${r.type==='MUST'?'DEVE':'NÃO DEVE'} jogar</span> ${mapTarget[r.target] || r.target}.</div>
                <button class="btn-remove-rule" data-idx="${idx}" style="background:transparent; border:none; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button>
            </div>
        `).join('');

        document.querySelectorAll('.btn-remove-rule').forEach(b => {
            b.onclick = (e) => {
                state.customRules.splice(parseInt(e.target.dataset.idx), 1);
                renderRulesList();
            };
        });
    }

    function renderLayout() {
        const uniqueClasses = [...new Set(state.allMatches.map(m => m.class_code))].filter(Boolean).sort();

        const styles = `
            <style>
                .war-room { max-width: 1600px; margin: 0 auto; display: flex; gap: 20px; font-family: sans-serif; }
                .panel { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .controls { width: 360px; flex-shrink: 0; display:flex; flex-direction:column; gap:20px; overflow-y:auto; max-height:85vh; padding-right:10px; }
                .controls::-webkit-scrollbar { width:6px; } .controls::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
                .preview { flex: 1; overflow-y: auto; max-height: 85vh; padding: 10px; }
                
                .section-title { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
                .form-group { margin-bottom: 12px; }
                .form-group label { display: block; font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 4px; }
                .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
                
                .btn-run { background: #2563eb; color: white; border: none; padding: 15px; border-radius: 8px; font-size: 16px; font-weight: 900; cursor: pointer; width: 100%; transition: 0.2s; box-shadow: 0 4px 10px rgba(37,99,235,0.3); text-transform: uppercase; }
                .btn-run:hover { background: #1d4ed8; transform: translateY(-2px); }
                .btn-save { background: #16a34a; color: white; border: none; padding: 15px; border-radius: 8px; font-size: 16px; font-weight: 900; cursor: pointer; width: 100%; transition: 0.2s; margin-top: 15px; }
                .btn-save:hover { background: #15803d; }
                .btn-outline { border: 1px solid #cbd5e1; background: white; color: #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .btn-outline:hover { background: #f1f5f9; }

                .alert-danger { background: #fef2f2; border: 1px solid #fca5a5; padding: 15px; border-radius: 8px; color: #b91c1c; font-weight: bold; margin-bottom: 20px; line-height:1.4; }
                .stats-box { display:flex; gap:15px; margin-bottom:20px; }
                .stat-card { flex:1; padding:15px; border-radius:8px; border:1px solid #e2e8f0; text-align:center; background:#f8fafc; }
                .stat-card.success { background:#f0fdf4; border-color:#86efac; color:#166534; }
                .stat-card.danger { background:#fef2f2; border-color:#fca5a5; color:#b91c1c; }
                
                .shift-box { background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; display:flex; flex-direction:column; gap:8px; }
                .shift-row { display: flex; justify-content: space-between; align-items: center; }
                .shift-row input { width: 60px; text-align: center; font-weight: bold; }
            </style>
        `;

        const defStart = state.competition.data_inicio || new Date().toISOString().split('T')[0];
        const defEnd = state.competition.data_fim || defStart;

        root.innerHTML = `
            ${styles}
            <div style="max-width: 1600px; margin: 0 auto 15px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="margin:0; color:#0f172a;">🤖 War Room - Otimizador de Agenda</h2>
                    <p style="margin:0; font-size:13px; color:#64748b;">Agrupa classes/durações, impede combinações de resultados e respeita as rodadas por turno.</p>
                </div>
                <button onclick="window.history.back()" style="padding:10px 20px; border:1px solid #ccc; border-radius:6px; cursor:pointer; background:#fff; font-weight:bold;">← Voltar à Agenda</button>
            </div>

            <div class="war-room">
                <div class="panel controls">
                    <div>
                        <h3 class="section-title">1. Base Logística</h3>
                        <div style="display:flex; gap:10px;">
                            <div class="form-group" style="flex:1;"><label>Data Inicial</label><input type="date" id="ia-start-date" value="${defStart}"></div>
                            <div class="form-group" style="flex:1;"><label>Data Final</label><input type="date" id="ia-end-date" value="${defEnd}"></div>
                        </div>
                        <div class="form-group"><label>Encerramento do Pavilhão (Limite)</label><input type="time" id="ia-time-end" value="20:00"></div>
                        <div class="form-group"><label>Quadras Físicas Disponíveis</label><input type="number" id="ia-courts" value="4" min="1" max="20"></div>
                    </div>

                    <div>
                        <h3 class="section-title">2. Estrutura de Turnos e Rodadas</h3>
                        <div class="shift-box">
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">☀️ Manhã</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-morn" value="09:00" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-morn" value="3" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">🌤️ Tarde</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-aft" value="14:00" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-aft" value="4" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                            <div class="shift-row">
                                <span style="font-size:13px; font-weight:bold; color:#0f172a; width: 60px;">🌙 Noite</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="time" id="ia-start-night" value="19:00" style="width:90px; padding:4px; font-size:12px;">
                                    <input type="number" id="ia-r-night" value="0" min="0" max="10" style="width:50px; padding:4px; font-size:12px;"> <span style="font-size:11px;">Rod.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 class="section-title">3. Limites e Descanso</h3>
                        <div class="form-group"><label>Descanso Mínimo entre jogos (mesmo atleta)</label>
                            <select id="ia-rest">
                                <option value="0R">Sem restrição (Pode jogar na rodada seguinte)</option>
                                <option value="1R" selected>Descansa 1 Rodada (Não joga 2 seguidas)</option>
                                <option value="2R">Descansa 2 Rodadas</option>
                                <option value="60M">Descansa 1 Turno de Tempo (60 Minutos)</option>
                                <option value="90M">Descansa 1 Turno de Tempo (90 Minutos)</option>
                                <option value="120M">Descansa 2 Turnos de Tempo (120 Minutos)</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Máximo de Jogos por Dia (mesmo atleta)</label>
                            <select id="ia-max-games">
                                <option value="0">Ilimitado</option>
                                <option value="1">1 Jogo por Dia</option>
                                <option value="2" selected>2 Jogos por Dia (Padrão)</option>
                                <option value="3">3 Jogos por Dia</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Máximo de Jogos por Turno (Manhã/Tarde/Noite)</label>
                            <select id="ia-max-shift">
                                <option value="0" selected>Ilimitado</option>
                                <option value="1">1 Jogo por Turno</option>
                                <option value="2">2 Jogos por Turno</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <h3 class="section-title">4. Regras Específicas por Classe</h3>
                        <div id="rules-container" style="margin-bottom:10px;"></div>
                        <div style="background:#f1f5f9; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-bottom:10px; display:none;" id="rule-builder">
                            <div class="form-group"><label>Classe</label><select id="rule-class">${uniqueClasses.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
                            <div class="form-group"><label>Ação</label><select id="rule-type"><option value="MUST_NOT">NÃO DEVE jogar</option><option value="MUST">SÓ DEVE jogar</option></select></div>
                            <div class="form-group">
                                <label>Condição</label>
                                <select id="rule-target">
                                    <optgroup label="Turnos do Dia">
                                        <option value="MORNING">No Turno da Manhã</option>
                                        <option value="AFTERNOON">No Turno da Tarde</option>
                                        <option value="NIGHT">No Turno da Noite</option>
                                    </optgroup>
                                    <optgroup label="Ordem Cronológica do Dia">
                                        <option value="ROUND_1">Na 1ª Rodada do Dia</option>
                                        <option value="ROUND_2">Na 2ª Rodada do Dia</option>
                                        <option value="ROUND_3">Na 3ª Rodada do Dia</option>
                                        <option value="ROUND_4">Na 4ª Rodada do Dia</option>
                                        <option value="ROUND_5">Na 5ª Rodada do Dia</option>
                                        <option value="ROUND_6">Na 6ª Rodada do Dia</option>
                                        <option value="ROUND_7">Na 7ª Rodada do Dia</option>
                                        <option value="ROUND_8">Na 8ª Rodada do Dia</option>
                                        <option value="ROUND_9">Na 9ª Rodada do Dia</option>
                                        <option value="ROUND_10">Na 10ª Rodada do Dia</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button id="btn-cancel-rule" class="btn-outline" style="flex:1;">Cancelar</button>
                                <button id="btn-save-rule" class="btn-outline" style="background:#22c55e; color:white; border-color:#16a34a; flex:1;">Adicionar</button>
                            </div>
                        </div>
                        <button id="btn-show-rule-builder" class="btn-outline" style="width:100%; border-style:dashed;">+ Adicionar Regra Específica</button>
                    </div>

                    <div>
                        <h3 class="section-title">5. Ordem de Processamento</h3>
                        <div class="form-group"><label>Critério principal de encaixe?</label>
                            <select id="ia-priority">
                                <option value="EQUAL" selected>Igualitária (Distribuir rodadas da classe pelos dias)</option>
                                <option value="MOST_GAMES">Densidade (Começar pelas Classes com MAIS jogos)</option>
                                <option value="ORDER">Padrão (Seguir ordem da base de dados)</option>
                            </select>
                        </div>
                    </div>

                    <button class="btn-run" id="btn-run-sim">Gerar Simulação ⚡</button>
                </div>

                <div class="panel preview" id="preview-area">
                    <div style="height: 100%; display: flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8;">
                        <div style="font-size: 60px; margin-bottom:10px;">🧠</div>
                        <h2>Simulador em Repouso</h2>
                        <p>Ajuste os parâmetros à esquerda e execute o motor algorítmico.</p>
                        <p>Temos <strong>${state.allMatches.length}</strong> jogos aguardando cálculos.</p>
                    </div>
                </div>
            </div>
        `;

        renderRulesList();

        document.getElementById('btn-show-rule-builder').addEventListener('click', () => {
            document.getElementById('rule-builder').style.display = 'block';
            document.getElementById('btn-show-rule-builder').style.display = 'none';
        });

        document.getElementById('btn-cancel-rule').addEventListener('click', () => {
            document.getElementById('rule-builder').style.display = 'none';
            document.getElementById('btn-show-rule-builder').style.display = 'block';
        });

        document.getElementById('btn-save-rule').addEventListener('click', () => {
            state.customRules.push({
                classCode: document.getElementById('rule-class').value,
                type: document.getElementById('rule-type').value,
                target: document.getElementById('rule-target').value
            });
            renderRulesList();
            document.getElementById('rule-builder').style.display = 'none';
            document.getElementById('btn-show-rule-builder').style.display = 'block';
        });

        document.getElementById('btn-run-sim').addEventListener('click', () => {
            const restRaw = document.getElementById('ia-rest').value;
            const isRestRounds = restRaw.includes('R');
            const restAmount = parseInt(restRaw);

            const config = {
                dateStart: document.getElementById('ia-start-date').value,
                dateEnd: document.getElementById('ia-end-date').value,
                timeEnd: document.getElementById('ia-time-end').value,
                courtsCount: parseInt(document.getElementById('ia-courts').value),
                
                startMorn: document.getElementById('ia-start-morn').value,
                rMorning: parseInt(document.getElementById('ia-r-morn').value) || 0,
                
                startAft: document.getElementById('ia-start-aft').value,
                rAfternoon: parseInt(document.getElementById('ia-r-aft').value) || 0,
                
                startNight: document.getElementById('ia-start-night').value,
                rNight: parseInt(document.getElementById('ia-r-night').value) || 0,
                
                isRestRounds: isRestRounds,
                restAmount: restAmount,
                maxGamesPerDay: parseInt(document.getElementById('ia-max-games').value),
                maxGamesPerShift: parseInt(document.getElementById('ia-max-shift').value),
                priorityRule: document.getElementById('ia-priority').value
            };

            if (!config.dateStart || !config.dateEnd) return alert('Selecione datas válidas!');
            if (config.rMorning + config.rAfternoon + config.rNight === 0) return alert('O dia tem que ter pelo menos 1 rodada configurada nos turnos!');

            const btn = document.getElementById('btn-run-sim');
            btn.innerText = "A calcular matrizes...";
            
            setTimeout(() => {
                generateSmartSchedule(config);
                btn.innerText = "Refazer Simulação ⚡";
            }, 100);
        });
    }

    function renderPreview() {
        const area = document.getElementById('preview-area');

        let statsHtml = `
            <div class="stats-box">
                <div class="stat-card">
                    <div style="font-size:24px; font-weight:900; color:#0f172a;">${state.allMatches.length}</div>
                    <div style="font-size:12px; font-weight:bold; color:#64748b;">Total de Jogos</div>
                </div>
                <div class="stat-card ${state.generatedSlots.length === state.allMatches.length ? 'success' : ''}">
                    <div style="font-size:24px; font-weight:900;">${state.generatedSlots.length}</div>
                    <div style="font-size:12px; font-weight:bold;">Encaixados</div>
                </div>
                <div class="stat-card ${state.unscheduledMatches.length > 0 ? 'danger' : ''}">
                    <div style="font-size:24px; font-weight:900;">${state.unscheduledMatches.length}</div>
                    <div style="font-size:12px; font-weight:bold;">Ficaram de Fora</div>
                </div>
            </div>
        `;

        let warningHtml = '';
        if (state.unscheduledMatches.length > 0) {
            warningHtml = `
                <div class="alert-danger">
                    ⚠️ ALERTA LOGÍSTICO: O Algoritmo não conseguiu encaixar ${state.unscheduledMatches.length} jogos respeitando as suas restrições.<br>
                    <span style="font-size:13px; font-weight:normal; display:block; margin-top:8px;">
                    Soluções:<br>
                    - Aumente o número de rodadas nos turnos da Manhã/Tarde/Noite.<br>
                    - Verifique se as Regras Específicas não estão a bloquear uma classe inteira.<br>
                    - Diminua o tempo de descanso obrigatório (Ex: Sem restrição).
                    </span>
                </div>
            `;
        }

        let gridHtml = '';
        const slotsByDay = {};
        state.generatedSlots.forEach(s => {
            if(!slotsByDay[s.date]) slotsByDay[s.date] = [];
            slotsByDay[s.date].push(s);
        });

        const totalColumns = parseInt(document.getElementById('ia-courts').value) || 4;

        Object.keys(slotsByDay).sort().forEach(date => {
            const daySlots = slotsByDay[date];
            const formattedDate = date.split('-').reverse().join('/');
            
            let minMin = 9999; let maxMin = 0;
            daySlots.forEach(s => {
                const classData = state.classesDataMap[s.match.class_code] || {};
                let dur = parseInt(classData.match_time || 50);
                if (isNaN(dur) || dur < 30) dur = 50;
                
                const start = s.mins; 
                const end = start + Math.max(dur, 45);
                if (start < minMin) minMin = start; 
                if (end > maxMin) maxMin = end;
            });

            const startHour = Math.floor(minMin / 60) * 60; 
            const endHour = Math.ceil(maxMin / 60) * 60;
            const pxPerMin = 3.0; 
            const totalHeight = (endHour - startHour) * pxPerMin;

            let timeAxisHtml = '';
            for (let t = startHour; t <= endHour; t += 30) {
                timeAxisHtml += `<div style="position:absolute; top:${(t - startHour) * pxPerMin}px; left:0; width:60px; text-align:center; font-size:11px; font-weight:bold; color:#1e293b; transform:translateY(-50%);">${minsToTime(t)}</div>`;
            }

            let blocksHtml = '';
            daySlots.forEach(s => {
                const classData = state.classesDataMap[s.match.class_code] || { bg: '#64748b', fg: '#ffffff', match_time: '50' };
                let durMin = parseInt(classData.match_time || 50);
                if (isNaN(durMin) || durMin < 30) durMin = 50;
                
                const startM = s.mins;
                const topPx = (startM - startHour) * pxPerMin;
                const courtIdx = s.court - 1;

                const leftCss = `calc(60px + (${courtIdx} / ${totalColumns}) * (100% - 60px))`;
                const widthCss = `calc((100% - 60px) / ${totalColumns})`;

                const m = s.match;
                let mNumStr = (m.match_number && String(m.match_number) !== 'null') ? m.match_number : '-';
                let titleStr = m.pool_name ? `Grupo ${m.pool_name}` : (m.round_name || 'Fase Final');

                blocksHtml += `
                    <div style="position:absolute; top:${topPx}px; left:${leftCss}; width:${widthCss}; min-height:90px; height:${Math.max(durMin * pxPerMin, 90)}px; padding: 2px; box-sizing: border-box; z-index: 5;">
                        <div style="background:${classData.bg}; color:${classData.fg}; width:100%; height:100%; border-radius: 6px; border: 1px solid #000; display: flex; flex-direction: column; padding: 6px; box-sizing: border-box; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.2); line-height: 1.1; text-align: center; justify-content: center;">
                            <div style="font-weight: 900; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.4); margin-bottom: 4px; padding-bottom: 4px;">${s.time} • ${escapeHTML(m.class_code)} • J${mNumStr}</div>
                            <div style="font-weight:bold; font-size:9px; background:rgba(0,0,0,0.2); margin-bottom:2px; padding:1px; border-radius:2px;">${escapeHTML(titleStr)}</div>
                            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; justify-content: center;">
                                <div style="font-size: 10px; font-weight: 800; word-break: break-word; line-height: 1.1;">${escapeHTML(m.p1Name)}</div>
                                <div style="font-size: 10px; color: inherit; font-weight: bold; text-transform: uppercase; display:block; margin-top:2px; opacity: 0.9;">${escapeHTML(m.p1Club !== 'A Definir' ? (m.p1Club || '') : '')}</div>
                                <div style="font-size:8px; font-weight:bold; opacity:0.8; margin:1px 0;">VS</div>
                                <div style="font-size: 10px; font-weight: 800; word-break: break-word; line-height: 1.1;">${escapeHTML(m.p2Name)}</div>
                                <div style="font-size: 10px; color: inherit; font-weight: bold; text-transform: uppercase; display:block; margin-top:2px; opacity: 0.9;">${escapeHTML(m.p2Club !== 'A Definir' ? (m.p2Club || '') : '')}</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            let bgCols = `<div style="width: 60px; border-right: 2px solid #000; background: #f1f5f9; flex-shrink: 0; box-sizing:border-box;"></div>`;
            for(let i=0; i<totalColumns; i++) {
                bgCols += `<div style="flex:1; border-right: 1px solid #cbd5e1; box-sizing:border-box;"></div>`;
            }

            gridHtml += `
              <div style="margin-bottom: 40px; background:#fff; border:2px solid #000; border-radius:4px; overflow:hidden;">
                  <div style="background:#0f172a; color:white; padding:8px 15px; font-weight:bold; display:flex; justify-content:space-between;">
                      <span>Pré-Visualização Cronológica</span>
                      <span>Data: ${formattedDate}</span>
                  </div>
                  <div style="display: flex; background: #0f172a; color: white; border-bottom: 2px solid #000;">
                     <div style="width: 60px; border-right: 2px solid #000; flex-shrink: 0; background: #0f172a;"></div>
                     ${Array.from({length: totalColumns}).map((_,i) => `<div style="flex:1; text-align:center; padding:10px 4px; border-right: 1px solid #334155; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center;">Quadra ${i+1}</div>`).join('')}
                  </div>
                  <div style="position: relative; min-height: ${totalHeight + 30}px;">
                      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex;">
                          ${bgCols}
                      </div>
                      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${(30*pxPerMin)-1}px, #cbd5e1 ${(30*pxPerMin)-1}px, #cbd5e1 ${30*pxPerMin}px); pointer-events: none;"></div>
                      ${timeAxisHtml}
                      ${blocksHtml}
                  </div>
              </div>
            `;
        });

        let saveBtnHtml = state.generatedSlots.length > 0 ? `<button class="btn-save" id="btn-commit-db">💾 APROVAR E PUBLICAR NA AGENDA OFICIAL</button>` : '';

        area.innerHTML = `
            ${statsHtml}
            ${warningHtml}
            ${saveBtnHtml}
            <h3 style="margin-top:20px; padding-top:20px; border-top:2px solid #e2e8f0;">Grelha Visual Simulação</h3>
            ${gridHtml}
        `;

        const btnCommit = document.getElementById('btn-commit-db');
        if (btnCommit) {
            btnCommit.addEventListener('click', async () => {
                if(!confirm(`ATENÇÃO ABSOLUTA: Isto vai subscrever permanentemente os horários de ${state.generatedSlots.length} jogos no banco de dados da competição. Proceder?`)) return;
                
                btnCommit.disabled = true; btnCommit.innerText = "A gravar na nuvem...";
                
                const draftToSave = state.generatedSlots.map(s => ({
                    matchId: String(s.match.id),
                    court: s.court,
                    match_date: s.date,
                    start_time: s.time
                }));

                try {
                    await API.saveScheduleBatch(draftToSave);
                    alert("✅ Agenda otimizada publicada com sucesso! Pode verificar na Agenda Drag & Drop.");
                    window.location.hash = `#/competitions/schedule?id=${competitionId}`;
                } catch (e) {
                    alert("Erro crítico ao gravar: " + e.message);
                    btnCommit.disabled = false; btnCommit.innerText = "Tentar Novamente";
                }
            });
        }
    }

    init();
}