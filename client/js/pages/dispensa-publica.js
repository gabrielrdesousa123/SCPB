// client/js/pages/dispensa-publica.js

import { db } from '../firebase-config.js';
import { collection, addDoc, getDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderDispensaPublica(root) {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const compId = urlParams.get('comp');

    if (!compId) {
        root.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444; font-family: sans-serif;"><h3>⚠️ Erro no Link</h3><p>O link acessado é inválido. Solicite um novo link à organização.</p></div>`;
        return;
    }

    root.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:50vh; flex-direction:column;">
            <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="margin-top:15px; color:#64748b; font-family:sans-serif;">A carregar dados do evento...</p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;

    try {
        const compDoc = await getDoc(doc(db, "competitions", compId));
        if (!compDoc.exists()) throw new Error("Evento não encontrado.");
        
        const c = compDoc.data();

        if (c.is_dispensa_open === false) {
            root.innerHTML = `
                <div style="display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f8fafc; padding:20px; font-family:sans-serif;">
                    <div style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.08); text-align:center; max-width:500px; border-top:5px solid #ef4444;">
                        <h2 style="color:#0f172a; margin-top:0;">🛑 Solicitações Encerradas</h2>
                        <p style="color:#64748b; font-size:16px;">O prazo para solicitação de ofícios de dispensa para este evento foi encerrado pela organização.</p>
                    </div>
                </div>
            `;
            return;
        }

        const eventData = {
            id: compId,
            nome: c.nome || c.name || 'Competição',
            local: c.local || c.cidade || 'A definir',
            inicio: c.data_inicio || c.start_date || '',
            fim: c.data_fim || c.end_date || ''
        };

        renderPublicForm(root, eventData);

    } catch (e) {
        root.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444; font-family: sans-serif;"><h3>⚠️ Erro</h3><p>${e.message}</p></div>`;
    }
}

function renderPublicForm(root, eventData) {
    // MESMA LISTA DO PAINEL PARA MANTER A CONSISTÊNCIA
    const roles = [
        'Delegado Técnico', 'Assistente Delegado Técnico', 'Árbitro Chefe', 
        'Assistente Árbitro Chefe', 'Árbitro', 'Câmara de Chamada', 
        'Árbitro de Quadra', 'Cursista', 'Staff / Organização'
    ];

    const styles = `
        <style>
            .public-wrapper { display: flex; justify-content: center; padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; min-height: 100vh; }
            .public-card { background: #ffffff; width: 100%; max-width: 600px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); padding: 40px; border-top: 5px solid #10b981; }
            .public-header { text-align: center; margin-bottom: 30px; }
            .public-header h2 { margin: 0 0 10px 0; color: #0f172a; font-size: 24px; font-weight: 900; }
            .public-header p { margin: 0; color: #64748b; font-size: 15px; }
            .form-group { margin-bottom: 20px; text-align: left; }
            .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: #475569; font-size: 13px; text-transform: uppercase; }
            .form-input { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-size: 15px; box-sizing: border-box; }
            .form-input:focus { outline: none; border-color: #10b981; background: #ffffff; }
            .row-flex { display: flex; gap: 15px; flex-wrap: wrap; }
            .row-flex .form-group { flex: 1; min-width: 200px; }
            .btn-submit { width: 100%; padding: 16px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 800; cursor: pointer; margin-top: 20px; transition: 0.2s; }
            .btn-submit:hover { background: #059669; }
            .success-msg { text-align: center; padding: 40px 20px; }
            .success-msg h3 { color: #10b981; font-size: 24px; margin-bottom: 10px; }
            .success-msg p { color: #475569; font-size: 16px; }
            .alert-box { background: #fef9c3; border: 1px solid #fef08a; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
            .alert-box p { margin: 0; color: #854d0e; font-size: 14px; line-height: 1.5; }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="public-wrapper">
            <div class="public-card" id="form-container">
                <div class="public-header">
                    <h2>Solicitação de Dispensa (Árbitro)</h2>
                    <p>Evento: <strong>${eventData.nome}</strong></p>
                </div>
                
                <div class="form-group"><label>Nome Completo</label><input type="text" id="pub-nome" class="form-input" placeholder="Seu nome completo idêntico ao RG"></div>
                <div class="row-flex">
                    <div class="form-group">
                        <label>Gênero</label>
                        <select id="pub-genero" class="form-input">
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Sua Função no Evento</label>
                        <select id="pub-funcao" class="form-input">
                            <option value="">-- Selecione na lista --</option>
                            ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="row-flex">
                    <div class="form-group"><label>RG</label><input type="text" id="pub-rg" class="form-input" placeholder="Apenas números"></div>
                    <div class="form-group"><label>CPF</label><input type="text" id="pub-cpf" class="form-input" placeholder="Apenas números"></div>
                </div>
                
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;">
                <h4 style="color: #0f172a; margin-top: 0; margin-bottom: 15px;">Dados da Instituição (Destino da Dispensa)</h4>
                
                <div class="alert-box">
                    <p><strong>Aviso:</strong> Você pode deixar os campos abaixo em branco se não souber o nome do Diretor ou da Instituição. Neste caso, o ofício será gerado genérico para <strong>"À Instituição"</strong>.</p>
                </div>
                
                <div class="form-group"><label>Nome do Local / Instituição</label><input type="text" id="pub-inst" class="form-input" placeholder="Ex: Colégio Estadual do Paraná"></div>
                <div class="row-flex">
                    <div class="form-group"><label>A/C (Nome do Responsável)</label><input type="text" id="pub-resp" class="form-input" placeholder="Nome do Diretor/Chefe"></div>
                    <div class="form-group"><label>Cargo do Responsável</label><input type="text" id="pub-cargo" class="form-input" placeholder="Ex: Diretor Geral"></div>
                </div>

                <button id="btn-submit-public" class="btn-submit">Enviar Solicitação</button>
            </div>
        </div>
    `;

    document.getElementById('btn-submit-public').onclick = async () => {
        const nome = document.getElementById('pub-nome').value.trim();
        const genero = document.getElementById('pub-genero').value;
        const funcao = document.getElementById('pub-funcao').value; // Pega do Dropdown agora
        const rg = document.getElementById('pub-rg').value.trim();
        const cpf = document.getElementById('pub-cpf').value.trim();
        
        const inst = document.getElementById('pub-inst').value.trim();
        const resp = document.getElementById('pub-resp').value.trim();
        const cargo = document.getElementById('pub-cargo').value.trim();

        if (!nome || !rg || !cpf || !funcao) {
            return alert("Por favor, preencha os seus dados pessoais (Nome, Função, RG e CPF).");
        }

        const btn = document.getElementById('btn-submit-public');
        btn.disabled = true; btn.innerText = "A enviar...";

        const payload = {
            user_id: 'public_form',
            competition_id: eventData.id,
            status: 'PENDING',
            role_in_event: funcao,
            created_at: serverTimestamp(),
            pdf_url: null,
            snapshot_user: { nome, rg, cpf, genero },
            snapshot_employer: { nome_local: inst, nome_responsavel: resp, cargo_responsavel: cargo },
            snapshot_event: { nome_campeonato: eventData.nome, local: eventData.local, data_inicio: eventData.inicio, data_fim: eventData.fim, funcao }
        };

        try {
            await addDoc(collection(db, "exemption_requests"), payload);
            document.getElementById('form-container').innerHTML = `
                <div class="success-msg">
                    <h3>✅ Solicitação Enviada!</h3>
                    <p>Seus dados foram enviados para a organização do evento. O seu ofício de dispensa será gerado e enviado em breve.</p>
                </div>
            `;
        } catch (e) {
            alert("Erro ao enviar. Verifique sua conexão e tente novamente.");
            btn.disabled = false; btn.innerText = "Enviar Solicitação";
        }
    };
}