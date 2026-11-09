## Endereço atual do X-Meeting

O X-Meeting 2027 é publicado separadamente em https://xmeeting27.ab3c.org/ pelo repositório `hylixinsights/xmeeting2027`. Os links institucionais usam esse subdomínio. O snapshot em `public/xmeeting27/` permanece como compatibilidade do endereço anterior.

# AB3C — landing page institucional

Página estática em português e inglês, criada em projeto independente do X-Meeting. Usa Astro, TypeScript e D3 (`d3-selection`), sem cadastro, pagamentos ou backend. Publicação pelo GitHub Pages no domínio `https://ab3c.org/`, com o evento em `https://ab3c.org/xmeeting27/`.

## Executar e revisar

Requer Node.js compatível com Astro 7; o ambiente de desenvolvimento usa Node 26.

```bash
npm install
npm run visualizar  # inicia/reutiliza a prévia e abre o Google Chrome
npm run dev         # desenvolvimento com atualização automática; porta 4310
npm run media:hero  # regenera a sequência de abertura a partir do MP4 original
npm run prepare:event # atualiza a cópia de distribuição do X-Meeting a partir do projeto irmão
npm run check       # verificação de tipos e componentes
npm run test:hero   # regressão da rolagem, carregamento e fallbacks
npm run build       # gera os arquivos estáticos em dist/
npm run preview     # serve o build; porta 4311
```

Prévia de desenvolvimento: `http://127.0.0.1:4310/`. Prévia do build: `http://127.0.0.1:4311/`. Se a porta estiver ocupada, use o endereço efetivamente informado pelo servidor.

O servidor iniciado pelo atalho permanece disponível após abrir o Chrome. Para encerrá-lo, execute `npx astro dev stop` nesta pasta. Quando o servidor estiver sendo executado em primeiro plano, encerre com `Ctrl+C`. Salvar alterações atualiza a prévia de desenvolvimento; o comando `preview` exige um novo build para refletir alterações.

## Organização dos arquivos

| Arquivo ou pasta | Conteúdo |
| --- | --- |
| `src/data/site.ts` | Origem, link do evento, logo e configurações de mídia |
| `src/data/translations.ts` | Textos da página, metadados e rótulos acessíveis PT/EN |
| `src/data/network-labels.ts` | Rótulos e mensagens PT/EN da rede interativa |
| `src/data/network.json` | Nós e conexões demonstrativos, separados da visualização |
| `src/components/LandingPage.astro` | Estrutura institucional compartilhada pelos dois idiomas |
| `src/components/HeroMedia.astro` | Poster responsivo e canvas da sequência de abertura |
| `src/scripts/main.ts` | Idioma, movimento e carregamento da rede sob demanda |
| `src/scripts/hero-sequence.ts` | Progresso de rolagem, desenho no canvas e cache limitado de quadros |
| `src/scripts/network.ts` | Visualização D3, seleção de conexões e alternativa textual |
| `src/styles/global.css` | Layout, identidade visual e comportamento responsivo |
| `src/styles/sequence-theme.css` | Gradiente verde escuro, contraste e composição da abertura |
| `public/ab3c/` | Recursos institucionais públicos, incluindo `logo.jpeg` |
| `public/ab3c/hero-sequence/` | Manifesto, posters e quadros WebP servidos pela página |
| `Images/Video_logo.mp4` | Vídeo original, separado dos recursos publicados |
| `scripts/prepare-hero-sequence.mjs` | Extração, otimização e validação dos quadros |
| `.preview/hero-sequence-qa/` | Referências decodificadas e relatório de qualidade, fora do build |
| `scripts/visualizar.mjs` | Abertura da prévia no Chrome |
| `scripts/event-preview.mjs` | Acesso local, somente leitura, ao build existente do evento |
| `astro.config.mjs` | Domínio, saída estática e integração da prévia local |

A página importa `src/styles/global.css` e, em seguida, `src/styles/sequence-theme.css`; usa Libre Franklin. Os arquivos antigos em `src/taste/` e `public/taste/` foram conservados, mas não são usados pelo layout atual. Uma cópia do design anterior está em `.preview/design-before-scroll-2026-11-09.tgz`.

## Idiomas e acesso sem JavaScript

`/` entrega HTML completo em português e `/en/` entrega HTML completo em inglês. Os seletores continuam sendo links válidos sem JavaScript. Com JavaScript, a troca atualiza textos, rótulos acessíveis, metadados, idioma do documento e endereço, preservando a seção visível. A preferência é lembrada no armazenamento local do navegador; sem acesso a esse armazenamento, a troca continua funcionando.

A primeira visita à raiz usa português. Ao voltar à raiz com inglês salvo, a página aplica a preferência. O conteúdo institucional, os links e a alternativa estática/textual da comunidade permanecem disponíveis sem JavaScript.

## Logo e sequência de abertura

