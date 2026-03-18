// server/lib/drawEliminatoria.js
// Lógica para gerar chave eliminatória simples (sem sorteio)
// Distribuição determinística baseada em SEED (ranking)

/**
 * Gera a estrutura da chave eliminatória
 * @param {number} numEntrants - Número de atletas
 * @returns {Object} - Estrutura da chave com rounds, byes, etc
 */
export function generateKnockoutStructure(numEntrants) {
  if (numEntrants < 2) {
    throw new Error('É necessário pelo menos 2 atletas para uma eliminatória');
  }

  // Calcular tamanho da chave (próxima potência de 2)
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numEntrants)));
  const numByes = bracketSize - numEntrants;

  // Determinar quais rounds existem
  const rounds = [];
  let currentSize = bracketSize;
  let roundNum = 1;

  while (currentSize >= 2) {
    const roundName = getRoundName(currentSize);
    rounds.push({
      name: roundName,
      size: currentSize,
      matches: currentSize / 2,
      round_number: roundNum
    });
    currentSize = currentSize / 2;
    roundNum++;
  }

  // Adicionar disputa de 3º lugar se tiver semifinal
  const hasSemiFinal = rounds.some(r => r.name === 'SF');
  if (hasSemiFinal) {
    rounds.push({
      name: 'B3',
      size: 2,
      matches: 1,
      round_number: roundNum,
      is_bronze: true
    });
  }

  return {
    numEntrants,
    bracketSize,
    numByes,
    rounds: rounds.filter(r => !r.is_bronze),
    bronzeMatch: hasSemiFinal,
    totalMatches: calculateTotalMatches(numEntrants)
  };
}

/**
 * Distribui os entrants na chave seguindo o padrão oficial World Boccia
 * Seeds melhores pegam byes e são distribuídos para evitar confrontos precoces
 * @param {Array} entrants - Lista de entrants ordenados por seed
 * @param {Object} structure - Estrutura da chave
 * @returns {Array} - Slots da primeira rodada com entrants ou byes
 */
export function distributeEntrants(entrants, structure) {
  const { bracketSize, numByes } = structure;
  
  // Criar slots vazios
  const slots = Array(bracketSize).fill(null).map((_, i) => ({
    position: i + 1,
    entrant: null,
    is_bye: false
  }));

  // Ordenar entrants por seed (1 = melhor)
  const sortedEntrants = [...entrants].sort((a, b) => {
    const seedA = a.seed || 999;
    const seedB = b.seed || 999;
    return seedA - seedB;
  });

  // Padrão de distribuição seguindo World Boccia
  // Os melhores seeds ficam nas "extremidades" da chave
  const distribution = generateDistributionPattern(bracketSize);

  // Distribuir byes primeiro (para os melhores seeds)
  for (let i = 0; i < numByes; i++) {
    slots[distribution[i] - 1].is_bye = true;
  }

  // Distribuir entrants
  let entrantIndex = 0;
  for (let i = numByes; i < bracketSize; i++) {
    if (entrantIndex < sortedEntrants.length) {
      slots[distribution[i] - 1].entrant = sortedEntrants[entrantIndex];
      entrantIndex++;
    }
  }

  return slots;
}

/**
 * Gera padrão de distribuição seguindo lógica World Boccia
 * Exemplo para 8 atletas:
 * Posição 1: Seed 1 (melhor)
 * Posição 8: Seed 2
 * Posição 5: Seed 3
 * Posição 4: Seed 4
 * Posição 3: Seed 5
 * Posição 6: Seed 6
 * Posição 7: Seed 7
 * Posição 2: Seed 8
 */
function generateDistributionPattern(size) {
  if (size === 2) return [1, 2];
  if (size === 4) return [1, 4, 3, 2];
  if (size === 8) return [1, 8, 5, 4, 3, 6, 7, 2];
  if (size === 16) return [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2];
  if (size === 32) return [
    1, 32, 17, 16, 9, 24, 25, 8,
    5, 28, 21, 12, 13, 20, 29, 4,
    3, 30, 19, 14, 11, 22, 27, 6,
    7, 26, 23, 10, 15, 18, 31, 2
  ];

  // Para tamanhos maiores, usar padrão padrão simples
  return Array.from({ length: size }, (_, i) => i + 1);
}

/**
 * Calcula total de jogos na eliminatória
 * Fórmula: (N-1) jogos na chave principal + 1 jogo de bronze se tiver SF
 */
function calculateTotalMatches(numEntrants) {
  const mainMatches = numEntrants - 1; // Todos menos o campeão
  const hasBronze = numEntrants > 2; // Tem disputa de 3º se tiver mais de 2
  return mainMatches + (hasBronze ? 1 : 0);
}

/**
 * Retorna o nome da rodada baseado no tamanho
 */
