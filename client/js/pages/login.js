// client/js/pages/login.js

import { db } from '../firebase-config.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function renderLogin(root) {
  const auth = getAuth();

  const styles = `
    <style>
      .auth-container { max-width: 400px; margin: 60px auto; font-family: sans-serif; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
      .auth-logo { text-align: center; margin-bottom: 20px; }
      .auth-title { text-align: center; color: #0f172a; font-size: 24px; margin-bottom: 5px; font-weight: 900; }
      .auth-subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px; }
      .form-group { margin-bottom: 15px; }
      .form-group label { display: block; font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 5px; text-transform: uppercase; }
      .form-control { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; box-sizing: border-box; transition: border-color 0.2s; }
      .form-control:focus { outline: none; border-color: #0d6efd; box-shadow: 0 0 0 3px rgba(13,110,253,0.1); }
      .btn-auth { width: 100%; background: #0d6efd; color: white; border: none; padding: 12px; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.2s; margin-top: 10px; }
      .btn-auth:hover { background: #0b5ed7; }
      .btn-auth:disabled { background: #94a3b8; cursor: not-allowed; }
      .auth-links { display: flex; justify-content: space-between; margin-top: 15px; font-size: 13px; }
      .auth-link { color: #0d6efd; text-decoration: none; cursor: pointer; font-weight: bold; }
      .auth-link:hover { text-decoration: underline; }
      .auth-alert { padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 15px; display: none; font-weight: bold; text-align: center; }
      .alert-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
      .alert-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      .alert-warning { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
      
      .btn-oper-login { width: 100%; background: #f8fafc; color: #1d4ed8; border: 2px dashed #93c5fd; padding: 15px; border-radius: 8px; font-size: 15px; font-weight: 900; cursor: pointer; transition: all 0.2s; margin-top: 25px; text-transform: uppercase; }
      .btn-oper-login:hover { background: #eff6ff; border-color: #3b82f6; transform: scale(1.02); box-shadow: 0 4px 6px rgba(59,130,246,0.15); }
    </style>
  `;

  // --- MODO LOGIN ---
  const loginHtml = `
    <div id="login-view">
      <div class="auth-title">Acesso Restrito</div>
      <div class="auth-subtitle">Área de Oficiais e Administração</div>
      <div id="login-alert" class="auth-alert alert-error"></div>
      
      <form id="form-login">
        <div class="form-group"><label>Email</label><input type="email" id="log-email" class="form-control" required></div>
        <div class="form-group"><label>Senha (Palavra-passe)</label><input type="password" id="log-pwd" class="form-control" required></div>
        <button type="submit" class="btn-auth" id="btn-login">Entrar</button>
      </form>
      
      <div class="auth-links">
        <span class="auth-link" id="link-forgot">Esqueci a senha</span>
        <span class="auth-link" id="link-register">Criar Conta</span>
      </div>

      <div style="width: 100%; height: 1px; background: #e2e8f0; margin: 25px 0;"></div>

      <div class="auth-title" style="font-size: 18px; color: #334155;">Mesários e Câmara de Chamada</div>
      <button class="btn-oper-login" onclick="location.hash='#/oper-login'">📱 Acesso Operacional (PIN)</button>
      
      <div style="text-align:center; margin-top: 25px;">
        <button class="btn-outline-secondary" onclick="location.hash='#/home'" style="background:none; border:none; text-decoration:underline; cursor:pointer; color:#64748b;">← Voltar ao site público</button>
      </div>
    </div>
  `;

  // --- MODO CADASTRO ---
  const registerHtml = `
    <div id="register-view" style="display: none;">
      <div class="auth-title">Nova Conta</div>
      <div class="auth-subtitle">Seu cadastro passará por aprovação.</div>
      <div id="reg-alert" class="auth-alert alert-error"></div>
      
      <form id="form-register">
        <div class="form-group"><label>Nome Completo</label><input type="text" id="reg-nome" class="form-control" required></div>
        <div style="display:flex; gap:10px;">
            <div class="form-group" style="flex:2;"><label>Nome Abreviado (Súmula)</label><input type="text" id="reg-abrev" class="form-control" placeholder="Ex: G. Silva" required></div>
            <div class="form-group" style="flex:1;"><label>Estado / UF</label><input type="text" id="reg-uf" class="form-control" placeholder="PR, SP..." maxlength="2" required style="text-transform:uppercase;"></div>
        </div>
        <div class="form-group"><label>Email</label><input type="email" id="reg-email" class="form-control" required></div>
        <div class="form-group"><label>Senha</label><input type="password" id="reg-pwd" class="form-control" required minlength="6"></div>
        <button type="submit" class="btn-auth" id="btn-register" style="background:#16a34a;">Solicitar Cadastro</button>
      </form>
      
      <div class="auth-links" style="justify-content: center;">
        <span class="auth-link" id="link-back-login">← Voltar para o Login</span>
      </div>
    </div>
  `;

  root.innerHTML = `${styles}<div class="auth-container">${loginHtml}${registerHtml}</div>`;

  const viewLogin = document.getElementById('login-view');
  const viewReg = document.getElementById('register-view');
  const alertLogin = document.getElementById('login-alert');
  const alertReg = document.getElementById('reg-alert');

  function showAlert(el, msg, type = 'error') {
    el.textContent = msg;
    el.className = `auth-alert alert-${type}`;
    el.style.display = 'block';
  }

  // Alternar Telas
  document.getElementById('link-register').onclick = () => { viewLogin.style.display = 'none'; viewReg.style.display = 'block'; alertLogin.style.display='none'; alertReg.style.display='none'; };
  document.getElementById('link-back-login').onclick = () => { viewReg.style.display = 'none'; viewLogin.style.display = 'block'; alertLogin.style.display='none'; alertReg.style.display='none';};

  // RECUPERAR SENHA
  document.getElementById('link-forgot').onclick = async () => {
    const email = document.getElementById('log-email').value;
    if (!email) return showAlert(alertLogin, "Digite seu email no campo acima e clique novamente em Esqueci a senha.", "warning");
    try {
      await sendPasswordResetEmail(auth, email);
      showAlert(alertLogin, "Email de recuperação enviado! Verifique sua caixa de entrada.", "success");
    } catch(e) { showAlert(alertLogin, "Erro ao enviar email. Verifique se está correto."); }
  };

  // LOGIN
  document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = "Autenticando...";
    try {
      const email = document.getElementById('log-email').value;
      const pwd = document.getElementById('log-pwd').value;
      
      const userCred = await signInWithEmailAndPassword(auth, email, pwd);
      
      const docRef = doc(db, "users", userCred.user.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
          const userData = docSnap.data();
          if (userData.status === 'pending') {
              await signOut(auth);
              showAlert(alertLogin, "Sua conta ainda não foi aprovada pelo Administrador.", "warning");
          } else if (userData.status === 'rejected') {
              await signOut(auth);
              showAlert(alertLogin, "Seu acesso foi negado pelo Administrador.", "error");
          } else {
              window.location.hash = '#/dashboard';
          }
      } else {
          window.location.hash = '#/dashboard'; 
      }
    } catch (err) {
      showAlert(alertLogin, "Credenciais inválidas. Tente novamente.");
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  };

  // CADASTRO
  document.getElementById('form-register').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.textContent = "Cadastrando...";
    
    try {
      const nome = document.getElementById('reg-nome').value;
      const abrev = document.getElementById('reg-abrev').value;
      const uf = document.getElementById('reg-uf').value.toUpperCase();
      const email = document.getElementById('reg-email').value;
      const pwd = document.getElementById('reg-pwd').value;

      const userCred = await createUserWithEmailAndPassword(auth, email, pwd);
      const uid = userCred.user.uid;

      await setDoc(doc(db, "users", uid), {
        uid: uid,
        nome_completo: nome,
        nome_abreviado: abrev,
        uf: uf,
        email: email,
        status: 'pending',
        role: 'Oficial',
        created_at: new Date().toISOString()
      });

      await signOut(auth);

      showAlert(alertReg, "Cadastro realizado com sucesso! Aguarde a liberação do Administrador.", "success");
      document.getElementById('form-register').reset();
      
    } catch (err) {
      if(err.code === 'auth/email-already-in-use') showAlert(alertReg, "Este email já está cadastrado.");
      else showAlert(alertReg, "Erro ao criar conta: " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = "Solicitar Cadastro";
    }
  };
}