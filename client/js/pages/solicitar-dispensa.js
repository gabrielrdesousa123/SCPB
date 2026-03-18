// client/js/pages/solicitar-dispensa.js

import { db } from '../firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, getDocs, getDoc, doc, updateDoc, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

async function loadHtml2Pdf() {
    if (window.html2pdf) return;
    return new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = resolve;
        document.head.appendChild(s);
    });
}

export async function renderSolicitarDispensa(root) {
    root.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:50vh; flex-direction:column;">
            <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="margin-top:15px; color:#64748b; font-family:sans-serif;">Buscando suas convocações e ofícios...</p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;
    
    const auth = getAuth();
    
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            root.innerHTML = `<div style="padding:40px; text-align:center; color: #ef4444; font-weight:bold;">Erro: Você precisa estar logado para solicitar dispensa.</div>`;
            return;
        }

        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            let userData = userDocSnap.exists() ? userDocSnap.data() : {};

            // VERIFICAÇÃO DE PERFIL
            const isProfileComplete = userData.rg && userData.cpf && userData.genero && (userData.nome || userData.nome_completo);

            if (!isProfileComplete) {
                renderProfileForm(root, user.uid, userData);
            } else {
                // BUSCA O HISTÓRICO DE DISPENSAS DO USUÁRIO E O MODELO HTML DO PDF
                const q = query(collection(db, "exemption_requests"), where("user_id", "==", user.uid));
                const reqSnap = await getDocs(q);
                let userRequests = [];
                reqSnap.forEach(d => userRequests.push({ id: d.id, ...d.data() }));
                
                // Ordena da mais recente para a mais antiga
                userRequests.sort((a, b) => (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0));

                const configSnap = await getDoc(doc(db, "settings", "pdf_template_html"));
                const pdfTemplate = configSnap.exists() ? configSnap.data().html : null;

                await renderRequestForm(root, user.uid, userData, userRequests, pdfTemplate);
            }

        } catch (error) {
            root.innerHTML = `<div style="padding:40px; text-align:center; color: #ef4444; font-weight:bold;">Erro ao carregar dados: ${error.message}</div>`;
        }
    });
}

// TELA 1: FORMULÁRIO DE PERFIL
function renderProfileForm(root, userId, userData) {
    const styles = `
        <style>
            .dispensa-wrapper { display: flex; justify-content: center; align-items: flex-start; min-height: 100%; padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; }
            .dispensa-card { background: #ffffff; width: 100%; max-width: 550px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); padding: 40px; color: #1e293b; border-top: 5px solid #2563eb; }
            .dispensa-header { text-align: center; margin-bottom: 30px; }
            .dispensa-header h2 { margin: 0 0 10px 0; color: #0f172a; font-size: 26px; font-weight: 900; }
            .dispensa-header p { margin: 0; color: #64748b; font-size: 15px; line-height: 1.5; }
            .form-group { margin-bottom: 24px; text-align: left; }
            .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: #475569; font-size: 14px; }
            .form-input { width: 100%; padding: 14px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-size: 15px; box-sizing: border-box; transition: all 0.2s ease; }
            .form-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2); background: #ffffff; }
            .btn-submit { width: 100%; padding: 16px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 800; cursor: pointer; transition: background 0.2s ease; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
            .btn-submit:hover { background: #1d4ed8; }
            .btn-submit:disabled { background: #94a3b8; cursor: not-allowed; }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="dispensa-wrapper">
            <div class="dispensa-card">
                <div class="dispensa-header">
                    <h2>Completar Cadastro</h2>
                    <p>Para gerarmos seu ofício de dispensa, precisamos dos seus dados de identificação completos.</p>
                </div>
                <div class="form-group">
                    <label>Nome Completo (Idêntico ao cadastro de Oficial)</label>
                    <input type="text" id="prof-nome" class="form-input" value="${userData.nome_completo || userData.nome || userData.name || ''}" autocomplete="name">
                </div>
                <div class="form-group"><label>Registro Geral (RG)</label><input type="text" id="prof-rg" class="form-input" value="${userData.rg || ''}"></div>
                <div class="form-group"><label>Cadastro de Pessoa Física (CPF)</label><input type="text" id="prof-cpf" class="form-input" value="${userData.cpf || ''}"></div>
                <div class="form-group">
                    <label>Gênero (Para flexão no documento)</label>
                    <select id="prof-genero" class="form-input">
                        <option value="">-- Selecione uma opção --</option>
                        <option value="M" ${userData.genero === 'M' ? 'selected' : ''}>Masculino (Será escrito "O Convocado")</option>
                        <option value="F" ${userData.genero === 'F' ? 'selected' : ''}>Feminino (Será escrito "A Convocada")</option>
                    </select>
                </div>
                <button id="btn-save-profile" class="btn-submit">Salvar e Continuar</button>
            </div>
        </div>
    `;

    document.getElementById('btn-save-profile').onclick = async () => {
        const nome = document.getElementById('prof-nome').value.trim();
        const rg = document.getElementById('prof-rg').value.trim();
        const cpf = document.getElementById('prof-cpf').value.trim();
        const genero = document.getElementById('prof-genero').value;

        if(!nome || !rg || !cpf || !genero) return alert("Por favor, preencha todos os campos obrigatórios.");
        
        const btn = document.getElementById('btn-save-profile');
        btn.disabled = true; btn.innerText = "Salvando...";

        try {
            await updateDoc(doc(db, "users", userId), { nome_completo: nome, nome: nome, rg, cpf, genero });
            window.__toast?.("Cadastro atualizado!", "success");
            renderSolicitarDispensa(root); 
        } catch (e) {
            alert("Erro ao salvar: " + e.message);
            btn.disabled = false; btn.innerText = "Salvar e Continuar";
        }
    };
}