O original fornecido permanece em `Images/AB3C_logo.jpeg`; a cópia servida está em `public/ab3c/logo.jpeg`. Substitua essa cópia mantendo as proporções, ou atualize `site.logo` em `src/data/site.ts` caso o nome/formato mude. O componente usa a imagem oficial sem redesenhá-la.

O vídeo fornecido, `Images/Video_logo.mp4`, é a origem da animação da AB3C. Ele permanece separado dos arquivos públicos: a página recebe quadros WebP e não baixa o MP4. A sequência mostra a composição científica e a formação do logo existentes no vídeo, sem reconstrução no navegador, câmera adicional ou interpolação de movimento.

Para regenerar os recursos, instale `ffmpeg`, `ffprobe` e `cwebp`, disponíveis no `PATH`, e execute:

```bash
npm run media:hero
```

Os executáveis também podem ser definidos pelas variáveis `FFMPEG`, `FFPROBE` e `CWEBP`. O comando chama `scripts/prepare-hero-sequence.mjs`; para outra origem, use `node scripts/prepare-hero-sequence.mjs caminho/do/video.mp4`. Ao trocar o vídeo, confira a cor, a composição e o peso dos novos recursos antes de publicar.

A preparação usa **FFmpeg → PNG RGB temporário → cwebp**, porque o build local do FFmpeg não contém o codificador WebP. Os PNGs temporários são removidos ao terminar. A extração não amplia a resolução original e descarta o áudio. O script confere a numeração e os arquivos gerados, substitui somente suas pastas de saída e grava `manifest.json` por último, com substituição atômica. O manifesto informa dimensões, taxa de amostragem, contagem real, bytes e URLs relativas ao caminho-base, com índices a partir de zero.

O original tem 1280 × 720 pixels, 24 fps, 10 segundos e 240 quadros. O primeiro quadro é extraído explicitamente; o último quadro decodificado é acrescentado após a amostragem regular para preservar o encerramento real. Por isso, use a contagem do manifesto, sem deduzi-la de duração × fps.

| Variante | Dimensões | Amostragem | Quadros reais | Total dos quadros | Poster inicial |
| --- | --- | --- | --- | --- | --- |
| Desktop | 1280 × 720 | 12 fps | 121 | 3.617.492 bytes | 4.586 bytes |
| Mobile | 768 × 432 | 8 fps | 81 | 1.262.756 bytes | 1.746 bytes |

Esses totais descrevem todos os arquivos de cada variante, não o carregamento inicial da página. Os posters vêm do primeiro quadro do próprio vídeo. Os quadros usam WebP com qualidade 80 no desktop e 76 no mobile; os posters usam 82 e 80, respectivamente.

A origem declara matriz YCbCr `smpte170m`, faixa limitada (`tv`), primárias `bt709` e transferência sRGB (`iec61966-2-1`). A conversão respeita essa matriz e transforma os pixels em RGB de faixa completa, sem correção de cor, mudança de gama ou troca indevida da matriz para BT.709. A comparação visual preservou os verdes e cianos da origem. O SSIM RGB entre referência decodificada e WebP, no primeiro/meio/último quadro, foi **0,995 / 0,978 / 0,985** no desktop e **0,985 / 0,966 / 0,970** no mobile. As referências e métricas completas ficam em `.preview/hero-sequence-qa/`.

## Rolagem, composição e movimento

A rolagem nativa controla diretamente o quadro desenhado no canvas; voltar a página recua a sequência. O texto e os botões continuam em HTML independente da mídia. A composição conserva o enquadramento completo (`contain`), sem recortar o logo; os textos ficam sobre o vídeo, com o nome da área no alto e a mensagem menor, centralizada abaixo do logo. A abertura não contém botões; o menu superior leva diretamente ao conteúdo e ao evento.

Os textos da abertura aparecem somente com a formação do logo, entre 70% e 75% dos quadros, e desaparecem ao recuar para antes desse trecho. A opacidade acompanha o quadro efetivamente desenhado, inclusive durante carregamento lento. Sem animação, os textos permanecem visíveis no hero estático.

Em larguras a partir de 1000 px, a abertura pode permanecer em posição `sticky` durante um trecho de rolagem equivalente a **1,5 vez a altura da janela**, desde que caiba integralmente abaixo do cabeçalho. Em telas menores ou com altura insuficiente, a página segue sem fixar a abertura. A variante de 768 px é selecionada abaixo de 900 px. Esses limites e a distância de rolagem podem ser ajustados em `src/scripts/hero-sequence.ts` e devem ser conferidos após qualquer alteração de layout.

O carregamento prioriza o quadro solicitado e seus vizinhos, com cache limitado. O motor usa oito quadros no desktop e seis no mobile, com até três e duas requisições simultâneas, respectivamente. São parâmetros configuráveis em `src/scripts/hero-sequence.ts`, confirmados na implementação; confira-os novamente se alterar o motor. Não carregue nem decodifique a sequência inteira de uma vez.

