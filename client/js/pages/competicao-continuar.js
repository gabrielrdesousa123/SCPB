import { db } from '../firebase-config.js';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function renderCompeticaoContinuarPage(outlet) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const compIdRaw = params.get("id");

  if (!compIdRaw) {
    outlet.innerHTML = `
      <section class="page" id="comp-list-root">
        <header class="toolbar">
          <h1>Competições Salvas</h1>
          <a class="nav-btn" href="#/competicao-nova" class="toolbar-actions">
            + Nova Competição
          </a>
        </header>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th><th>Local</th><th>Data</th>
                <th style="width:220px">Ações</th>
              </tr>
            </thead>
            <tbody id="tblBody"></tbody>
          </table>
        </div>
      </section>
    `;
    const root = outlet.querySelector("#comp-list-root");
    const tblBody = root.querySelector("#tblBody");
    
    async function loadList() {
      try {
        tblBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
        
        // Busca do Firebase ordenada pela data de criação
        const q = query(collection(db, "competitions"), orderBy("created_at", "desc"));
        const snapshot = await getDocs(q);
        
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (!items.length) {
          tblBody.innerHTML = `<tr><td colspan="4">Nenhuma competição encontrada.</td></tr>`;
          return;
        }
        
        tblBody.innerHTML = items.map(c => `
          <tr data-id="${c.id}">
            <td>${esc(c.name || c.nome)}</td>
            <td>${esc(c.local || "")}</td>
            <td>${esc(fmtPeriodo(c.start_date, c.end_date))}</td>
            <td>
              <button class="nav-btn btn-open" data-id="${c.id}">Abrir</button>
              <button class="nav-btn danger-btn btn-delete" data-id="${c.id}">Excluir</button>
            </td>
          </tr>`
        ).join("");

        // Ação de Abrir
        root.querySelectorAll('.btn-open').forEach(btn => {
          btn.addEventListener('click', () => { location.hash = `#/competicao-continuar?id=${btn.dataset.id}`; });
        });

        // Ação de Excluir
        root.querySelectorAll('.btn-delete').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            const row = e.currentTarget.closest('tr');
            const compName = row.querySelector('td:first-child').textContent;
            
            if (confirm(`Tem certeza que deseja excluir a competição "${compName}"?\n\nEsta ação não pode ser desfeita.`)) {
              try {
                await deleteDoc(doc(db, "competitions", id));
                row.remove();
                alert("Competição excluída com sucesso.");
              } catch (err) {
                alert(`Falha ao excluir competição: ${err.message}`);
              }
            }
          });
        });
      } catch (e) {
        // Fallback caso a ordenação falhe por falta de índice no Firebase
        if (e.message.includes("index")) {
           console.warn("Criando índice do Firebase... Tentando carregar sem ordenação.");
           try {
             const fallbackSnap = await getDocs(collection(db, "competitions"));
             const fallbackItems = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
             
             if (!fallbackItems.length) {
                tblBody.innerHTML = `<tr><td colspan="4">Nenhuma competição encontrada.</td></tr>`;
                return;
             }

             tblBody.innerHTML = fallbackItems.map(c => `
              <tr data-id="${c.id}">
                <td>${esc(c.name || c.nome)}</td>
                <td>${esc(c.local || "")}</td>
                <td>${esc(fmtPeriodo(c.start_date, c.end_date))}</td>
                <td>
                  <button class="nav-btn btn-open" data-id="${c.id}">Abrir</button>
                  <button class="nav-btn danger-btn btn-delete" data-id="${c.id}">Excluir</button>
                </td>
              </tr>`
             ).join("");
             
             root.querySelectorAll('.btn-open').forEach(btn => {
               btn.addEventListener('click', () => { location.hash = `#/competicao-continuar?id=${btn.dataset.id}`; });
             });
             root.querySelectorAll('.btn-delete').forEach(btn => {
               btn.addEventListener('click', async (e) => {
                 const id = e.currentTarget.dataset.id;
                 const row = e.currentTarget.closest('tr');
                 if (confirm(`Excluir esta competição permanentemente?`)) {
                    await deleteDoc(doc(db, "competitions", id));
                    row.remove();
                 }
               });
             });

           } catch(fallbackErr) {
              tblBody.innerHTML = `<tr><td colspan="4" style="color: red;">Falha ao carregar: ${fallbackErr.message}</td></tr>`;
           }
        } else {
           tblBody.innerHTML = `<tr><td colspan="4" style="color: red;">Falha ao carregar: ${e.message}</td></tr>`;
        }
      }
    }
    await loadList();
    return;
  }
}

function fmtPeriodo(ini, fim) {
  if (!ini && !fim) return "";
  const formatDate = (dateStr) => dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const fIni = formatDate(ini);
  const fFim = formatDate(fim);
  if (fIni && fFim && fIni !== fFim) return `${fIni} a ${fFim}`;
  return fIni || fFim || "";
}