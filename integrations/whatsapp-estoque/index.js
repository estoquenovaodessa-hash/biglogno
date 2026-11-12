// Bot de Estoque Bignotto — resposta original do grupo mantida.
// Adição: solicitação de etiquetas 60x30mm à fila Argox do BigLog.
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const { solicitarEtiquetasDoBot, identificarMensagemWhatsApp, iniciarReenvioAutomatico } = require('./print-client');

// Inicializa o cliente com persistência de sessão (inalterado).
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('Escaneie o QR Code abaixo com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot de Estoque Online e operando!');
    iniciarReenvioAutomatico();
});

// Mesmo ID do grupo da instalação original; não modifica grupos ou comandos.
const ID_GRUPO_LOGISTICA = '120363404341601301@g.us';

client.on('message', async (msg) => {
    if (msg.from !== ID_GRUPO_LOGISTICA) return;

    const linhas = msg.body.split('\n').map(l => l.trim()).filter(l => l !== "");
    let itensParaBuscar = [];
    let nomeEmpresa = "Não informada";

    // Formato ORIGINAL preservado: códigos e quantidade em linhas com hífen;
    // empresa informada em linha separada, sem mudar a orientação do grupo.
    linhas.forEach(linha => {
        if (linha.includes('-')) {
            const [codigo, qtd] = linha.split('-').map(s => s.trim());
            itensParaBuscar.push({ codigo, qtd });
        } else if (/^[a-zA-Záàâãéèêíïóôõöúçñ\s]+$/.test(linha)) {
            nomeEmpresa = linha.toUpperCase();
        }
    });

    if (itensParaBuscar.length === 0) return;

    // Captura a identidade antes de responder a mensagem.
    // Algumas versoes da biblioteca entregam id.id em vez de id._serialized.
    // O identificador e usado somente para prevenir etiquetas duplicadas.
    let identificadorImpressao = null;
    try {
        identificadorImpressao = identificarMensagemWhatsApp(msg);
    } catch (erro) {
        console.error('[Argox] Sem identificacao segura da mensagem:', erro.message);
    }

    let dadosEstoque = [];
    fs.createReadStream('estoque.csv')
        .pipe(iconv.decodeStream('win1252'))
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
            const cleanRow = {};
            Object.keys(row).forEach(key => {
                const cleanKey = key.replace(/[^\x20-\x7E]/g, "").trim().toLowerCase();
                cleanRow[cleanKey] = row[key].replace(/[^\x20-\x7E]/g, "").trim();
            });
            dadosEstoque.push(cleanRow);
        })
        .on('end', async () => {
            let resposta = "🏢 *DESTINO:* " + nomeEmpresa + "\n";
            resposta += "─────────────────\n";
            const etiquetas = [];

            itensParaBuscar.forEach(itemPedido => {
                const colCodigo = Object.keys(dadosEstoque[0] || {}).find(k => k.includes('cod'));
                const produto = dadosEstoque.find(d => d[colCodigo] === itemPedido.codigo);

                if (produto) {
                    const colDesc = Object.keys(produto).find(k => k.includes('desc'));
                    const colEnd = Object.keys(produto).find(k => k.includes('end'));

                    // Texto da RESPOSTA DO WHATSAPP: igual ao bot instalado.
                    resposta += "✅ *" + itemPedido.codigo + "* (" + itemPedido.qtd + ")\n";
                    resposta += "📦 " + produto[colDesc] + "\n";
                    resposta += "📍 Endereço: *" + produto[colEnd] + "*\n";

                    // Um código encontrado = uma etiqueta. NÃO envia quantidade:
                    // a etiqueta terá campo vazio para preenchimento à mão.
                    etiquetas.push({
                        code: itemPedido.codigo,
                        description: produto[colDesc] || ""
                    });
                } else {
                    resposta += "❌ *" + itemPedido.codigo + "* - Não encontrado\n";
                }
                resposta += "─────────────────\n";
            });

            // A resposta do grupo acontece independentemente da impressora.
            try {
                await msg.reply(resposta);
            } catch (error) {
                console.error('[WhatsApp] Não foi possível enviar a resposta:', error.message);
            }

            if (!etiquetas.length || !identificadorImpressao) return;
            try {
                const result = await solicitarEtiquetasDoBot({
                    messageId: identificadorImpressao,
                    company: nomeEmpresa,
                    items: etiquetas
                });
                if (result.skipped) {
                    console.warn('[Argox] Solicitação não enviada:', result.reason);
                } else if (result.pending) {
                    console.warn('[Argox] Pedido salvo para reenvio automático (' + result.labels +
                        ' etiqueta(s)): ' + result.reason);
                } else {
                    console.log('[Argox] ' + result.labels +
                        ' etiqueta(s) solicitadas na fila do BigLog; ' +
                        result.batches + ' lote(s).');
                }
            } catch (error) {
                // Uma falha da Argox NUNCA bloqueia a resposta do WhatsApp.
                console.error('[Argox] Falha na impressão automática:', error.message);
            }
        })
        .on('error', (error) => {
            console.error('[Estoque] Falha ao ler estoque.csv:', error.message);
        });
});

client.initialize();
