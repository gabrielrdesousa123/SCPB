// client/js/pages/oper-login.js

import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderOperLogin(root) {
    document.body.style.backgroundColor = '#0f172a';
    root.style.padding = '0';
    
    // Verifica se a URL já veio com o PIN preenchido (Link Direto)
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const urlPin = params.get('pin') || '';

    const styles = `
        <style>
            .oper-container { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; color: white; }
            .oper-box { background: white; color: #0f172a; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 400px; }
            .pin-input { width: 100%; font-size: 40px; text-align: center; font-weight: 900; letter-spacing: 10px; padding: 15px; margin: 20px 0; border: 3px solid #cbd5e1; border-radius: 8px; outline: none; transition: border-color 0.3s; }
            .pin-input:focus { border-color: #3b82f6; }
            .btn-login { background: #3b82f6; color: white; border: none; width: 100%; padding: 15px; font-size: 20px; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
            .btn-login:hover { background: #2563eb; }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="oper-container">
            <div class="oper-box">
                <h1 style="margin: 0 0 10px 0; font-size: 28px;">Acesso de Voluntário</h1>
                <p style="color: #64748b; margin: 0 0 20px 0;">Digite o PIN de 5 dígitos fornecido pela organização.</p>
                
                <input type="text" id="pin-input" class="pin-input" maxlength="5" placeholder="00000" autocomplete="off" value="${urlPin}">
                <div id="error-msg" style="color: #dc2626; font-weight: bold; margin-bottom: 15px; min-height: 20px;"></div>
                
                <button id="btn-login" class="btn-login">ACESSAR SISTEMA</button>
                <button onclick="window.location.hash='#/'" style="background:transparent; border:none; color:#64748b; margin-top:20px; text-decoration:underline; cursor:pointer;">Voltar ao site</button>
            </div>
        </div>
    `;

    const input = document.getElementById('pin-input');
    const btn = document.getElementById('btn-login');
    const errorMsg = document.getElementById('error-msg');

    input.focus();

    async function attemptLogin() {
        const pin = input.value.trim();
        if (pin.length !== 5) {
            errorMsg.innerText = "O PIN deve ter 5 dígitos.";
            return;
        }

        btn.disabled = true;
        btn.innerText = "VERIFICANDO...";
        errorMsg.innerText = "";

        try {
            const docRef = doc(db, "operational_pins", pin);
            const snap = await getDoc(docRef);

            if (!snap.exists()) {
                errorMsg.innerText = "PIN Inválido ou Expirado.";
                btn.disabled = false;
                btn.innerText = "ACESSAR SISTEMA";
                return;
            }

            const accessData = snap.data();
            
            // 🔥 A MÁGICA: Salva o "Crachá Virtual" no navegador do voluntário
            const session = {
                type: accessData.type,
                compId: accessData.competition_id,
                court: accessData.court || null,
                pin: pin
            };
            localStorage.setItem('wb_oper_session', JSON.stringify(session));

            // Redireciona para o lugar certo baseado na função
            if (accessData.type === 'CALL_ROOM') {
                window.location.hash = `#/call-room?id=${accessData.competition_id}`;
            } else if (accessData.type === 'COURT') {
                // Manda direto para o Hub de Quadras daquela quadra específica
                window.location.hash = `#/competitions/scoreboard?id=${accessData.competition_id}`;
            }

            // Recarrega para limpar UI
            setTimeout(() => window.location.reload(), 200);

        } catch (e) {
            errorMsg.innerText = "Erro de conexão.";
            btn.disabled = false;
            btn.innerText = "ACESSAR SISTEMA";
        }
    }

    btn.addEventListener('click', attemptLogin);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
}