// client/js/pages/home.js

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from '../firebase-config.js';

export async function renderHome(root) {
  const auth = getAuth();
  
  // Exibe um carregamento rápido enquanto o Firebase decide se tem alguém logado
  root.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-image: linear-gradient(rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.95));">
      <div style="width:40px; height:40px; border:4px solid rgba(255,255,255,0.1); border-top:4px solid #3b82f6; border-radius:50%; animation:spin 1s linear infinite;"></div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `;

  onAuthStateChanged(auth, async (user) => {
    let authButtonHtml = '';
    let adminGreeting = '';

    if (user) {
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && (docSnap.data().status === 'approved' || docSnap.data().global_role === 'ADMIN_GERAL')) {
          const uData = docSnap.data();
          const pName = uData.nome_abreviado || uData.nome_completo?.split(' ')[0] || 'Oficial';
          
          adminGreeting = `<div class="user-greeting">
                              Olá, <b>${pName}</b> <button id="btn-logout-home" class="logout-btn">Sair</button>
                           </div>`;

          authButtonHtml = `
            <a href="#/dashboard" class="landing-btn admin" style="border-color: #f59e0b;">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <span style="color:#f59e0b;">Meu Painel</span>
            </a>
          `;
        } else {
          await signOut(auth);
          authButtonHtml = getLoginButtonHtml();
        }
      } catch (e) {
        authButtonHtml = getLoginButtonHtml();
      }
    } else {
      authButtonHtml = getLoginButtonHtml();
    }

    drawHome(adminGreeting, authButtonHtml);
  });

  function getLoginButtonHtml() {
    return `
      <a href="#/login" class="landing-btn admin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Acesso Oficial</span>
      </a>
    `;
  }

  function drawHome(adminGreeting, authButtonHtml) {
    root.innerHTML = `
      <style>
        html, body, #app {
            height: auto !important;
            min-height: 100vh !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
        }

        .landing-fullscreen {
          position: relative; 
          width: 100%;
          min-height: 100vh;
          
          background-image: linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.75)), url('./img/fundo-bocha.jpg');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          
          font-family: system-ui, -apple-system, sans-serif;
          color: #ffffff;
          padding: 80px 20px 120px 20px; 
          box-sizing: border-box;
        }

        .user-greeting {
          position: absolute; 
          top: 20px; 
          right: 20px; 
          color: white; 
          font-size: 14px; 
          display: flex; 
          align-items: center; 
          gap: 10px; 
          background: rgba(255,255,255,0.1); 
          padding: 8px 15px; 
          border-radius: 20px; 
          backdrop-filter: blur(5px); 
          border: 1px solid rgba(255,255,255,0.2);
          z-index: 10;
        }
        
        .logout-btn {
          background: none; 
          border: none; 
          color: #fca5a5; 
          font-weight: bold; 
          cursor: pointer; 
          font-size: 12px; 
          margin-left: 5px;
        }

        .landing-title {
          font-size: clamp(2.5rem, 8vw, 4rem);
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 20px 0 10px 0;
          text-shadow: 2px 4px 8px rgba(0,0,0,0.5);
          text-align: center;
        }

        .landing-subtitle {
          font-size: clamp(1.2rem, 4vw, 1.5rem);
          color: #cbd5e1;
          margin-bottom: 50px;
          text-align: center;
          font-weight: 300;
        }

        .landing-buttons {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          justify-content: center;
          width: 100%;
          max-width: 900px;
          margin-bottom: 40px;
        }

        .landing-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 240px;
          height: 200px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          color: white;
          text-decoration: none;
          transition: all 0.3s ease;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .landing-btn:hover {
          transform: translateY(-8px);
          background: rgba(255, 255, 255, 0.2);
          border-color: #3b82f6;
          box-shadow: 0 12px 40px rgba(59, 130, 246, 0.4);
        }

        .landing-btn svg {
          width: 56px;
          height: 56px;
          margin-bottom: 16px;
        }

        .landing-btn.primary svg { color: #3b82f6; }
        .landing-btn.success svg { color: #10b981; }
        .landing-btn.admin svg { color: #e2e8f0; }

        .landing-btn span {
          font-size: 1.4rem;
          font-weight: 600;
        }
        
        .landing-footer {
          margin-top: 40px;
          padding-top: 20px;
          font-size: 0.9rem;
          color: rgba(255,255,255,0.5);
          text-align: center;
        }

        @media (max-width: 600px) {
          .user-greeting { top: 10px; right: 10px; font-size: 12px; }
          .landing-btn { width: 100%; max-width: 280px; height: 160px; }
          .landing-fullscreen { padding-top: 60px; padding-bottom: 150px; } 
        }
      </style>

      <div class="landing-fullscreen">
        ${adminGreeting}

        <h1 class="landing-title">Sistema de Gestão Bocha BR</h1>
        <p class="landing-subtitle">Gestão de Competições de Bocha Paralímpica</p>

        <div class="landing-buttons">
          
          <a href="#/competitions/load" class="landing-btn primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="7"></circle>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
            </svg>
            <span>Campeonatos</span>
          </a>

          <a href="#/resultados" class="landing-btn success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>Resultados</span>
          </a>

          ${authButtonHtml}

        </div>

        <div class="landing-footer">
          © ${new Date().getFullYear()} Criado por Gabriel Sousa.
        </div>
      </div>
    `;

    const btnLogout = document.getElementById('btn-logout-home');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await signOut(auth);
        sessionStorage.removeItem('impersonatedRole');
        window.location.hash = '#/';
        window.location.reload();
      });
    }
  }
}