O poster aparece antes da sequência e permanece como alternativa estática. A preferência do sistema por movimento reduzido, JavaScript desativado e o parâmetro `?motion=static` permitem uma abertura estática sem reservar o espaço extra da animação. O link Associação no cabeçalho leva diretamente ao conteúdo seguinte. Os textos acompanham português e inglês; teste também `/en/?motion=static`.

## Atualizar a rede

Substitua `src/data/network.json` mantendo a estrutura:

```json
{
  "nodes": [
    { "id": "pessoa-1", "type": "person", "label": { "pt": "Pessoa 1", "en": "Person 1" }, "x": 180, "y": 180 },
    { "id": "tema-1", "type": "topic", "label": { "pt": "Genômica", "en": "Genomics" }, "x": 430, "y": 270 }
  ],
  "links": [{ "source": "pessoa-1", "target": "tema-1" }]
}
```

Os `id` devem ser únicos; `source` e `target` referenciam esses identificadores. `type` aceita `person` ou `topic`. Cada rótulo tem `pt` e `en`. As coordenadas `x` e `y` são opcionais, no espaço de referência de 860 × 540; sem elas, o componente distribui os nós em círculo.

Os dados atuais são conceituais: não representam pessoas, vínculos nem relações reais. Ao receber dados confirmados, atualize também a explicação e os rótulos pertinentes. A visualização distingue pessoas e temas por forma e cor, destaca conexões por foco/clique/toque e permite limpar a seleção. A alternativa textual descreve os temas e suas conexões ilustrativas. D3 e os dados são carregados quando a seção se aproxima da tela; a rede não mantém um ciclo de animação nem captura a rolagem vertical.

## Coexistência com o X-Meeting

Na prévia local, `/xmeeting27/` usa a cópia de distribuição em `public/xmeeting27/`. Se ela ainda não existir durante o desenvolvimento, o middleware pode ler o build em `../Xmeeting2027/dist/`, adaptando o caminho apenas na resposta, sem alterar o projeto irmão. A prévia do build serve exclusivamente os arquivos gerados em `dist/`.

Para a hospedagem, `public/xmeeting27/` contém uma cópia estática do evento, compilada separadamente com `SITE_URL=https://ab3c.org` e `BASE_PATH=/xmeeting27`. O código-fonte do evento continua no projeto irmão. Para atualizar essa cópia, execute `npm run prepare:event`; o script usa uma pasta temporária isolada, sem modificar os arquivos originais. Depois, revise a prévia e inclua os arquivos atualizados no próximo commit.

## Publicação automática e domínio

Repositório: [hylixinsights/ab3c](https://github.com/hylixinsights/ab3c). O workflow `.github/workflows/deploy.yml` usa Node 26, instala as versões travadas, verifica os componentes e a sequência, gera `dist/` e publica o artefato completo no GitHub Pages. Cada push para `main` atualiza a AB3C e o snapshot do evento juntos. O build não depende de acesso ao projeto irmão no servidor.

Em **Settings → Pages**, a origem deve ser **GitHub Actions** e o domínio personalizado deve ser **ab3c.org**. A configuração real fica no GitHub; o arquivo `public/CNAME` registra a intenção, mas não substitui a configuração de Pages em publicações por Actions.

Na GoDaddy, abra **Portfólio de domínios → ab3c.org → DNS** e configure:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | hylixinsights.github.io |

Use TTL padrão ou 1 hora. Substitua os registros A antigos de `@` e edite o CNAME existente de `www`, evitando entradas conflitantes. Não altere os servidores de nomes nem registros de email ou verificação. Configure o domínio no GitHub antes de apontar o DNS. Após a validação e emissão do certificado, habilite **Enforce HTTPS** em Pages.

Documentação: [domínio personalizado no GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [registros A na GoDaddy](https://www.godaddy.com/pt-br/help/adicionar-ou-editar-um-registro-a-42546) e [CNAME na GoDaddy](https://www.godaddy.com/pt-br/help/adicionar-um-registro-cname-19236).

## Verificação antes de publicar

Execute `npm run check` e `npm run build`; revise os dois idiomas, o layout móvel, a navegação por teclado, a rede, a preferência por movimento reduzido e o conteúdo sem JavaScript. Na abertura, confira avanço e retorno pela rolagem, preservação do último quadro, ausência de recorte do logo, acesso direto pelo cabeçalho e `?motion=static`, inclusive em telas baixas. Se regenerar a mídia, confira o manifesto e as referências de qualidade antes do build. Teste também os links do evento na hospedagem final. A execução dos comandos acima é parte da verificação, não uma indicação de que a publicação já ocorreu.

Referências: [configuração do Astro](https://docs.astro.build/en/reference/configuration-reference/) e [D3 Selection](https://d3js.org/d3-selection).
