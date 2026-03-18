import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 1. Inicia a conexão com o seu Firebase usando a sua chave
const serviceAccount = JSON.parse(readFileSync(new URL('./firebase-key.json', import.meta.url)));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const dbFirebase = admin.firestore();

async function marcarTodasComoHistorico() {
  console.log("⏳ Buscando competições no Firebase...");
  
  try {
    const snap = await dbFirebase.collection('competitions').get();
    
    let batch = dbFirebase.batch();
    let count = 0;

    snap.forEach(doc => {
      // Prepara a instrução para injetar o campo em cada competição
      batch.update(doc.ref, { historica_csv: true });
      
      const nome = doc.data().nome || doc.data().name || "Sem Nome";
      console.log(`Carimbando como histórico: ${nome}`);
      count++;
    });

    if (count > 0) {
      // Executa todas as atualizações de uma só vez!
      await batch.commit();
      console.log(`\n✅ SUCESSO ABSOLUTO! ${count} competições receberam a etiqueta historica_csv = true.`);
      console.log("--------------------------------------------------");
      console.log("⚠️ ATENÇÃO: O script marcou TODAS as competições.");
      console.log("Vá agora ao Firebase Console, encontre a sua 1 competição NOVA (que deve ficar na tela Campeonatos) e mude o historica_csv dela para 'false'!");
    } else {
      console.log("Nenhuma competição encontrada.");
    }
  } catch (error) {
    console.error("❌ Erro ao atualizar:", error.message);
  }
}

marcarTodasComoHistorico();