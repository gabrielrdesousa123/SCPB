// client/js/pages/live-scoreboard.js

export async function renderLiveScoreboard(root) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const matchId = params.get('match_id');
    const compId = params.get('comp_id');

    const header = document.querySelector('header');
    if (header) header.style.display = 'none';
    document.body.style.backgroundColor = '#000'; 
    root.style.padding = '0';
    root.style.maxWidth = '100%';

    const escapeHTML = str => !str ? '' : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    // 🔥 FORMATADOR DINÂMICO DE FONTE: Garante nome em UMA LINHA, centralizado e sem "..."
    const getDynamicFontSize = (text) => {
        if (!text) return '3vw';
        const len = text.length;
        if (len > 35) return '1.5vw';
        if (len > 25) return '2vw';
        if (len > 15) return '2.5vw';
        return '3vw';
    };

    // 🔥 FORMATAÇÃO DE VIOLAÇÃO: Exatamente como pedido, sem cortes ("...")
    function formatViolationString(rawViolStr) {
        const baseStr = rawViolStr.split(' | ')[0]; 
        const parts = baseStr.split(' - ');
        if (parts.length >= 4) {
            let end = parts[0].trim();
            if (end.includes('1º P')) end = '1P';
            else if (end.includes('2º P')) end = '2P';
            else if (end.includes('3º P')) end = '3P';
            else if (end.includes('4º P')) end = '4P';
            else if (end === 'Câmara de Chamada (CC)') end = 'CC';
            else if (end === 'Tie Break') end = 'TB';
            else if (end.match(/^P\d$/)) end = end.replace('P', '') + 'P'; 
            
            const code = parts[1].trim(); 
            
            // O motivo não é mais cortado com "..."
            let reason = parts[2].trim(); 
            
            let penalty = parts[3].trim(); 
            if (penalty === 'Retração') penalty = 'Ret';
            else if (penalty === '1 Bola de Penalidade') penalty = '1 P';
            else if (penalty === 'Retração + 1 Bola de Penalidade') penalty = 'Ret + 1 P';
            else if (penalty === 'Cartão Amarelo') penalty = 'C. Ama';
            else if (penalty === 'Cartão Vermelho') penalty = 'C. Ver';
            else if (penalty === 'WO / Banimento') penalty = 'WO';
            
            return `${end} ${code} - ${penalty}`;
        }
        return baseStr;
    }

    // 🔥 LAYOUT: Plenamente centralizado, 100vh travado, sem scroll e sem faixa preta.
    const styles = `
        <style>
            * { box-sizing: border-box; }
            html, body { overflow: hidden; height: 100vh; width: 100vw; margin: 0; padding: 0; background: #000; }
            
            .sb-container { display: flex; flex-direction: column; height: 100vh; width: 100vw; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; overflow: hidden; background: #000; position: relative; }
            
            .sb-header { flex: 0 0 8vh; background: #0f172a; padding: 0 2vw; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #334155; position: relative; z-index: 10; }
            
            .sb-header-left { display: flex; align-items: center; gap: 1vw; width: 30%; }
            .sb-menu-btn { background: transparent; border: none; color: #94a3b8; font-size: 3vh; cursor: pointer; padding: 0.5vh; transition: 0.2s; display: flex; align-items: center; }
            .sb-menu-btn:hover { color: #fff; transform: scale(1.1); }
            .sb-match-info { font-size: 2.2vh; font-weight: bold; color: #f8fafc; }
            
            .sb-end-indicator { position: absolute; left: 50%; transform: translateX(-50%); font-size: 3.5vh; font-weight: 900; color: #fbbf24; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 2px 4px rgba(0,0,0,0.5); white-space: nowrap; }
            
            .sb-comp-name { margin: 0; font-size: 1.8vh; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; width: 30%; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            
            .sb-main { flex: 1; display: flex; position: relative; width: 100vw; overflow: hidden; }
            
            .sb-side { flex: 1; width: 50%; max-width: 50%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 2vh 2vw 0 2vw; transition: all 0.2s ease-out; position: relative; overflow: hidden; }
            
            .sb-red { background-color: #ef4444; border-right: 2px solid #000; }
            .sb-blue { background-color: #3b82f6; border-left: 2px solid #000; }
            
            .sb-active.sb-red { background-color: #f87171; }
            .sb-active.sb-blue { background-color: #60a5fa; }

            /* 🔥 BANDEIRAS NOS CANTOS SUPERIORES ABSOLUTOS */
            .logo-corner-p1 { position: absolute; top: 2vh; left: 2vw; height: 10vh; max-width: 14vw; object-fit: contain; background: white; border-radius: 1vh; padding: 1vh; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 10; }
            .logo-corner-p2 { position: absolute; top: 2vh; right: 2vw; height: 10vh; max-width: 14vw; object-fit: contain; background: white; border-radius: 1vh; padding: 1vh; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 10; }
            
            /* 🔥 NOME CENTRALIZADO EM UMA LINHA SÓ */
            .sb-player-box { text-align: center; width: 100%; min-height: 12vh; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; margin-bottom: 0; padding: 0 2vw; z-index: 5; }
            .sb-name { font-weight: 900; line-height: 1.1; text-transform: uppercase; color: #fff; text-shadow: 0 3px 6px rgba(0,0,0,0.5); width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; margin-top: 1vh; }
            .sb-club { font-size: 1.6vw; color: rgba(255,255,255,0.9); font-weight: bold; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; text-shadow: 0 2px 4px rgba(0,0,0,0.4); text-align: center; margin-top: 0.5vh; }
            
            /* 🔥 PLACAR 100% PRETO - CENTRALIZADO ABAIXO DO NOME */
            .sb-score-container { margin-top: 1vh; display: flex; flex-direction: column; align-items: center; width: 100%; position: relative; z-index: 6; }
            .sb-score-box { background: #000; border-radius: 2vh; padding: 0 5vw; display: flex; justify-content: center; align-items: center; border: 5px solid #fff; position: relative; box-shadow: 0 6px 15px rgba(0,0,0,0.6); min-width: 25vw; }
            .sb-score { font-size: 12.5vw; font-weight: bold; line-height: 1; margin: 0; color: #fff; padding-bottom: 1vh; }
            
            /* 🔥 TEMPO E BOLAS EMBAIXO DO PLACAR (Colado) */
            .sb-bottom-panel { background: #000; border: 3px solid #fff; border-radius: 2vh; padding: 0.5vh 2vw; display: flex; flex-direction: column; align-items: center; margin-bottom: 0; position: relative; z-index: 5; width: 55%; margin-top: 1.5vh; margin-left: auto; margin-right: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            
            .sb-winner-badge { background: #22c55e; color: white; padding: 0.5vh 1vw; border-radius: 1vh; font-size: 2vw; font-weight: 900; margin-bottom: 0.5vh; text-align: center; text-shadow: 0 2px 4px rgba(0,0,0,0.5); display: none; text-transform: uppercase; width: 100%; }
            .win-bg { background-color: #166534 !important; }

            .sb-balls-row { display: flex; gap: 1.5vw; margin-top: 0.5vh; margin-bottom: 0.5vh; }
            .sb-ball { width: 1.8vw; height: 1.8vw; border-radius: 50%; transition: 0.2s; }
            .sb-ball.empty { background: transparent; border: 1px solid rgba(255,255,255,0.4); }
            .sb-ball.fill-red { background: #ef4444; border: 1px solid #fff; }
            .sb-ball.fill-blue { background: #3b82f6; border: 1px solid #fff; }

            /* 🔥 CRONÔMETRO */
            .sb-timer { font-size: 9.5vw; font-weight: 900; color: #fff; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 4px 10px rgba(0,0,0,0.5); margin: 0; padding: 0; }
            .sb-active.sb-red .sb-timer { color: #fca5a5; }
            .sb-active.sb-blue .sb-timer { color: #93c5fd; }

            .sb-active.sb-red .sb-bottom-panel { border-color: #fca5a5; box-shadow: 0 0 20px rgba(255, 255, 255, 0.4); transform: scale(1.05); }
            .sb-active.sb-blue .sb-bottom-panel { border-color: #93c5fd; box-shadow: 0 0 20px rgba(255, 255, 255, 0.4); transform: scale(1.05); }

            /* 🔥 VIOLAÇÕES NA BASE DA TELA (3 Colunas perfeitas, sem esconder nada) */
            .sb-viol-container { width: 95%; flex: 1; display: flex; flex-direction: row; flex-wrap: wrap; align-content: flex-start; justify-content: center; gap: 0.8vw; margin-top: 2vh; margin-bottom: 1vh; overflow: hidden; padding: 0 2vw; }
            .sb-viol-item { background: rgba(0,0,0,0.6); padding: 0.8vh 0.5vw; border-radius: 0.8vh; font-size: 2.2vh; font-weight: bold; color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); width: calc(33.33% - 0.8vw); text-align: center; white-space: normal; word-wrap: break-word; letter-spacing: 0.5px; }

            /* 🔥 RODAPÉ ONDE FICA A LINHA DO TEMPO (Fica no nível do fundo, sem criar faixa preta extra) */
            .sb-footer { flex: 0 0 8vh; background: transparent; display: flex; justify-content: center; align-items: center; width: 100vw; position: relative; z-index: 20; }
            .sb-timeline { display: flex; gap: 1vw; justify-content: center; align-items: center; padding: 0 2vw; width: 100%; }
            .timeline-ball { width: 2.5vh; height: 2.5vh; border-radius: 50%; box-shadow: inset -2px -2px 5px rgba(0,0,0,0.6), 0 4px 6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.5vh; }
            .t-red { background: #ef4444; border: 1px solid #fca5a5; }
            .t-blue { background: #3b82f6; border: 1px solid #93c5fd; }
            .t-empty { background: rgba(255,255,255,0.1); border: 1px dashed rgba(255,255,255,0.3); box-shadow: none; color: transparent; }

            .sb-global-banner { position: absolute; top: 15vh; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 4px solid #fbbf24; border-radius: 2vh; padding: 2vh 4vw; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 100; display: none; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            .sb-gt-label { font-size: 2.5vh; color: #fbbf24; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 0.5vh; }
            .sb-gt-time { font-size: 6vw; font-weight: bold; color: white; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 4px 10px rgba(0,0,0,0.6); }

            .sb-report-overlay { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15,23,42,0.98); z-index: 200; display: none; flex-direction: column; justify-content: center; align-items: center; padding: 4vh; }
            .sb-report-box { background: white; padding: 4vh; border-radius: 2vh; width: 90vw; max-width: 1400px; transform: scale(1.1); box-shadow: 0 20px 60px rgba(0,0,0,0.8); color: black; }
            
            #tv-overlay-start { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.98); z-index: 7000; display: none; flex-direction: column; justify-content: center; align-items: center; }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="sb-container">
            <div id="tv-overlay-start">
                <div style="font-size: 3vw; color: #94a3b8; font-weight: bold; margin-bottom: 1vh; letter-spacing: 2px;" id="tv-start-court">QUADRA -</div>
                <div style="font-size: 6vw; color: white; font-weight: 900; text-align: center; line-height: 1.3; margin-bottom: 5vh; padding: 0 5vw; width: 100%;">
                    <div style="color:#ffffff;" id="tv-start-p1">A Definir</div>
                    <div style="color:#64748b; font-size: 4vw; margin: 3vh 0;">VS</div>
                    <div style="color:#ffffff;" id="tv-start-p2">A Definir</div>
                </div>
            </div>

            <div class="sb-global-banner" id="tv-global">
                <div class="sb-gt-label" id="tv-gt-label">AQUECIMENTO</div>
                <div class="sb-gt-time" id="tv-gt-time">02:00</div>
            </div>

            <div class="sb-report-overlay" id="tv-report">
                <div class="sb-report-box">
                    <div id="tv-report-content"></div>
                </div>
            </div>

            <div class="sb-header">
                <div class="sb-header-left">
                    <button class="sb-menu-btn" id="tv-btn-menu" title="Tela Cheia">☰</button>
                    <div class="sb-match-info" id="tv-match-info">Sincronizando...</div>
                </div>
                <div class="sb-end-indicator" id="tv-end-indicator">-</div>
                <h1 class="sb-comp-name" id="tv-comp-name">Aguardando Mesa...</h1>
            </div>
            
            <div class="sb-main">
                <div class="sb-side sb-red" id="tv-p1-side">
                    <div id="tv-p1-logo-container"></div>
                    <div class="sb-player-box">
                        <div class="sb-name" id="tv-p1-name">--</div>
                        <div class="sb-club" id="tv-p1-club">---</div>
                    </div>
                    
                    <div class="sb-score-container">
                        <div class="sb-score-box">
                            <div class="sb-score" id="tv-p1-score">0</div>
                            <div id="tv-p1-tb" style="font-size: 5vw; color: #fbbf24; font-weight: bold; margin-left: 2vw; display: none;"></div>
                            <div id="tv-p1-penalties" style="position:absolute; right:-6vw; display:flex; flex-direction:column; gap:1vh;"></div>
                        </div>
                    </div>

                    <div class="sb-bottom-panel">
                        <div id="tv-p1-winner" class="sb-winner-badge">VENCEDOR</div>
                        <div class="sb-timer" id="tv-p1-time">00:00</div>
                        <div class="sb-balls-row" id="tv-p1-balls"></div>
                    </div>
                    
                    <div class="sb-viol-container" id="tv-p1-viol"></div>
                </div>
                
                <div class="sb-side sb-blue" id="tv-p2-side">
                    <div id="tv-p2-logo-container"></div>
                    <div class="sb-player-box">
                        <div class="sb-name" id="tv-p2-name">--</div>
                        <div class="sb-club" id="tv-p2-club">---</div>
                    </div>
                    
                    <div class="sb-score-container">
                        <div class="sb-score-box">
                            <div class="sb-score" id="tv-p2-score">0</div>
                            <div id="tv-p2-tb" style="font-size: 5vw; color: #fbbf24; font-weight: bold; margin-left: 2vw; display: none;"></div>
                            <div id="tv-p2-penalties" style="position:absolute; right:-6vw; display:flex; flex-direction:column; gap:1vh;"></div>
                        </div>
                    </div>

                    <div class="sb-bottom-panel">
                        <div id="tv-p2-winner" class="sb-winner-badge">VENCEDOR</div>
                        <div class="sb-timer" id="tv-p2-time">00:00</div>
                        <div class="sb-balls-row" id="tv-p2-balls"></div>
                    </div>
                    
                    <div class="sb-viol-container" id="tv-p2-viol"></div>
                </div>
            </div>
            
            <div class="sb-footer">
                <div class="sb-timeline" id="tv-timeline"></div>
            </div>
        </div>
    `;

    document.getElementById('tv-btn-menu').onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.log(err.message));
        } else {
            document.exitFullscreen();
        }
    };

    const DOM = {
        compName: document.getElementById('tv-comp-name'),
        matchInfo: document.getElementById('tv-match-info'),
        endIndicator: document.getElementById('tv-end-indicator'),
        
        p1Side: document.getElementById('tv-p1-side'),
        p1PlayerBox: document.getElementById('tv-p1-player-box'),
        p1LogoContainer: document.getElementById('tv-p1-logo-container'),
        p1Name: document.getElementById('tv-p1-name'),
        p1Club: document.getElementById('tv-p1-club'),
        p1Score: document.getElementById('tv-p1-score'),
        p1TbScore: document.getElementById('tv-p1-tb'),
        p1Time: document.getElementById('tv-p1-time'),
        p1Balls: document.getElementById('tv-p1-balls'),
        p1Viol: document.getElementById('tv-p1-viol'),
        p1Penalties: document.getElementById('tv-p1-penalties'),
        p1Winner: document.getElementById('tv-p1-winner'),
        
        p2Side: document.getElementById('tv-p2-side'),
        p2PlayerBox: document.getElementById('tv-p2-player-box'),
        p2LogoContainer: document.getElementById('tv-p2-logo-container'),
        p2Name: document.getElementById('tv-p2-name'),
        p2Club: document.getElementById('tv-p2-club'),
        p2Score: document.getElementById('tv-p2-score'),
        p2TbScore: document.getElementById('tv-p2-tb'),
        p2Time: document.getElementById('tv-p2-time'),
        p2Balls: document.getElementById('tv-p2-balls'),
        p2Viol: document.getElementById('tv-p2-viol'),
        p2Penalties: document.getElementById('tv-p2-penalties'),
        p2Winner: document.getElementById('tv-p2-winner'),
        
        timeline: document.getElementById('tv-timeline'),
        
        globalBox: document.getElementById('tv-global'),
        gtLabel: document.getElementById('tv-gt-label'),
        gtTime: document.getElementById('tv-gt-time'),
        
        reportBox: document.getElementById('tv-report'),
        reportContent: document.getElementById('tv-report-content'),

        overlayStart: document.getElementById('tv-overlay-start'),
        startCourt: document.getElementById('tv-start-court'),
        startP1: document.getElementById('tv-start-p1'),
        startP2: document.getElementById('tv-start-p2')
    };

    const renderViolations = (viols) => {
        if (!viols || !viols.length) return '';
        return viols.map(v => {
            const displayStr = formatViolationString(v);
            return `<div class="sb-viol-item" title="${escapeHTML(v.split(' | ')[0])}">⚠️ ${escapeHTML(displayStr)}</div>`;
        }).join('');
    };

    const channel = new BroadcastChannel('bocha_live_scoreboard');
    
    channel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
            const p = event.data.payload;

            let p1Y = 0, p1R = 0;
            (p.p1Violations || []).forEach(v => {
                if(v.includes('Amarelo')) p1Y++;
                if(v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação')) p1R++;
            });
            let p1CardsHtml = '🟨'.repeat(p1Y) + '🟥'.repeat(p1R);
            if(p1CardsHtml) p1CardsHtml = `<span style="font-size:0.6em; margin-right:1vw; vertical-align: middle;">${p1CardsHtml}</span>`;

            let p2Y = 0, p2R = 0;
            (p.p2Violations || []).forEach(v => {
                if(v.includes('Amarelo')) p2Y++;
                if(v.includes('Vermelho') || v.includes('WO') || v.includes('Banimento') || v.includes('Forfeit') || v.includes('Desqualificação')) p2R++;
            });
            let p2CardsHtml = '🟨'.repeat(p2Y) + '🟥'.repeat(p2R);
            if(p2CardsHtml) p2CardsHtml = `<span style="font-size:0.6em; margin-right:1vw; vertical-align: middle;">${p2CardsHtml}</span>`;

            const p1Short = p.p1DisplayName;
            const p1NameStr = p1Short && p1Short !== 'A Definir' ? `${escapeHTML(p.p1Bib)} - ${p1Short}` : 'A Definir';
            
            const p2Short = p.p2DisplayName;
            const p2NameStr = p2Short && p2Short !== 'A Definir' ? `${escapeHTML(p.p2Bib)} - ${p2Short}` : 'A Definir';

            let p1StartLogoHtml = p.p1LogoUrl ? `<img src="${p.p1LogoUrl}" style="height:4.5vw; object-fit:contain; border-radius:0.8vh; background:white; padding:0.5vh; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">` : '';
            let p2StartLogoHtml = p.p2LogoUrl ? `<img src="${p.p2LogoUrl}" style="height:4.5vw; object-fit:contain; border-radius:0.8vh; background:white; padding:0.5vh; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">` : '';

            if (p.isStarted) {
                DOM.overlayStart.style.display = 'none';
            } else {
                DOM.overlayStart.style.display = 'flex';
                DOM.startCourt.innerText = (p.matchInfo || '').split('•')[1] || 'PREPARAÇÃO';
                
                let p1StartText = p1Short && p1Short !== 'A Definir' ? `<div style="display:flex; align-items:center; justify-content:center; gap:1.5vw; width:100%;">${p1StartLogoHtml} <span>${p1CardsHtml}${p1NameStr}</span></div><div style="font-size: 3vw; color: #94a3b8; font-weight: bold; margin-top: 1vh;">${escapeHTML(p.p1ClubFull) || '-'}</div>` : 'A Definir';
                let p2StartText = p2Short && p2Short !== 'A Definir' ? `<div style="display:flex; align-items:center; justify-content:center; gap:1.5vw; width:100%;">${p2StartLogoHtml} <span>${p2CardsHtml}${p2NameStr}</span></div><div style="font-size: 3vw; color: #94a3b8; font-weight: bold; margin-top: 1vh;">${escapeHTML(p.p2ClubFull) || '-'}</div>` : 'A Definir';
                
                DOM.startP1.innerHTML = p1StartText;
                DOM.startP2.innerHTML = p2StartText;
            }

            if (p.showReport) {
                if(DOM.reportBox && DOM.reportContent) {
                    DOM.reportContent.innerHTML = p.reportHTML;
                    DOM.reportBox.style.display = 'flex';
                }
            } else {
                if(DOM.reportBox) DOM.reportBox.style.display = 'none';
            }

            DOM.compName.innerText = p.compName || '';
            DOM.matchInfo.innerText = p.matchInfo || '';
            
            if (p.isGameOver) {
                DOM.endIndicator.innerText = "JOGO FINALIZADO";
            } else {
                let endStr = p.currentEnd || '';
                if(endStr.includes('º PARCIAL')) {
                    endStr = `END ${endStr.replace('º PARCIAL', '').trim()}`;
                }
                DOM.endIndicator.innerText = endStr;
            }

            // 🔥 A MÁGICA DA TV: NOME TOTALMENTE CENTRALIZADO E EM 1 LINHA
            DOM.p1LogoContainer.innerHTML = p.p1LogoUrl ? `<img src="${p.p1LogoUrl}" class="logo-corner-p1">` : '';
            DOM.p1Name.style.fontSize = getDynamicFontSize(p1NameStr);
            DOM.p1Name.innerHTML = `${p1CardsHtml}${p1NameStr}`;
            DOM.p1Club.innerHTML = `${escapeHTML(p.p1ClubFull || '---')} ${p.p1Rampa ? `<br><span style="font-size: 1.2vw; color: #fca5a5;">Op: ${escapeHTML(p.p1Rampa)}</span>` : ''}`;
            
            DOM.p1Score.innerText = p.p1Score == null ? '0' : p.p1Score;
            DOM.p1Time.innerText = p.p1Time || '00:00';
            
            if (p.p1TbScore > 0 || p.p2TbScore > 0 || p.partials.length > 4) {
                DOM.p1TbScore.innerText = `(${p.p1TbScore})`;
                DOM.p1TbScore.style.display = 'block';
            } else {
                DOM.p1TbScore.style.display = 'none';
            }
            
            let p1B = '';
            const p1Thrown = p.p1BallsCount || 0;
            for(let i=0; i<6; i++) {
                p1B += `<div class="sb-ball ${i < p1Thrown ? 'fill-red' : 'empty'}"></div>`;
            }
            DOM.p1Balls.innerHTML = p1B;
            DOM.p1Viol.innerHTML = renderViolations(p.p1Violations);
            
            let p1PenHtml = '';
            (p.p1Penalties || []).forEach(played => {
                p1PenHtml += `<div style="background:#eab308; color:#000; font-weight:bold; font-size:3vw; width:4vw; height:4vw; border-radius:50%; display:flex; align-items:center; justify-content:center; border: 3px solid #fff; ${played ? 'opacity:0.3' : ''}">P</div>`;
            });
            DOM.p1Penalties.innerHTML = p1PenHtml;

            // 🔥 LADO AZUL
            DOM.p2LogoContainer.innerHTML = p.p2LogoUrl ? `<img src="${p.p2LogoUrl}" class="logo-corner-p2">` : '';
            DOM.p2Name.style.fontSize = getDynamicFontSize(p2NameStr);
            DOM.p2Name.innerHTML = `${p2CardsHtml}${p2NameStr}`;
            DOM.p2Club.innerHTML = `${escapeHTML(p.p2ClubFull || '---')} ${p.p2Rampa ? `<br><span style="font-size: 1.2vw; color: #93c5fd;">Op: ${escapeHTML(p.p2Rampa)}</span>` : ''}`;
            
            DOM.p2Score.innerText = p.p2Score == null ? '0' : p.p2Score;
            DOM.p2Time.innerText = p.p2Time || '00:00';

            if (p.p1TbScore > 0 || p.p2TbScore > 0 || p.partials.length > 4) {
                DOM.p2TbScore.innerText = `(${p.p2TbScore})`;
                DOM.p2TbScore.style.display = 'block';
            } else {
                DOM.p2TbScore.style.display = 'none';
            }

            let p2B = '';
            const p2Thrown = p.p2BallsCount || 0;
            for(let i=0; i<6; i++) {
                p2B += `<div class="sb-ball ${i < p2Thrown ? 'fill-blue' : 'empty'}"></div>`;
            }
            DOM.p2Balls.innerHTML = p2B;
            DOM.p2Viol.innerHTML = renderViolations(p.p2Violations);

            let p2PenHtml = '';
            (p.p2Penalties || []).forEach(played => {
                p2PenHtml += `<div style="background:#eab308; color:#000; font-weight:bold; font-size:3vw; width:4vw; height:4vw; border-radius:50%; display:flex; align-items:center; justify-content:center; border: 3px solid #fff; ${played ? 'opacity:0.3' : ''}">P</div>`;
            });
            DOM.p2Penalties.innerHTML = p2PenHtml;

            if (p.activeTimer === 'p1') {
                DOM.p1Side.classList.add('sb-active'); DOM.p2Side.classList.remove('sb-active');
            } else if (p.activeTimer === 'p2') {
                DOM.p2Side.classList.add('sb-active'); DOM.p1Side.classList.remove('sb-active');
            } else {
                DOM.p1Side.classList.remove('sb-active'); DOM.p2Side.classList.remove('sb-active');
            }

            if (p.p1Winner) {
                DOM.p1Winner.style.display = 'block';
                DOM.p1Side.classList.add('win-bg');
            } else {
                DOM.p1Winner.style.display = 'none';
                DOM.p1Side.classList.remove('win-bg');
            }

            if (p.p2Winner) {
                DOM.p2Winner.style.display = 'block';
                DOM.p2Side.classList.add('win-bg');
            } else {
                DOM.p2Winner.style.display = 'none';
                DOM.p2Side.classList.remove('win-bg');
            }

            if (p.globalTimer) {
                DOM.globalBox.style.display = 'flex';
                DOM.gtLabel.innerText = p.globalTimer.label;
                DOM.gtTime.innerText = p.globalTimer.time;
            } else {
                DOM.globalBox.style.display = 'none';
            }

            let timelineHtml = '';
            const history = p.ballHistory || [];
            
            for (let i = 0; i < 12; i++) {
                if (i < history.length) {
                    const side = history[i];
                    const bClass = side === 'p1' ? 't-red' : 't-blue';
                    timelineHtml += `<div class="timeline-ball ${bClass}">${i+1}</div>`;
                } else {
                    timelineHtml += `<div class="timeline-ball t-empty"></div>`;
                }
            }
            DOM.timeline.innerHTML = timelineHtml;
        }
    };
}