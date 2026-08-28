// Gera os ícones do PWA sem depender de editor de imagem nem de biblioteca.
//
// Os que estavam no lugar eram placeholders de 1×1 pixel, mas o manifest os
// declarava como 192×192 e 512×512. O Chrome confere a dimensão real do
// arquivo e, não batendo, o app deixa de ser instalável — sem erro visível,
// só o botão de instalar que não aparece.
//
// Desenha em memória com supersampling e escreve PNG na mão: cabeçalho,
// IHDR, IDAT com zlib e IEND. É menos código do que parece e evita trazer
// uma dependência de imagem para um arquivo que muda de ano em ano.
//
//   node scripts/gerar-icones.js

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MARCA = [0x00, 0x79, 0x6b];   // #00796b, o verde da farmácia
const CLARO = [0xff, 0xff, 0xff];

// --- PNG ------------------------------------------------------------------

const TABELA_CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
    const nome = Buffer.from(tipo, 'ascii');
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([nome, dados])));
    return Buffer.concat([tamanho, nome, dados, crc]);
}

function paraPng(rgba, lado) {
    // Cada linha do PNG começa com o byte do filtro; 0 = nenhum.
    const linhas = Buffer.alloc((lado * 4 + 1) * lado);
    for (let y = 0; y < lado; y++) {
        const destino = y * (lado * 4 + 1);
        linhas[destino] = 0;
        rgba.copy(linhas, destino + 1, y * lado * 4, (y + 1) * lado * 4);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(lado, 0);
    ihdr.writeUInt32BE(lado, 4);
    ihdr[8] = 8;    // bits por canal
    ihdr[9] = 6;    // RGBA
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // filtro adaptativo
    ihdr[12] = 0;   // sem entrelaçamento

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        bloco('IHDR', ihdr),
        bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
        bloco('IEND', Buffer.alloc(0)),
    ]);
}

// --- desenho --------------------------------------------------------------

// Distância de um ponto ao retângulo de cantos arredondados, em coordenadas
// de −1 a 1. Negativa dentro da forma, positiva fora.
function distanciaRetangulo(x, y, largura, altura, raio) {
    const dx = Math.abs(x) - (largura - raio);
    const dy = Math.abs(y) - (altura - raio);
    const fora = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    return fora + Math.min(Math.max(dx, dy), 0) - raio;
}

// A cápsula é o símbolo mais legível de farmácia em 192 pixels: um "B" ou o
// nome inteiro viram borrão nesse tamanho.
function corDoPonto(x, y, cheio) {
    // `cheio` sangra até a borda (ícone comum). O maskable precisa do
    // conteúdo dentro do círculo central de 80%, senão o Android corta.
    const escala = cheio ? 1 : 0.62;

    const fundo = distanciaRetangulo(x, y, 1, 1, cheio ? 0.28 : 0.30);
    if (fundo > 0) return null;

    // Cápsula deitada a 45 graus.
    const cos = Math.SQRT1_2;
    const rx = (x * cos + y * cos) / escala;
    const ry = (-x * cos + y * cos) / escala;

    const capsula = distanciaRetangulo(rx, ry, 0.62, 0.30, 0.30);
    if (capsula < 0) {
        // A faixa divisória, que dá a leitura de cápsula em vez de pílula.
        const divisao = Math.abs(rx) < 0.035;
        return divisao ? MARCA : CLARO;
    }
    return MARCA;
}

function desenhar(lado, cheio) {
    const AMOSTRAS = 4;   // supersampling: sem isto a borda fica serrilhada
    const rgba = Buffer.alloc(lado * lado * 4);

    for (let py = 0; py < lado; py++) {
        for (let px = 0; px < lado; px++) {
            let r = 0, g = 0, b = 0, a = 0;

            for (let sy = 0; sy < AMOSTRAS; sy++) {
                for (let sx = 0; sx < AMOSTRAS; sx++) {
                    const x = ((px + (sx + 0.5) / AMOSTRAS) / lado) * 2 - 1;
                    const y = ((py + (sy + 0.5) / AMOSTRAS) / lado) * 2 - 1;
                    const cor = corDoPonto(x, y, cheio);
                    if (cor) { r += cor[0]; g += cor[1]; b += cor[2]; a += 255; }
                }
            }

            const total = AMOSTRAS * AMOSTRAS;
            const i = (py * lado + px) * 4;
            const opacos = a / 255;
            // Divide a cor pelos subpontos opacos, senão a borda escurece.
            rgba[i] = opacos ? Math.round(r / opacos) : 0;
            rgba[i + 1] = opacos ? Math.round(g / opacos) : 0;
            rgba[i + 2] = opacos ? Math.round(b / opacos) : 0;
            rgba[i + 3] = Math.round(a / total);
        }
    }
    return rgba;
}

const destino = path.join(__dirname, '..', 'web', 'public', 'icons');
fs.mkdirSync(destino, { recursive: true });

const ARQUIVOS = [
    { nome: 'icon-192.png', lado: 192, cheio: true },
    { nome: 'icon-512.png', lado: 512, cheio: true },
    { nome: 'icon-maskable-512.png', lado: 512, cheio: false },
    { nome: 'apple-touch-icon.png', lado: 180, cheio: true },
];

for (const { nome, lado, cheio } of ARQUIVOS) {
    const png = paraPng(desenhar(lado, cheio), lado);
    fs.writeFileSync(path.join(destino, nome), png);
    console.log(`  ${nome}: ${lado}x${lado}, ${(png.length / 1024).toFixed(1)} KB`);
}
console.log(`\nEm ${destino}`);
