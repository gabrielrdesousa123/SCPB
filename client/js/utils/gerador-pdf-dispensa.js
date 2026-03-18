// client/js/utils/gerador-pdf-dispensa.js

// Função para tratar o texto e o gênero do árbitro
function formatarDadosDispensa(arbitro, instituicao, evento) {
    const isMasc = arbitro.genero === 'M';
    
    const pronomeSr = isMasc ? 'do Sr.' : 'da Sra.';
    const registrado = isMasc ? 'registrado' : 'registrada';
    const portador = isMasc ? 'portador' : 'portadora';
    
    let funcao = evento.funcao; 
    if (!isMasc && funcao.toLowerCase() === 'árbitro') {
        funcao = 'Árbitra';
    }

    const dataAtual = new Date();
    const opcoesData = { day: '2-digit', month: 'long', year: 'numeric' };
    const dataFormatada = dataAtual.toLocaleDateString('pt-BR', opcoesData);

    return {
        dataEmissao: `Rio de Janeiro, ${dataFormatada}.`,
        instituicaoNome: instituicao.nome_local,
        instituicaoResp: `${instituicao.nome_responsavel} - ${instituicao.cargo_responsavel}`,
        textoConvocacao: `Encaminhamos a V.S.ª conforme preceitua o artigo 84, em seus parágrafos 01 e 02, da lei número 9.615 de 24 de março de 1988, a CONVOCAÇÃO e SOLICITAÇÃO DE DISPENSA para integrar representação desportiva nacional ${pronomeSr} ${arbitro.nome}, ${registrado} no CPF sob o Nº ${arbitro.cpf} e ${portador} do RG ${arbitro.rg}.`,
        textoEvento: `Esse estará atuando na condição de ${funcao} na execução do ${evento.nome_campeonato} a ser realizado na cidade de ${evento.local}, no período de ${evento.data_inicio} á ${evento.data_fim}.`
    };
}

// Template HTML Oficial do PDF
const templateHTML = `
    <div style="font-family: 'Arial', sans-serif; color: #000; line-height: 1.5; font-size: 11pt; padding: 20mm 25mm; position: relative; min-height: 1024px; background: white;">
        
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="URL_DA_LOGO_ANDE_AQUI" style="max-width: 250px;" alt="ANDE Logo">
        </div>

        <div style="text-align: right; margin-bottom: 40px;">
            {{dataEmissao}}
        </div>

        <div style="margin-bottom: 40px; font-weight: bold; line-height: 1.3;">
            À instituição<br>
            {{instituicaoNome}}<br>
            {{instituicaoResp}}
        </div>

        <div style="font-weight: bold; margin-bottom: 30px;">
            Assunto: Declaração de Convocação e Dispensa
        </div>

        <div style="text-align: justify; margin-bottom: 20px;">
            {{textoConvocacao}}
        </div>

        <div style="text-align: justify; margin-bottom: 20px;">
            {{textoEvento}}
        </div>

        <div style="text-align: justify; margin-bottom: 20px;">
            Esperançosos de poder contar com a gentil colaboração de V.Sª que agradecemos antecipadamente, valemo-nos do ensejo para enviar nossas cordiais saudações.
        </div>

        <div style="text-align: justify; margin-bottom: 20px;">
            Atenciosamente,
        </div>

        <div style="text-align: center; margin-top: 60px;">
            <img src="URL_DA_ASSINATURA_AQUI" style="max-height: 120px; margin-bottom: -15px;" alt="Assinatura Leonardo"><br>
            <div style="font-weight: bold; border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 300px;">
                LEONARDO BAIDECK<br>
                <span style="font-weight: normal;">Diretor Técnico</span>
            </div>
        </div>

        <div style="position: absolute; bottom: 20px; left: 0; width: 100%; text-align: center; font-size: 8pt; color: #333; padding: 0 25mm;">
            <div style="border-top: 4px solid #1e3a8a; margin-bottom: 10px;"></div>
            Rua Antônio Batista Bittencourt, 17/sala 201 Recreio dos Bandeirantes - Rio de Janeiro/RJ<br>
            CEP: 22.790-250 Telefone: (21) 2220-1314 - Fax (21) 2220-1914 / e-mail: ande@ande.org.br<br>
            www.ande.org.br
        </div>
    </div>
`;

// Função que será exportada e usada pelo Administrador para gerar o arquivo
export function gerarConteudoDocumento(arbitro, instituicao, evento) {
    const dadosFormataos = formatarDadosDispensa(arbitro, instituicao, evento);
    
    let htmlFinal = templateHTML;
    htmlFinal = htmlFinal.replace('{{dataEmissao}}', dadosFormataos.dataEmissao);
    htmlFinal = htmlFinal.replace('{{instituicaoNome}}', dadosFormataos.instituicaoNome);
    htmlFinal = htmlFinal.replace('{{instituicaoResp}}', dadosFormataos.instituicaoResp);
    htmlFinal = htmlFinal.replace('{{textoConvocacao}}', dadosFormataos.textoConvocacao);
    htmlFinal = htmlFinal.replace('{{textoEvento}}', dadosFormataos.textoEvento);

    return htmlFinal;
}