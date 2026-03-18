// server/seed-classes.js
// Script para popular classes padrão no banco de dados
// Execute: node server/seed-classes.js

import db from './db.js';

const CLASSES_PADRAO = [
  {
    codigo: 'BC1F',
    nome: 'BC1 Feminino',
    ui_bg: '#c1cbf0',
    ui_fg: '#080808',
    match_time: '50:00',
    turn_time: '04:30',
    ends: 4
  },
  {
    codigo: 'BC1M',
    nome: 'BC1 Masculino',
    ui_bg: '#3b5ddd',
    ui_fg: '#ffffff',
    match_time: '50:00',
    turn_time: '04:30',
    ends: 4
  },
  {
    codigo: 'BC2F',
    nome: 'BC2 Feminino',
    ui_bg: '#82e26f',
    ui_fg: '#000000',
    match_time: '50:00',
    turn_time: '03:30',
    ends: 4
  },
  {
    codigo: 'BC2M',
    nome: 'BC2 Masculino',
    ui_bg: '#05ad21',
    ui_fg: '#ffffff',
    match_time: '50:00',
    turn_time: '03:30',
    ends: 4
  },
  {
    codigo: 'BC3F',
    nome: 'BC3 Feminino',
    ui_bg: '#d3ada7',
    ui_fg: '#0a0a0a',
    match_time: '60:00',
    turn_time: '06:00',
    ends: 6  // BC3F tem 6 parciais!
  },
  {
    codigo: 'BC3M',
    nome: 'BC3 Masculino',
    ui_bg: '#cc301e',
    ui_fg: '#ffffff',
    match_time: '60:00',
    turn_time: '06:00',
    ends: 4
  },
  {
    codigo: 'BC4F',
    nome: 'BC4 Feminino',
    ui_bg: '#e8e59c',
    ui_fg: '#000000',
    match_time: '50:00',
    turn_time: '03:30',
    ends: 4
  },
  {
    codigo: 'BC4M',
    nome: 'BC4 Masculino',
    ui_bg: '#eef127',
    ui_fg: '#000000',
    match_time: '50:00',
    turn_time: '03:30',
    ends: 4
  },
  {
    codigo: 'P-BC3MF',
    nome: 'Mixed BC3 Pairs',
    ui_bg: '#b00020',
    ui_fg: '#ffffff',
    match_time: '60:00',
    turn_time: '07:00',
    ends: 4
  },
  {
    codigo: 'P-BC4MF',
    nome: 'Mixed BC4 Pairs',
    ui_bg: '#f59e0b',
    ui_fg: '#231a00',
    match_time: '50:00',
    turn_time: '04:00',
    ends: 4
  },
  {
    codigo: 'T-BC12MF',
    nome: 'Mixed BC1/2 Team',
    ui_bg: '#1f2bd6',
    ui_fg: '#ffffff',
    match_time: '60:00',
    turn_time: '05:00',
    ends: 6
  }
];

try {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║      SEED - CLASSES PADRÃO BOCHA BR            ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');

  // Verificar se já existem classes
  const countRow = db.prepare('SELECT COUNT(*) as total FROM classes').get();
  const count = countRow.total;

  console.log(`[INFO] Classes existentes no banco: ${count}`);

  if (count > 0) {
    console.log('[INFO] Já existem classes cadastradas.');
    console.log('[INFO] Para forçar recriação, delete as classes existentes primeiro.');
    console.log('');
    console.log('Comando para limpar: sqlite3 data/app.sqlite "DELETE FROM classes;"');
    console.log('');
    process.exit(0);
  }

  console.log('[SEED] Banco vazio. Inserindo classes padrão...');
  console.log('');

  const insert = db.prepare(`
    INSERT INTO classes (codigo, nome, ui_bg, ui_fg, match_time, turn_time, ends, tempos)
    VALUES (@codigo, @nome, @ui_bg, @ui_fg, @match_time, @turn_time, @ends, @tempos)
  `);

  let inserted = 0;

  for (const classe of CLASSES_PADRAO) {
    // Criar JSON tempos
    const tempos = JSON.stringify({
      match_time: classe.match_time,
      turn_time: classe.turn_time,
      ends: classe.ends
    });

    try {
      insert.run({
        codigo: classe.codigo,
        nome: classe.nome,
        ui_bg: classe.ui_bg,
        ui_fg: classe.ui_fg,
        match_time: classe.match_time,
        turn_time: classe.turn_time,
        ends: classe.ends,
        tempos: tempos
      });

      console.log(`  ✓ ${classe.codigo.padEnd(10)} - ${classe.nome.padEnd(25)} (${classe.ui_bg})`);
      inserted++;

    } catch (err) {
      console.error(`  ✗ ${classe.codigo} - ERRO: ${err.message}`);
    }
  }

  console.log('');
  console.log(`[SEED] ${inserted}/${CLASSES_PADRAO.length} classes inseridas com sucesso!`);
  console.log('');

  // Verificar
  const finalCount = db.prepare('SELECT COUNT(*) as total FROM classes').get().total;
  console.log(`[INFO] Total de classes no banco: ${finalCount}`);
  console.log('');

  if (finalCount === CLASSES_PADRAO.length) {
    console.log('✅ SEED CONCLUÍDO COM SUCESSO!');
  } else {
    console.log('⚠️  ATENÇÃO: Algumas classes podem não ter sido inseridas.');
  }

  console.log('');

} catch (error) {
  console.error('');
  console.error('❌ ERRO AO EXECUTAR SEED:');
  console.error('');
  console.error(error);
  console.error('');
  process.exit(1);
}