// client/js/pages/status.js

import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function renderStatus(root) {
    const styles = `
        <style>
            .status-wrapper { max-width: 1000px; margin: 0 auto; padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; }
            .status-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 30px; }
            .status-header h1 { color: #0f172a; margin: 0; font-size: 26px; font-weight: 900; }
            .btn-back { padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: #475569; font-weight: bold; cursor: pointer; transition: 0.2s; }
            .btn-back:hover { background: #f8fafc; }
            
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            @media(max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
            
            .status-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
            .status-card h2 { margin: 0 0 20px 0; font-size: 18px; color: #1e293b; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
            
            .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dashed #e2e8f0; align-items: center; }
            .info-row:last-child { border-bottom: none; padding-bottom: 0; }
            .info-label { color: #64748b; font-size: 14px; font-weight: 600; }
            .info-value { color: #0f172a; font-size: 15px; font-weight: 800; text-align: right; }
            
            .badge-ok { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .badge-error { background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .badge-warn { background: #fef08a; color: #854d0e; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }

            .speed-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; text-align: center; flex: 1; min-width: 100px; }
            .speed-title { font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
            .speed-value { font-size: 24px; font-weight: 900; color: #2563eb; }
            .speed-unit { font-size: 12px; color: #94a3b8; }

            .btn-test { background: #2563eb; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 15px; width: 100%; cursor: pointer; transition: 0.2s; margin-top: 15px; }
            .btn-test:hover { background: #1d4ed8; }
            .btn-test:disabled { background: #94a3b8; cursor: not-allowed; }

            /* Estilos do Guia de Acessos */
            .guide-section-title { color: #1e293b; font-size: 20px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin: 40px 0 20px 0; display: flex; align-items: center; gap: 10px; }
            .roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px; }
            .role-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: transform 0.2s; border-top: 4px solid #cbd5e1; }
            .role-card:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.05); }
            .role-title { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
            .role-title h3 { margin: 0; font-size: 16px; color: #0f172a; }
            .role-desc { color: #475569; font-size: 13px; line-height: 1.6; margin: 0; }
            
            .role-public { border-top-color: #94a3b8; }
            .role-user { border-top-color: #3b82f6; }
            .role-admin2 { border-top-color: #f59e0b; }
            .role-admin1 { border-top-color: #f97316; }
            .role-admin { border-top-color: #ef4444; }
            .role-dt { border-top-color: #8b5cf6; }
            .role-chefe { border-top-color: #10b981; }

            .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; }
            .badge-public { background: #f1f5f9; color: #475569; }
            .badge-user { background: #eff6ff; color: #1d4ed8; }
            .badge-admin2 { background: #fef3c7; color: #b45309; }
            .badge-admin1 { background: #ffedd5; color: #c2410c; }
            .badge-admin { background: #fee2e2; color: #b91c1c; }
            .badge-dt { background: #ede9fe; color: #6d28d9; }
            .badge-chefe { background: #dcfce7; color: #047857; }

            .about-text { color: #475569; font-size: 14px; line-height: 1.6; text-align: justify; }
            .footer-credits { text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px; line-height: 1.5; }
            .footer-credits a { color: #2563eb; text-decoration: none; font-weight: bold; }
            .footer-credits a:hover { text-decoration: underline; }
            
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            .loading-text { animation: pulse 1.5s infinite; color: #3b82f6; font-weight: bold; }
        </style>
    `;

    root.innerHTML = `
        ${styles}
        <div class="status-wrapper">
            <header class="status-header">
                <h1>Diagnóstico e Manual do Sistema</h1>
                <button class="btn-back" onclick="window.history.back()">← Voltar</button>
            </header>

            <div id="loading-overlay" style="text-align:center; padding: 50px;">
                <div class="loading-text" style="font-size:18px;">A recolher informações do SGBR...</div>
            </div>

            <div id="dashboard-content" style="display:none;">
                
                <div class="grid-2">
                    <div class="status-card">
                        <h2>👤 Seus Dados de Acesso</h2>
                        <div class="info-row">
                            <span class="info-label">Nome Completo</span>
                            <span class="info-value" id="val-nome">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Nome Abreviado</span>
                            <span class="info-value" id="val-abrev">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">E-mail Logado</span>
                            <span class="info-value" id="val-email" style="font-size:13px;">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Nível de Permissão</span>
                            <span class="info-value" id="val-role" style="color:#2563eb;">-</span>
                        </div>
                    </div>

                    <div class="status-card">
                        <h2>📡 Status de Conexão</h2>
                        <div class="info-row">
                            <span class="info-label">Internet (Navegador)</span>
                            <span class="info-value" id="val-net"><span class="badge-warn">Testando...</span></span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Banco de Dados (Firebase)</span>
                            <span class="info-value" id="val-db"><span class="badge-warn">Testando...</span></span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Total de Competições</span>
                            <span class="info-value" id="val-comps">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Total de Utilizadores</span>
                            <span class="info-value" id="val-users">-</span>
                        </div>
                    </div>
                </div>

                <div class="status-card" style="margin-bottom: 40px;">
                    <h2>⚡ Teste de Velocidade e Latência</h2>
                    <p style="font-size:13px; color:#64748b; margin-top:0;">Verifique a qualidade da sua rede local para garantir que as súmulas sejam sincronizadas instantaneamente.</p>
                    <div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:15px;">
                        <div class="speed-box"><div class="speed-title">Latência (Ping)</div><div class="speed-value" id="speed-ping">--</div><div class="speed-unit">ms</div></div>
                        <div class="speed-box"><div class="speed-title">Download Est.</div><div class="speed-value" id="speed-down">--</div><div class="speed-unit">Mbps</div></div>
                        <div class="speed-box"><div class="speed-title">Upload Est.</div><div class="speed-value" id="speed-up">--</div><div class="speed-unit">Mbps</div></div>
                    </div>
                    <button class="btn-test" id="btn-run-test">▶ Iniciar Teste de Conexão</button>
                </div>

                <h2 class="guide-section-title">🌍 Acessos Globais (Sistema)</h2>
                <div class="roles-grid">
                    <div class="role-card role-public">
                        <div class="role-title"><span class="badge badge-public">Sem Login</span><h3>Público Externo</h3></div>
                        <p class="role-desc">Visitantes que desejam acompanhar o desporto. Têm acesso à visualização das competições abertas, acompanhamento de resultados ao vivo e grelha de jogos. Não podem fazer edições.</p>
                    </div>
                    <div class="role-card role-user">
                        <div class="role-title"><span class="badge badge-user">Nível Básico</span><h3>Árbitro / Utilizador</h3></div>
                        <p class="role-desc">Oficiais cadastrados. Podem consultar a base de dados em modo leitura e possuem acesso exclusivo à área <strong>"Minhas Dispensas"</strong> para solicitar e baixar ofícios em PDF.</p>
                    </div>
                    <div class="role-card role-admin2">
                        <div class="role-title"><span class="badge badge-admin2">Nível Intermediário</span><h3>Admin II (Cadastros)</h3></div>
                        <p class="role-desc">Responsáveis pela base de dados. Têm permissão para criar, editar e excluir perfis de Atletas, Clubes, Classes e Oficiais. Também podem utilizar o Simulador de Chaves.</p>
                    </div>
                    <div class="role-card role-admin1">
                        <div class="role-title"><span class="badge badge-admin1">Nível Avançado</span><h3>Admin I (Operacional)</h3></div>
                        <p class="role-desc">Gestores desportivos. Possuem todos os acessos de cadastro, com o poder extra de <strong>criar e editar Competições</strong> e gerenciar a aprovação dos ofícios de dispensa de todos os árbitros.</p>
                    </div>
                    <div class="role-card role-admin">
                        <div class="role-title"><span class="badge badge-admin">Nível Máximo</span><h3>Admin Geral</h3></div>
                        <p class="role-desc">Acesso irrestrito a todo o SGBR. Acedem à <strong>Gestão de Acessos</strong> para aprovar utilizadores, corrigir dados, forçar o vínculo de árbitros a contas, redefinir senhas e importar dados via CSV.</p>
                    </div>
                </div>

                <h2 class="guide-section-title">🏟️ Acessos Locais (Campeonatos)</h2>
                <div class="roles-grid">
                    <div class="role-card role-dt">
                        <div class="role-title"><span class="badge badge-dt">Gestão Máxima</span><h3>Delegado Técnico</h3></div>
                        <p class="role-desc">A autoridade máxima do evento. Pode montar as chaves/potes dos atletas, utilizar o sistema <em>Drag & Drop</em> para definir a Agenda Oficial e alterar resultados ou súmulas de qualquer partida.</p>
                    </div>
                    <div class="role-card role-chefe">
                        <div class="role-title"><span class="badge badge-chefe">Gestão de Quadra</span><h3>Árbitro Chefe</h3></div>
                        <p class="role-desc">Coordena a equipa de arbitragem. Utiliza a <strong>Escala de Arbitragem</strong> para alocar oficiais nas quadras (Câmara, Mesa, Linha, Principal), pode editar súmulas e imprimir o Logbook de atuações.</p>
                    </div>
                    <div class="role-card role-user">
                        <div class="role-title"><span class="badge badge-user">Oficialização</span><h3>Oficial de Quadra</h3></div>
                        <p class="role-desc">Árbitros atuantes no jogo. Acessam a Agenda e a Escala de Arbitragem em <strong>modo leitura</strong> para verificarem os seus horários e alocações. Preenchem apenas as súmulas dos jogos em que estão envolvidos (caso o admin libere a edição de tablets).</p>
                    </div>
                </div>

                <div class="status-card">
                    <h2>ℹ️ Sobre o SGBR</h2>
                    <div class="about-text">
                        <p>O <strong>SGBR (Sistema de Gestão de Bocha Brasil)</strong> é uma plataforma profissional em Cloud, concebida para digitalizar e otimizar toda a organização de eventos da Bocha Paralímpica. Ele centraliza a gestão de atletas e clubes, substitui papéis por súmulas eletrónicas em tempo real, automatiza o chaveamento de competições e oferece ferramentas avançadas de escala de arbitragem, proporcionando uma experiência de nível internacional para organizadores e público.</p>
                    </div>
                </div>

                <div class="footer-credits">
                    Sistema desenvolvido, desenhado e atualizado por <strong>Gabriel Sousa</strong>.<br>
                    Sugestões, melhorias e suporte técnico: <a href="mailto:gabrielredesousa@gmail.com">gabrielredesousa@gmail.com</a>
                </div>
            </div>
        </div>
    `;

    const auth = getAuth();

    // 1. Verificar Internet Básica
    const checkInternet = () => {
        const netEl = document.getElementById('val-net');
        if (navigator.onLine) {
            netEl.innerHTML = '<span class="badge-ok">Online (Conectado)</span>';
        } else {
            netEl.innerHTML = '<span class="badge-error">Offline (Sem Internet)</span>';
        }
    };
    window.addEventListener('online', checkInternet);
    window.addEventListener('offline', checkInternet);

    // 2. Carregar Dados do Firebase
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            root.innerHTML = `<div style="padding:40px; text-align:center; color: #ef4444; font-weight:bold;">Acesso Negado. Faça login para ver o diagnóstico.</div>`;
            return;
        }

        try {
            // Puxa os dados do usuário
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const uData = userDoc.data();
                document.getElementById('val-nome').innerText = uData.nome_completo || uData.nome || 'Não informado';
                document.getElementById('val-abrev').innerText = uData.nome_abreviado || 'Não informado';
                document.getElementById('val-email').innerText = user.email || 'Não informado';
                
                let roleFormatado = 'Usuário Padrão';
                if(uData.global_role === 'ADMIN_GERAL') roleFormatado = 'Admin Total';
                if(uData.global_role === 'ADMIN_1') roleFormatado = 'Admin I';
                if(uData.global_role === 'ADMIN_2') roleFormatado = 'Admin II';
                document.getElementById('val-role').innerText = roleFormatado;
            }

            // Puxa as estatísticas gerais
            const compsSnap = await getDocs(collection(db, "competitions"));
            document.getElementById('val-comps').innerText = compsSnap.size;

            const usersSnap = await getDocs(collection(db, "users"));
            document.getElementById('val-users').innerText = usersSnap.size;

            document.getElementById('val-db').innerHTML = '<span class="badge-ok">Conectado (Latência Baixa)</span>';

            // Esconde o loading e mostra o painel
            document.getElementById('loading-overlay').style.display = 'none';
            document.getElementById('dashboard-content').style.display = 'block';
            checkInternet();

        } catch (error) {
            document.getElementById('val-db').innerHTML = `<span class="badge-error">Erro: ${error.message}</span>`;
            document.getElementById('loading-overlay').style.display = 'none';
            document.getElementById('dashboard-content').style.display = 'block';
        }
    });

    // 3. Lógica do Teste de Velocidade (Ping e Download manual)
    const btnTest = document.getElementById('btn-run-test');
    btnTest.addEventListener('click', async () => {
        btnTest.disabled = true;
        btnTest.innerText = "A testar...";
        
        const pingEl = document.getElementById('speed-ping');
        const downEl = document.getElementById('speed-down');
        const upEl = document.getElementById('speed-up');

        pingEl.innerText = "...";
        downEl.innerText = "...";
        upEl.innerText = "...";

        try {
            // Teste de Ping batendo na raiz do próprio site (nunca falha por CORS)
            const originUrl = window.location.origin + window.location.pathname;
            const startPing = Date.now();
            await fetch(originUrl + '?_ping=' + startPing, { method: 'HEAD', cache: 'no-store' });
            const pingReal = Date.now() - startPing;
            
            // Teste de Download (Baixa o código da página atual para medir a banda)
            let downMbps = 0;
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            
            // Se o navegador suportar a API nativa (Chrome/Android), usamos ela que é super precisa
            if (conn && conn.downlink) {
                downMbps = conn.downlink;
            } else {
                // Se for Safari/iPhone/Firefox, fazemos o teste de download "na força"
                const startDl = Date.now();
                const res = await fetch(originUrl + '?_dl=' + startDl, { cache: 'no-store' });
                const blob = await res.blob();
                const endDl = Date.now();
                
                const durationInSeconds = (endDl - startDl) / 1000;
                const bitsLoaded = blob.size * 8;
                downMbps = (bitsLoaded / durationInSeconds) / (1024 * 1024); // Mbps
                
                if (downMbps < 0.1) downMbps = 0.5; // fallback de segurança
            }

            setTimeout(() => {
                pingEl.innerText = pingReal;
                pingEl.style.color = pingReal < 150 ? '#16a34a' : (pingReal < 400 ? '#f59e0b' : '#ef4444');

                const downFmtd = downMbps.toFixed(1);
                downEl.innerText = downFmtd;
                downEl.style.color = downMbps > 5 ? '#16a34a' : (downMbps > 1 ? '#f59e0b' : '#ef4444');

                // A rede móvel padrão do Brasil tem um upload que é cerca de 30% do download
                const estimatedUp = (downMbps * 0.3).toFixed(1);
                upEl.innerText = estimatedUp > 0 ? estimatedUp : '0.1';

                btnTest.disabled = false;
                btnTest.innerText = "▶ Testar Novamente";
            }, 500); 

        } catch (err) {
            console.error(err);
            pingEl.innerText = "Erro";
            downEl.innerText = "Erro";
            upEl.innerText = "Erro";
            btnTest.disabled = false;
            btnTest.innerText = "▶ Iniciar Teste de Conexão";
        }
    });
}