// TELA 2: FORMULÁRIO DE SELEÇÃO DA COMPETIÇÃO E INSTITUIÇÕES E HISTÓRICO
async function renderRequestForm(root, userId, userData, userRequests, pdfTemplate) {
    const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
    };

    const userNameFull = normalizeStr(userData.nome_completo || userData.nome || userData.name);

    // EXTRAI AS INSTITUIÇÕES ÚNICAS JÁ USADAS NO HISTÓRICO DESTE ÁRBITRO
    const savedInstitutions = [];
    const seenInstNames = new Set();
    userRequests.forEach(req => {
        const emp = req.snapshot_employer;
        if (emp && emp.nome_local && emp.nome_local.trim() !== '') {
            const normalizedName = emp.nome_local.trim().toLowerCase();
            if (!seenInstNames.has(normalizedName)) {
                seenInstNames.add(normalizedName);
                savedInstitutions.push({
                    local: emp.nome_local,
                    resp: emp.nome_responsavel || '',
                    cargo: emp.cargo_responsavel || ''
                });
            }
        }
    });

    let savedInstOptionsHtml = '';
    if (savedInstitutions.length > 0) {
        savedInstOptionsHtml = `<option value="">-- Selecione uma Instituição Salva --</option>`;
        savedInstitutions.forEach((inst, idx) => {
            savedInstOptionsHtml += `<option value="${idx}">${escapeHTML(inst.local)}</option>`;
        });
    }

    // BUSCA OFICIAIS NAS COMPETIÇÕES PARA MONTAR O DROPDOWN DE COMPETIÇÕES
    const offSnap = await getDocs(collection(db, "competition_officials"));
    const userRolesByComp = {}; 

    offSnap.forEach(docSnap => {
        const data = docSnap.data();
        const compId = data.competition_id || data.competitionId || docSnap.id;

        if (data.officials && Array.isArray(data.officials)) {
            data.officials.forEach(off => {
                const offName = normalizeStr(off.nome_completo || off.nome || off.nome_abreviado);
                if (userNameFull !== '' && offName === userNameFull) {
                    const role = off.role || off.funcao || 'Árbitro';
                    if(!userRolesByComp[compId]) userRolesByComp[compId] = new Set();
                    userRolesByComp[compId].add(role);
                }
            });
        } else {
            Object.values(data).forEach(off => {
                if (typeof off === 'object' && off !== null) {
                    const offName = normalizeStr(off.nome_completo || off.nome || off.nome_abreviado);
                    if (userNameFull !== '' && offName === userNameFull) {
                        const role = off.role || off.funcao || 'Árbitro';
                        const fallbackCompId = off.competition_id || compId;
                        if(!userRolesByComp[fallbackCompId]) userRolesByComp[fallbackCompId] = new Set();
                        userRolesByComp[fallbackCompId].add(role);
                    }
                }
            });
        }
    });

    const compsSnap = await getDocs(collection(db, "competitions"));
    let compsOptions = '<option value="">-- Selecione a Competição --</option>';
    let hasValidComps = false;
    
    compsSnap.forEach(d => {
        const c = d.data();
        const compId = d.id;

        if (!userRolesByComp[compId]) return;

        const rolesForThisComp = Array.from(userRolesByComp[compId]).join(',');
        compsOptions += `<option value="${compId}" data-nome="${c.nome || c.name || 'Competição'}" data-inicio="${c.data_inicio || ''}" data-fim="${c.data_fim || ''}" data-roles="${rolesForThisComp}">${c.nome || c.name || 'Competição Sem Nome'}</option>`;
        hasValidComps = true;
    });

    if (!hasValidComps) {
        compsOptions = '<option value="">Nenhuma convocação encontrada para você.</option>';
    }

    let employerCount = 1;

    // MONTA O HISTÓRICO DE OFÍCIOS
    let historyHtml = '';
    if (userRequests.length === 0) {
        historyHtml = `<p style="color:#64748b; font-size:14px; text-align:center;">Você ainda não solicitou nenhum ofício.</p>`;
    } else {
        historyHtml = userRequests.map(r => {
            const isApp = r.status === 'APPROVED';
            const statusLabel = isApp ? '<span style="color:#10b981; font-weight:bold;">✅ Aprovado</span>' : '<span style="color:#f59e0b; font-weight:bold;">⏳ Em Análise</span>';
            const btnHtml = isApp ? `<button class="btn-download" data-id="${r.id}">📥 Baixar Ofício</button>` : `<button class="btn-download" disabled style="background:#e2e8f0; color:#94a3b8; cursor:not-allowed;">Baixar Ofício</button>`;
            
            return `
                <div class="history-item">
                    <div style="flex: 1;">
                        <div style="font-weight:bold; color:#0f172a; font-size: 15px;">${escapeHTML(r.snapshot_event?.nome_campeonato || 'Competição')}</div>
                        <div style="font-size:12px; color:#475569; margin-top:4px;"><strong>Função:</strong> ${escapeHTML(r.role_in_event)}</div>
                        <div style="font-size:12px; color:#475569;"><strong>Destino:</strong> ${escapeHTML(r.snapshot_employer?.nome_local || 'A Instituição')}</div>
                        <div style="font-size:13px; margin-top:6px;">Status: ${statusLabel}</div>
                    </div>
                    <div>
                        ${btnHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // GERA O BLOCO HTML DA INSTITUIÇÃO
    const generateEmployerBlockHtml = (idNum) => {
        return `
            ${idNum > 1 ? `<button class="btn-remove" onclick="this.parentElement.remove()">Remover</button>` : ''}
            <h4 class="employer-title">Instituição de Ensino / Trabalho ${idNum}</h4>
            
            ${savedInstOptionsHtml ? `
            <div class="form-group" style="background:#f1f5f9; padding:15px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:20px;">
                <label style="color:#2563eb;">⚡ Preencher rapidamente com instituição salva:</label>
                <select class="form-input saved-inst-select" style="border-color:#93c5fd;">
                    ${savedInstOptionsHtml}
                </select>
            </div>
            ` : ''}

            <div class="form-group">
                <label>Nome do Local (Ex: Colégio Estadual do Paraná)</label>
                <input type="text" class="form-input emp-local" placeholder="Deixe em branco se não aplicável">
            </div>
            <div class="form-group" style="display:flex; gap:15px; flex-wrap: wrap;">
                <div style="flex:1; min-width: 200px;"><label>Responsável por receber</label><input type="text" class="form-input emp-resp" placeholder="Nome do Diretor/Chefe"></div>
                <div style="flex:1; min-width: 200px;"><label>Cargo do Responsável</label><input type="text" class="form-input emp-cargo" placeholder="Ex: Diretor Geral"></div>
            </div>
        `;
    };

    const styles = `
        <style>
            .dispensa-wrapper { display: flex; flex-direction: column; align-items: center; min-height: 100%; padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
            .dispensa-card { background: #ffffff; width: 100%; max-width: 800px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 40px; color: #1e293b; border-top: 5px solid #2563eb; margin-bottom: 30px; }
            .history-card { background: #ffffff; width: 100%; max-width: 800px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 0; color: #1e293b; border-top: 5px solid #10b981; margin-bottom: 30px; overflow: hidden; }
            
            .dispensa-header { text-align: center; margin-bottom: 30px; }
            .dispensa-header h2 { margin: 0 0 5px 0; color: #0f172a; font-size: 24px; font-weight: 900; text-transform: uppercase; }
            .dispensa-header p { margin: 0; color: #64748b; font-size: 15px; }
            .dispensa-header strong { color: #2563eb; }
            
            .form-group { margin-bottom: 20px; text-align: left; }
            .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: #475569; font-size: 14px; }
            .form-input { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-size: 15px; box-sizing: border-box; transition: all 0.2s ease; }
            .form-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2); background: #ffffff; }
            .form-input:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
            
            .employer-block { background: #f8fafc; padding: 25px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; position: relative; }
            .employer-title { margin-top: 0; color: #2563eb; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 20px; font-weight: bold; }
            
            .btn-action { padding: 14px 20px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; text-align: center; }
            .btn-add { background: #ffffff; color: #2563eb; border: 2px dashed #93c5fd; width: 100%; margin-bottom: 25px; }
            .btn-add:hover { background: #eff6ff; border-color: #2563eb; }
            .btn-submit { background: #2563eb; color: white; width: 100%; font-size: 18px; padding: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2); }
            .btn-submit:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-2px); }
            .btn-submit:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; transform: none; }
            .btn-remove { position: absolute; top: 15px; right: 15px; background: #fee2e2; border: 1px solid #fca5a5; color: #ef4444; border-radius: 6px; padding: 4px 10px; font-size: 14px; cursor: pointer; font-weight:bold; }
            .btn-remove:hover { background: #fecaca; }

            .history-item { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; padding: 15px 20px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
            .history-item:hover { background: #f1f5f9; }
            .btn-download { background: #10b981; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2); }
            .btn-download:hover:not(:disabled) { background: #059669; }
            
            .alert-box { background: #fef9c3; border: 1px solid #fef08a; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
            .alert-box p { margin: 0; color: #854d0e; font-size: 14px; line-height: 1.5; }

            .toggle-history-btn { display: flex; justify-content: space-between; align-items: center; padding: 25px 40px; cursor: pointer; background: #fff; transition: background 0.2s; }
            .toggle-history-btn:hover { background: #f8fafc; }
            .history-content { display: none; padding: 0 40px 30px 40px; border-top: 1px solid #e2e8f0; }
            .history-content.show { display: block; animation: fadeIn 0.3s ease; }
            .chevron { font-size: 20px; color: #10b981; transition: transform 0.3s ease; }
            .chevron.open { transform: rotate(180deg); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="dispensa-wrapper">
            
            <div class="history-card">
                <div class="toggle-history-btn" id="btn-toggle-history">
                    <div style="text-align: left;">
                        <h2 style="color: #10b981; margin: 0; font-size: 22px; font-weight: 900;">📋 Meus Ofícios (${userRequests.length})</h2>
                        <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">Clique aqui para expandir e baixar as suas dispensas aprovadas.</p>
                    </div>
                    <div class="chevron" id="history-chevron">▼</div>
                </div>
                <div class="history-content" id="history-content-area">
                    <div style="margin-top: 25px;">${historyHtml}</div>
                </div>
            </div>

            <div class="dispensa-card">
                <div class="dispensa-header">
                    <h2>Nova Solicitação de Dispensa</h2>
                    <p>Árbitro: <strong>${userData.nome_completo || userData.nome || userData.name || ''}</strong></p>
                </div>

                <div class="form-group">
                    <label>1. Para qual campeonato você foi convocado?</label>
                    <select id="req-comp" class="form-input" ${!hasValidComps ? 'disabled' : ''}>${compsOptions}</select>
                </div>

                <div class="form-group">
                    <label>2. Qual sua função neste evento?</label>
                    <select id="req-role" class="form-input" disabled>
                        <option value="">-- Selecione a Competição Acima --</option>
                    </select>
                </div>

                <div class="alert-box">
                    <p><strong>Aviso:</strong> Você pode deixar os campos de Instituição em branco se não souber o nome do Diretor ou da Escola. Neste caso, o ofício será gerado genérico para <strong>"À Instituição"</strong>.</p>
                </div>

                <div id="employers-wrapper">
                    <div class="employer-block" id="emp-block-1">
                        ${generateEmployerBlockHtml(1)}
                    </div>
                </div>

                <button id="btn-add-emp" class="btn-action btn-add">➕ Adicionar outra instituição</button>
                <button id="btn-submit-req" class="btn-action btn-submit" disabled>Enviar Solicitação</button>
            </div>
            
            <div id="temp-render-box" style="position: absolute; left: -9999px; top: -9999px;"></div>
        </div>
    `;

    function escapeHTML(s = '') {
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // LÓGICA DO ACCORDION DO HISTÓRICO
    document.getElementById('btn-toggle-history').onclick = () => {
        const content = document.getElementById('history-content-area');
        const chevron = document.getElementById('history-chevron');
        content.classList.toggle('show');
        chevron.classList.toggle('open');
    };

    // LÓGICA PARA AUTO-PREENCHER INSTITUIÇÕES SALVAS (EVENT DELEGATION NO WRAPPER)
    document.getElementById('employers-wrapper').addEventListener('change', (e) => {
        if (e.target.classList.contains('saved-inst-select')) {
            const val = e.target.value;
            const block = e.target.closest('.employer-block');
            if (val !== "") {
                const inst = savedInstitutions[val];
                block.querySelector('.emp-local').value = inst.local;
                block.querySelector('.emp-resp').value = inst.resp;
                block.querySelector('.emp-cargo').value = inst.cargo;
            } else {
                block.querySelector('.emp-local').value = '';
                block.querySelector('.emp-resp').value = '';
                block.querySelector('.emp-cargo').value = '';
            }
        }
    });

    // LÓGICA DE DOWNLOAD DO PDF APROVADO
    document.querySelectorAll('.btn-download').forEach(btn => {
        btn.onclick = async () => {
            const reqId = btn.dataset.id;
            const req = userRequests.find(r => r.id === reqId);
            if(!req) return;

            if(!pdfTemplate) {
                return alert("Erro: O modelo do PDF ainda não foi configurado pelos administradores do sistema.");
            }
            
            btn.disabled = true;
            btn.innerText = "A Processar...";
            await downloadPdf(req, pdfTemplate, userData);
            btn.disabled = false;
            btn.innerText = "📥 Baixar Ofício";
        };
    });

    async function downloadPdf(req, template, uData) {
        await loadHtml2Pdf();
        let e = req.snapshot_event || {};
        const emp = req.snapshot_employer || {};
        
        try {
            if(req.competition_id) {
                const compDoc = await getDoc(doc(db, "competitions", req.competition_id));
                if(compDoc.exists()) {
                    const c = compDoc.data();
                    e.local = c.local || c.cidade || e.local; 
                    e.nome_campeonato = c.nome || c.name || e.nome_campeonato;
                    e.data_inicio = c.data_inicio || c.start_date || e.data_inicio;
                    e.data_fim = c.data_fim || c.end_date || e.data_fim;
                }
            }
        } catch(err) { console.warn(err); }

        const isM = uData.genero === 'M';
        const formataData = (d) => {
            if(!d) return '';
            const parts = d.split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
        };

        const dataMap = {
            "{{Datahoje}}": new Date().toLocaleDateString('pt-BR'),
            "{{instituição}}": emp.nome_local || '', 
            "{{responsável}}": emp.nome_responsavel ? `A/C: ${emp.nome_responsavel}` : '',
            "{{pron_sr}}": isM ? "do Sr." : "da Sra.",
            "{{Nome}}": uData.nome || uData.nome_completo || '',
            "{{pron_registrado}}": isM ? "registrado" : "registrada",
            "{{CPF}}": uData.cpf || '',
            "{{pron_portador}}": isM ? "portador" : "portadora",
            "{{RG}}": uData.rg || '',
            "{{ÁRBITRO}}": (e.funcao || req.role_in_event || '').toUpperCase(),
            "{{COMPETIÇÃO}}": (e.nome_campeonato || '').toUpperCase(),
            "{{LOCAL}}": e.local || 'A definir',
            "{{Período1}}": formataData(e.data_inicio),
            "{{Período2}}": formataData(e.data_fim)
        };

        let finalHtml = template;
        Object.keys(dataMap).forEach(tag => finalHtml = finalHtml.split(tag).join(dataMap[tag]));

        const element = document.createElement('div');
        element.innerHTML = finalHtml;
        element.style.width = '800px'; 
        element.style.backgroundColor = '#ffffff';

        const funcaoName = (e.funcao || req.role_in_event || 'Funcao');
        const pessoaName = (uData.nome || uData.nome_completo || 'Arbitro').split(' ')[0];
        const compName = (e.nome_campeonato || 'Competicao');
        const pdfFileName = `${funcaoName}_${pessoaName}_${compName}.pdf`.replace(/[\/\\]/g, '-');

        const opt = {
            margin: 0, 
            filename: pdfFileName,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            await html2pdf().set(opt).from(element).save();
            window.__toast?.("Download concluído!", "success");
        } catch(err) {
            alert("Houve um erro ao processar o documento. Tente novamente.");
        }
    }

    // LÓGICA DO FORMULÁRIO DE NOVA SOLICITAÇÃO
    document.getElementById('req-comp').addEventListener('change', (e) => {
        const selectedOpt = e.target.options[e.target.selectedIndex];
        const rolesStr = selectedOpt.getAttribute('data-roles');
        const roleSelect = document.getElementById('req-role');
        const btnSubmit = document.getElementById('btn-submit-req');

        if (!e.target.value) {
            roleSelect.innerHTML = '<option value="">-- Selecione a Competição Acima --</option>';
            roleSelect.disabled = true;
            btnSubmit.disabled = true;
            return;
        }

        const rolesArray = rolesStr.split(',');
        roleSelect.innerHTML = rolesArray.map(r => `<option value="${r}">${r}</option>`).join('');
        roleSelect.disabled = false;
        btnSubmit.disabled = false;
    });

    document.getElementById('btn-add-emp').onclick = () => {
        employerCount++;
        const wrapper = document.getElementById('employers-wrapper');
        const newBlock = document.createElement('div');
        newBlock.className = 'employer-block';
        newBlock.id = `emp-block-${employerCount}`;
        newBlock.innerHTML = generateEmployerBlockHtml(employerCount);
        wrapper.appendChild(newBlock);
    };

    document.getElementById('btn-submit-req').onclick = async () => {
        const compSelect = document.getElementById('req-comp');
        if(!compSelect.value) return alert("Selecione o campeonato.");
        
        const role = document.getElementById('req-role').value;
        const compName = compSelect.options[compSelect.selectedIndex].getAttribute('data-nome');
        const compStart = compSelect.options[compSelect.selectedIndex].getAttribute('data-inicio');
        const compEnd = compSelect.options[compSelect.selectedIndex].getAttribute('data-fim');

        const blocks = document.querySelectorAll('.employer-block');
        let requestsToSave = [];

        blocks.forEach(block => {
            const local = block.querySelector('.emp-local').value.trim();
            const resp = block.querySelector('.emp-resp').value.trim();
            const cargo = block.querySelector('.emp-cargo').value.trim();
            
            requestsToSave.push({
                user_id: userId,
                competition_id: compSelect.value,
                status: 'PENDING',
                role_in_event: role,
                created_at: serverTimestamp(),
                pdf_url: null,
                snapshot_user: {
                    nome: userData.nome_completo || userData.nome || userData.name || '',
                    rg: userData.rg,
                    cpf: userData.cpf,
                    genero: userData.genero
                },
                snapshot_employer: {
                    nome_local: local,
                    nome_responsavel: resp,
                    cargo_responsavel: cargo
                },
                snapshot_event: {
                    nome_campeonato: compName,
                    local: "A definir",
                    data_inicio: compStart,
                    data_fim: compEnd,
                    funcao: role
                }
            });
        });

        const btn = document.getElementById('btn-submit-req');
        btn.disabled = true; btn.innerText = "Enviando, aguarde...";

        try {
            for(let req of requestsToSave) {
                await addDoc(collection(db, "exemption_requests"), req);
            }

            window.__toast?.("Solicitação enviada com sucesso!", "success");
            renderSolicitarDispensa(root);

        } catch (e) {
            alert("Erro ao enviar: " + e.message);
            btn.disabled = false; btn.innerText = "Enviar Solicitação";
        }
    };
}