function getRoundName(size) {
  switch (size) {
    case 2: return 'F';     // Final
    case 4: return 'SF';    // Semifinal
    case 8: return 'QF';    // Quartas de Final
    case 16: return 'R16';  // Oitavas de Final
    case 32: return 'R32';  // 32-avos de Final
    case 64: return 'R64';
    default: return `R${size}`;
  }
}

/**
 * Gera os confrontos (matches) da primeira rodada
 * @param {Array} slots - Slots distribuídos
 * @param {string} classCode - Código da classe
 * @returns {Array} - Lista de confrontos
 */
export function generateFirstRoundMatches(slots, classCode) {
  const matches = [];
  
  for (let i = 0; i < slots.length; i += 2) {
    const slotA = slots[i];
    const slotB = slots[i + 1];
    
    // Se ambos são bye, não criar jogo
    if (slotA.is_bye && slotB.is_bye) continue;
    
    // Se um dos lados é bye, o outro passa direto
    if (slotA.is_bye || slotB.is_bye) {
      matches.push({
        position_a: slotA.position,
        position_b: slotB.position,
        entrant_a: slotA.is_bye ? null : slotA.entrant,
        entrant_b: slotB.is_bye ? null : slotB.entrant,
        has_bye: true,
        class_code: classCode
      });
    } else {
      // Jogo normal
      matches.push({
        position_a: slotA.position,
        position_b: slotB.position,
        entrant_a: slotA.entrant,
        entrant_b: slotB.entrant,
        has_bye: false,
        class_code: classCode
      });
    }
  }
  
  return matches;
}

/**
 * Cria a estrutura completa do KO para salvar no banco
 * @param {number} competitionId
 * @param {string} classCode
 * @param {Object} structure
 * @returns {Array} - Estrutura KO para inserir no banco
 */
export function createKOStructureForDB(competitionId, classCode, structure) {
  const koStructure = [];
  let structureId = 1;

  // Mapear rounds para IDs
  const roundsMap = {};

  // Criar estrutura de cada round
  for (let i = 0; i < structure.rounds.length; i++) {
    const round = structure.rounds[i];
    const nextRound = structure.rounds[i + 1];

    for (let matchNum = 1; matchNum <= round.matches; matchNum++) {
      const slotLabel = `${round.name}${round.matches > 1 ? matchNum : ''}`;
      
      // Determinar para onde o vencedor vai
      let feedsIntoId = null;
      if (nextRound) {
        const nextMatchNum = Math.ceil(matchNum / 2);
        feedsIntoId = `${nextRound.name}${nextRound.matches > 1 ? nextMatchNum : ''}`;
      }

      koStructure.push({
        id: structureId,
        competition_id: competitionId,
        class_code: classCode,
        round_name: round.name,
        match_number: matchNum,
        slot_label: slotLabel,
        position: structureId,
        feeds_into_label: feedsIntoId
      });

      roundsMap[slotLabel] = structureId;
      structureId++;
    }
  }

  // Adicionar disputa de 3º lugar
  if (structure.bronzeMatch) {
    koStructure.push({
      id: structureId,
      competition_id: competitionId,
      class_code: classCode,
      round_name: 'B3',
      match_number: 1,
      slot_label: 'B3',
      position: structureId,
      feeds_into_label: null
    });
  }

  // Resolver feeds_into_id para IDs reais
  koStructure.forEach(slot => {
    if (slot.feeds_into_label) {
      slot.feeds_into_id = roundsMap[slot.feeds_into_label];
    }
    delete slot.feeds_into_label;
  });

  return koStructure;
}

/**
 * Função principal que gera toda a chave eliminatória
 * @param {number} competitionId
 * @param {string} classCode
 * @param {Array} entrants - Entrants ordenados por seed
 * @returns {Object} - Dados completos da chave
 */
export function generateEliminatoriaDraw(competitionId, classCode, entrants) {
  // 1. Gerar estrutura da chave
  const structure = generateKnockoutStructure(entrants.length);
  
  // 2. Distribuir entrants nos slots
  const slots = distributeEntrants(entrants, structure);
  
  // 3. Gerar confrontos da primeira rodada
  const firstRoundMatches = generateFirstRoundMatches(slots, classCode);
  
  // 4. Criar estrutura KO para o banco
  const koStructure = createKOStructureForDB(competitionId, classCode, structure);
  
  return {
    structure,
    slots,
    firstRoundMatches,
    koStructure,
    summary: {
      total_entrants: entrants.length,
      bracket_size: structure.bracketSize,
      num_byes: structure.numByes,
      total_matches: structure.totalMatches,
      rounds: structure.rounds.map(r => r.name)
    }
  };
}

export default {
  generateKnockoutStructure,
  distributeEntrants,
  generateFirstRoundMatches,
  createKOStructureForDB,
  generateEliminatoriaDraw
};