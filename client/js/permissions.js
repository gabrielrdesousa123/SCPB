// client/js/permissions.js

// ==========================================
// 1. REGRAS GLOBAIS DO SISTEMA
// ==========================================
export const GLOBAL_ROLES = {
  "ADMIN_GERAL": {
    view: ["all"],
    edit: ["all"]
  },
  "ADMIN_1": {
    // Vê tudo, exceto CSV e Gestão
    view: ["competicoes", "atletas", "clubes", "classes", "oficiais", "simulador", "status", "resultados", "solicitar_dispensa", "admin_dispensas"],
    // Edita tudo o que vê, EXCETO Status e Resultados
    edit: ["competicoes", "atletas", "clubes", "classes", "oficiais", "simulador", "admin_dispensas"]
  },
  "ADMIN_2": {
    // Vê competições, resultados e status (além do que edita)
    view: ["competicoes", "atletas", "clubes", "classes", "oficiais", "simulador", "status", "resultados", "solicitar_dispensa"],
    // NÃO edita competições globais
    edit: ["atletas", "clubes", "classes", "oficiais", "simulador"]
  },
  "USER_1": {
    // Vê tudo (menos CSV, Gestão e Admin Dispensas) - AQUI O ÁRBITRO GANHA ACESSO À DISPENSA DELE
    view: ["competicoes", "atletas", "clubes", "classes", "oficiais", "resultados", "status", "solicitar_dispensa"],
    // NÃO EDITA NADA (Somente leitura)
    edit: [] 
  },
  "PUBLIC": {
    // O público externo sem login
    view: ["resultados", "status", "competicoes"],
    edit: []
  }
};

// ==========================================
// 2. REGRAS LOCAIS (DENTRO DA COMPETIÇÃO)
// ==========================================
export const COMP_ROLES = {
  "DELEGADO_TECNICO": { 
    view: ["all"], 
    edit: ["all"] // Deus dentro da competição
  },
  "ASSISTENTE_DT": { 
    view: ["all"], 
    edit: ["all"] // Assume o mesmo papel do DT
  },
  "ARBITRO_CHEFE": { 
    view: ["all"], 
    edit: ["oficiais", "sumulas", "camara_chamada", "violacoes", "scoreboard", "agenda_escola", "logbook"] 
  },
  "ASSISTENTE_ARBITRO_CHEFE": { 
    view: ["all"], 
    edit: ["oficiais", "sumulas", "camara_chamada", "violacoes", "scoreboard", "agenda_escola", "logbook"] 
  },
  "ARBITRO": { 
    // Pode ver tudo na competição EXCETO agenda e logbook
    view: ["oficiais", "sumulas", "camara_chamada", "violacoes", "scoreboard", "status", "resultados", "atletas"], 
    // Árbitro edita apenas o placar das partidas dele
    edit: ["scoreboard"] 
  }
};

// ==========================================
// 3. MOTOR DE VERIFICAÇÃO
// ==========================================

export let currentUser = {
    uid: null,
    globalRole: "PUBLIC", 
    trueRole: "PUBLIC"    
};

export function setCurrentUser(uid, role) {
    currentUser.uid = uid;
    currentUser.trueRole = role || "USER_1";

    const fakeRole = sessionStorage.getItem('impersonatedRole');
    if (fakeRole && currentUser.trueRole === "ADMIN_GERAL") {
        currentUser.globalRole = fakeRole;
    } else {
        currentUser.globalRole = currentUser.trueRole;
        sessionStorage.removeItem('impersonatedRole'); 
    }
}

export function setImpersonatedRole(role) {
    if (currentUser.trueRole !== "ADMIN_GERAL") return; 
    if (role === "ADMIN_GERAL") {
        sessionStorage.removeItem('impersonatedRole');
    } else {
        sessionStorage.setItem('impersonatedRole', role);
    }
    currentUser.globalRole = role;
}

// 🛡️ Verifica se o usuário pode VER a página global (Aparecer no menu e acessar)
export function canViewPage(pageName) {
    if (!pageName) return true;
    const role = GLOBAL_ROLES[currentUser.globalRole];
    if (!role) return false;
    
    if (role.view.includes("all") || role.edit.includes("all")) return true;
    return role.view.includes(pageName) || role.edit.includes(pageName);
}

// 🛡️ Verifica se o usuário pode EDITAR a página global (Mostrar botões de Salvar/Novo/Excluir)
export function canEditGlobal(pageName) {
    const role = GLOBAL_ROLES[currentUser.globalRole];
    if (!role) return false;
    
    if (role.edit.includes("all")) return true;
    return role.edit.includes(pageName);
}

// 🛡️ Verifica se o usuário pode VER uma aba DENTRO da Competição
export function canViewInCompetition(competitionRole, featureName) {
    if (currentUser.globalRole === "ADMIN_GERAL") return true;
    if (!competitionRole) return false; 
    
    const compPermissions = COMP_ROLES[competitionRole];
    if (!compPermissions) return false;

    if (compPermissions.view.includes("all") || compPermissions.edit.includes("all")) return true;
    return compPermissions.view.includes(featureName) || compPermissions.edit.includes(featureName);
}

// 🛡️ Verifica se o usuário pode EDITAR DENTRO da Competição
export function canEditInCompetition(competitionRole, featureName) {
    if (currentUser.globalRole === "ADMIN_GERAL") return true;
    if (!competitionRole) return false;
    
    const compPermissions = COMP_ROLES[competitionRole];
    if (!compPermissions) return false;

    if (compPermissions.edit.includes("all")) return true;
    return compPermissions.edit.includes(featureName);
}