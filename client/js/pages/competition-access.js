// client/js/pages/competition-access.js

import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderCompetitionAccess(root, hashData) {
    const hash = window.location.hash || '';
    const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const compId = idMatch ? idMatch[1] : (hashData ? hashData.id : null);

    if (!compId) {
        root.innerHTML = `<div style="padding:20px; color:red;">Erro: ID da competição ausente.</div>`;
        return;
    }

    const state = {
        pins: [],
        loading: true
    };

    async function loadData() {
        try {
            const q = query(collection(db, "operational_pins"), where("competition_id", "==", String(compId)));
            const snap = await getDocs(q);
            state.pins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            state.loading = false;
            render();
        } catch (e) {
            alert("Erro ao carregar PINs: " + e.message);
        }
    }

    async function generatePins() {
        if (!confirm("Isto irá apagar as senhas antigas e gerar novas para a Câmara de Chamada e Quadras. Continuar?")) return;
        
        document.getElementById('btn-generate').disabled = true;
        document.getElementById('btn-generate').innerText = "Gerando...";

        try {
            // Apaga PINs antigos desta competição
            for (const p of state.pins) {
                await deleteDoc(doc(db, "operational_pins", p.id));
            }

            const newPins = [];
            const generateRandomPin = () => Math.floor(10000 + Math.random() * 90000).toString(); // PIN de 5 dígitos

            // Gera PIN da Câmara
            newPins.push({ id: generateRandomPin(), type: 'CALL_ROOM', competition_id: compId, label: 'Câmara de Chamada' });

            // Busca quantas quadras tem na configuração salva da agenda
            let numCourts = 8; // Padrão
            try {
                const conf = localStorage.getItem(`wb_schedule_config_${compId}`);
                if (conf) numCourts = JSON.parse(conf).courts || 8;
            } catch(e){}

            // Gera PINs para as Mesas
            for (let i = 1; i <= numCourts; i++) {
                newPins.push({ id: generateRandomPin(), type: 'COURT', court: i, competition_id: compId, label: `Mesa - Quadra ${i}` });
            }

            // Salva no Firebase
            for (const p of newPins) {
                await setDoc(doc(db, "operational_pins", p.id), p);
            }

            await loadData();
        } catch(e) {
            alert("Erro ao gerar: " + e.message);
        }
    }

    function render() {
        if (state.loading) {
            root.innerHTML = `<div style="padding: 40px; text-align: center;">Carregando Acessos...</div>`;
            return;
        }

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 16px;">
                <thead>
                    <tr style="background: #f1f5f9; text-align: left;">
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Local / Função</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: center;">PIN de Acesso</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1;">Link Direto (Tablet)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (state.pins.length === 0) {
            tableHtml += `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #64748b;">Nenhum acesso gerado. Clique no botão acima para criar.</td></tr>`;
        } else {
            // Ordena: Câmara primeiro, depois as quadras em ordem
            state.pins.sort((a, b) => {
                if (a.type === 'CALL_ROOM') return -1;
                if (b.type === 'CALL_ROOM') return 1;
                return (a.court || 0) - (b.court || 0);
            }).forEach(p => {
                const link = `${window.location.origin}${window.location.pathname}#/oper-login?pin=${p.id}`;
                tableHtml += `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; font-weight: bold;">${p.label}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; font-size: 24px; font-weight: 900; color: #dc2626; letter-spacing: 2px;">${p.id}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; font-size: 12px;">
                            <a href="${link}" target="_blank" style="color: #2563eb;">Acessar Tablet</a>
                        </td>
                    </tr>
                `;
            });
        }
        tableHtml += `</tbody></table>`;

        root.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
                    <div>
                        <h1 style="margin: 0; font-size: 24px; color: #0f172a;">Acessos Operacionais (Tablets)</h1>
                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Gere as senhas temporárias para a equipe de Mesários e Câmara de Chamada.</p>
                    </div>
                    <button class="btn-outline" onclick="window.history.back()" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-weight: bold;">← Voltar</button>
                </div>

                <div style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #475569;">Lista de Senhas Ativas</span>
                        <button id="btn-generate" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            🔄 Gerar / Resetar PINs
                        </button>
                    </div>
                    
                    ${tableHtml}
                    
                    <div style="margin-top: 20px; font-size: 12px; color: #64748b; background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px dashed #cbd5e1;">
                        <strong>Instruções:</strong> Entregue o PIN de 5 dígitos para o mesário ou responsável. Eles devem acessar a página inicial do sistema e clicar em "Acesso Operacional", ou você pode clicar em "Acessar Tablet" e abrir a tela diretamente no aparelho deles.
                    </div>
                </div>
            </div>
        `;

        const btnGen = document.getElementById('btn-generate');
        if (btnGen) btnGen.addEventListener('click', generatePins);
    }

    loadData();
}