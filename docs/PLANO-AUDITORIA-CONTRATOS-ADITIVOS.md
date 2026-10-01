# Auditoria de Contratos e Aditivos — plano para alinharmos

> **Para:** Angelo · **De:** Kauan · **Data:** 01/10/2026
> **Status (01/10/2026):** a parte do Kauan na Fase 1 (base comum: banco, API, barra de
> sincronização e tela de vínculo) está **na `main` e em produção** em
> aditivapronto.41tech.cloud. A migration 003 foi aplicada e o `AUDIT_ROBOT_TOKEN` está
> configurado. Falta o robô coletor (seção 8.4). A seção 8 traz o contrato **como foi
> implementado**. As seções 10 e 11 listam o que ainda precisamos decidir juntos.

---

## 1. O que queremos

Dois módulos novos no **Aditiva Pronto**:

- **Auditoria Contratos** (você): para cada cliente, se o contrato de prestação de
  serviços está na pasta de rede e em que estado (minuta, PDF, assinado…).
- **Auditoria Aditivos** (eu): a mesma coisa para os termos aditivos.

Nos dois módulos o usuário clica em **Sincronizar**. Um **robô**, rodando no computador
das automações (que enxerga a rede interna), varre as pastas dos clientes e devolve o
resultado para o app. O relatório na tela é atualizado.

**A ideia central do plano: um robô só, que varre a rede uma vez, e dois
classificadores, um por módulo.** O robô não sabe o que é contrato nem o que é aditivo.
Ele só coleta os arquivos que encontra (nome, tamanho, data, se o PDF tem assinatura
digital). Quem interpreta esses dados é o app, com uma regra para cada módulo. Assim:

- não varremos 513 pastas duas vezes, nem mantemos dois robôs fazendo a mesma coisa;
- cada um de nós cuida da sua regra sem mexer no código do outro;
- mudar uma regra de classificação é deploy do app. Ninguém precisa mexer no PC das automações.

---

## 2. O que já existe

| Item | Detalhe |
|------|---------|
| Repositório | `dev41tech/aditiva-pronto` (branch `main`) |
| Stack | React 18 + Vite + TanStack Query + Tailwind / Express + TypeScript / MySQL 8 (`mysql2`) |
| Deploy | Docker no EasyPanel (VPS). O backend serve o build do frontend |
| Banco | `aditiva_pronto`, **compartilhado com o Radar Societário** (as tabelas dele têm prefixo `rs_`) |
| Autenticação | Nenhuma. O app só abre pela VPN (ADR-006 em `DECISIONS.md`) |
| Empresas | Tabela `companies`, importada do Domínio Registro: CNPJ, razão social, `responsavel` e `inativo` |
| Aditivos gerados | Tabela `generated_documents`, com o histórico dos DOCX gerados pelo app |
| Automação existente | `automation/`: Node + winston + dotenv, roda no Windows. É o padrão para o robô novo |
| Testes | Nenhum ainda. A Fase 1 instala o Vitest no backend |

**Para o futuro:** está decidido migrar o Aditiva Pronto para dentro do **Connect**, depois
que o Connect estiver pronto. Por isso a separação robô ↔ app via HTTP importa: na
migração, o robô continua o mesmo e só passa a apontar para outro endereço.

---

## 3. O que a pasta de rede mostrou (levantamento de 01/10/2026)

Fiz um inventário somente leitura de `J:\` (`\\192.168.140.249\Contabilidade`). Os números
abaixo são a matéria-prima dos dois módulos.

### 3.1 Pastas de cliente

- **524** pastas na raiz e **513** no intervalo `041 CONTABILIDADE` → `ZANATO & CHAVES LTDA`.
  Fora do intervalo ficam as pastas de controle (`000_PLANILHAS…` até `015_OBRIGACOES…`) e a `ZIPADO_SCRIPT`.
- **Nem toda pasta do intervalo é cliente.** Há `CERTIFICADOS`, `SCANNER`, `TODOS CNPJ`,
  `BOLETOS SAGE`, `nProcessado`, `ignorados`, `AnyDesk`, `DEFIS ANUAL 2020`,
  `EX - FUNCIONÁRIOS 041`, pastas só com número (`439`, `486`, `493`), pastas de
  abertura de empresa etc.
  → **A lista de clientes vem do app (tabela `companies`), não das pastas.** Cada empresa
  é ligada a uma pasta. A pasta que não liga com nenhuma empresa vai para uma lista de
  "pastas não vinculadas", e alguém decide se é para vincular ou ignorar.

### 3.2 A subpasta do contrato

- **386** clientes têm subpasta de contrato de serviço e **127** não têm. **11** têm a pasta vazia.
- **26 grafias diferentes.** Só 222 usam exatamente `CONTRATO DE PRESTAÇÃO DE SERVIÇOS`:

  | Qtde | Nome da subpasta |
  |-----:|------------------|
  | 222 | CONTRATO DE PRESTAÇÃO DE SERVIÇOS |
  | 58 | CONTRATO DE SERVIÇOS |
  | 22 | CONTRATO PRESTAÇÃO DE SERVIÇOS |
  | 21 | CONTRATO DE PRESTAÇÃO DE SERVIÇO |
  | 20 | CONTRATO PRESTAÇÃO DE SERVIÇO |
  | 16 | CONTRATO SERVIÇOS |
  | 13 | CONTRATO P SERVIÇOS |
  | 3 | CONTRATO DE SERVIÇO |
  | 2 cada | CONTRATO PRESTAÇÃO SERVIÇOS, CONTRATO DE PRESTAÇÃO |
  | 1 cada | `…PRESTAÇÃAO…`, `…PRESTAÇAÕDE…`, `CONTRATO PREST SERVIÇOS`, `CONTRATOS DE SERVIÇOS`, `CONTRATO DE HONORÁRIOS`, `CONTRATO DE SERVIÇOS INOVATI`, `…RDS`, `…BLINDAGEM`, `…CONTÁBEIS` |

- Também casam com "CONTRAT", mas **não são** o contrato com a 41: `CONTRATO DE ALUGUEL`,
  `CONTRATOS LOCAÇÃO`, `CONTRATO COWORKING`, `ALTERAÇAO CONTRATUAL`, `MODELO CONTRATO SERVIÇOS`.
  → Procurar a subpasta pelo nome exato deixa 40% dos clientes de fora. A busca precisa
  aceitar as variações, e a regra fica numa configuração do app, não no código do robô.

### 3.3 Os arquivos dentro dela

- **1.551 arquivos** em 375 clientes: 949 PDF, 556 DOCX, 20 XLSX, 22 imagens, e ainda `.opus`, `.lnk`, `.msg`, `.txt`.
- **56** arquivos estão em sub-subpastas: `Termo Aditivo 13º`, `CONTRATO EMPRESA NOVA`,
  `CONTRATO PRESTAÇÃO DE SERVIÇOS (ANTIGO)`, `DISTRATO (ANTIGO)`, `MODELO`. Por isso a varredura precisa ser recursiva.
- **179** arquivos não são contrato nem aditivo: boletos, "ACORDO SKAY", carta/termo de
  transferência de contabilidade, tabela de serviços extras, distrato.

**Aditivos** (meu lado):
- 771 arquivos com "ADITIV" no nome, em 271 clientes. **719 são de 2026**, ou seja, a rodada deste ano.
- 259 clientes têm DOCX + PDF, 4 só DOCX e 8 só PDF.
- **Ter PDF não quer dizer que está assinado.** Dos 420 PDFs de aditivo, só **85** têm
  assinatura digital embutida. Os outros ~335 são o DOCX
  exportado para PDF (~180 KB cada). 7 arquivos dizem "ASS/ASSINADO" no nome e não têm
  assinatura embutida (provavelmente papel escaneado).
- Existe um tipo diferente: o **"Termo Aditivo 13º"** (honorário de 13º), às vezes numa
  subpasta própria.

**Contratos** (seu lado, como ponto de partida):
- 601 arquivos com "CONTRAT" no nome (e sem "ADITIV"), em 332 clientes.
- A assinatura aparece no nome de vários jeitos: `assinado CONTRATO…`, `…-Assinado.pdf`,
  `(assinada)`, `- Sem assinatura.pdf`. Também há `CONTRATO DE ABERTURA DE EMPRESA`, que é
  outro serviço.
- A detecção de assinatura digital no PDF (seção 7) vale igual para contratos.

### 3.4 Ligar pasta ↔ empresa

Testei contra o último export do Domínio (25/09, 426 empresas ativas):

| Resultado | Qtde |
|-----------|-----:|
| Nome igual depois de normalizar (sem acento, sem `LTDA/ME/EPP/EIRELI`, sem `(antiga …)`, `&`→`E`) | **322 (76%)** |
| Parecido (similaridade ≥ 0,85) | 32 |
| Sem par | 72 |

- O "parecido" erra: `CIC TRANSPORTES` foi casado com `TRANSCIC TRANSPORTES`. **Só o nome
  igual liga sozinho.** O resto vira sugestão para uma pessoa confirmar.
- **65 pastas são de filial** (`BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR`). As filiais
  têm a mesma razão social da matriz no Domínio, então o nome não diferencia uma da outra.
  Elas precisam de vínculo manual ou pelo CNPJ.

---

## 4. Arquitetura proposta

```
 Usuário (navegador, via VPN)
   │  clica "Sincronizar"
   ▼
 Aditiva Pronto (VPS / EasyPanel) ──── MySQL aditiva_pronto (tabelas au_*)
   ▲  │ cria job "pendente"
   │  │
   │  └─ o robô busca o job, envia os resultados em lotes e marca como concluído (HTTPS + token)
   │
 Robô coletor (PC das automações, rede interna)
   └─ lê \\192.168.140.249\Contabilidade  (somente leitura)
```

**Por que o robô busca os jobs, em vez de o app mandar:** a VPS não enxerga a rede
interna e não alcança o PC das automações. Quem inicia a conversa tem que ser o robô.
Ele consulta o app a cada ~15 s ("tem job?"). Essa mesma consulta serve de sinal de vida,
e a tela avisa "robô offline" se ele sumir.

**Por que o robô fala com a API e não direto com o MySQL:** a senha do banco não fica no PC
das automações, e o contrato entre o robô e o app é um formato de dados (JSON), não o
schema do banco. Dá para mudar tabela sem mexer no robô, e na migração para o Connect só
muda o endereço.

### O que fica de qual lado

| Camada | Faz | Não faz |
|--------|-----|---------|
| **Robô** | Lista pastas, acha a subpasta de contrato pela regra recebida, lista arquivos (recursivo), lê o PDF para detectar assinatura, envia em lotes | Classificar, decidir status, escrever/mover/renomear qualquer coisa na rede |
| **Base (app)** | Fila de jobs, recebe o inventário, vínculo pasta↔empresa, configuração, botão Sincronizar | Saber o que é contrato ou aditivo |
| **Módulo Contratos** | Classifica os arquivos de contrato e calcula o status por empresa. Tem tela e exportação próprias | — |
| **Módulo Aditivos** | O mesmo para aditivos, mais o cruzamento com `generated_documents` | — |

**Detalhes que já sabemos:**
- O robô roda como serviço do Windows, e **serviço não enxerga unidade mapeada** (`J:`).
  O robô usa o caminho UNC `\\192.168.140.249\Contabilidade` com uma conta que tenha só leitura.
- Comparar nomes com `normalize('NFC')`, porque há pastas com acento composto de jeitos diferentes.
- Um job só vira "o relatório atual" quando termina inteiro. Se falhar no meio, a tela
  continua mostrando a última sincronização boa.

---

## 5. Divisão do trabalho

| Frente | Dono | Onde mexe |
|--------|------|-----------|
| **Fase 1 — Base compartilhada** | Os dois (divisão na decisão 9, seção 10) | migration `003`, `routes/audit.ts`, `*AuditBase*`, `automation/auditoria/`, `components/audit/` |
| **Fase 2A — Auditoria Aditivos** | Kauan | migration `004`, `*AuditAditivos*`, `pages/audit/Aditivos.tsx` |
| **Fase 2B — Auditoria Contratos** | Angelo | migration `005`, `*AuditContratos*`, `pages/audit/Contratos.tsx` |
| **Fase 3 — Homologação** | Os dois + Societário | — |

**Regra de convivência:** o que é da Base só muda com os dois de acordo (PR revisado pelo
outro). Dentro do próprio módulo, cada um decide sozinho.

---

## 6. Fases

### Fase 0 — Alinhamento (antes de qualquer código)

- [ ] Ler este documento e fechar as decisões da seção 10.
- [ ] **Angelo me mostra o que já fez dos contratos.** Se você já tem um leitor de pastas,
      comparamos com a seção 8, e o que for melhor vira a base do robô. Ninguém joga trabalho fora.
- [ ] Confirmar a máquina do robô: qual PC, qual usuário do Windows, se tem Node 18+, se
      acessa `\\192.168.140.249\Contabilidade` e se alcança o app (VPN?).
- [ ] Combinar o fluxo de branch/PR (seção 9).

**Pronto quando:** as decisões da seção 10 estiverem respondidas neste documento.

### Fase 1 — Base compartilhada

> **Status em 01/10/2026** (na `main` e em produção): ✅ = feito e testado · ⏳ = falta.

1. ✅ **Migration `003-auditoria-base.sql`**: tabelas `au_*` (seção 8.1), idempotente como
   as `001`/`002`. Testada em MySQL 8 local e **aplicada em produção em 01/10** com
   `node scripts/run-migration.mjs scripts/migrations/003-auditoria-base.sql`.
2. ✅ **API do robô** (protegida por `AUDIT_ROBOT_TOKEN`): pegar job, enviar lotes,
   concluir/falhar. O job é pego com `UPDATE … WHERE status = 'pendente'`, para dois robôs
   nunca pegarem o mesmo.
3. ✅ **API da tela**: pedir sincronização (se já houver uma ativa, devolve essa), status
   (andamento, última concluída, último erro, robô online) e vínculo de pastas.
4. ⏳ **Robô coletor** em `automation/auditoria/` (sugestão: Angelo). O passo a passo está na
   seção 8.4. Um robô de teste descartável, fora do repo, já validou a API contra a rede real.
5. ⏳ **Instalação no PC das automações**: serviço do Windows (NSSM) que reinicia sozinho.
   ✅ A **sincronização diária às 06:00** já é criada pelo app (seção 8.4), sem agendador no PC.
6. ✅ **Tela Auditoria › Vínculo de pastas**: vínculo automático (seção 8.5), sugestões,
   busca de empresa, confirmar/trocar/ignorar/desfazer. ⏳ Falta "marcar empresa como sem
   pasta" (a empresa que não tem pasta na rede de propósito).
7. ✅ **Componente `<SyncBar/>`** (`components/audit/SyncBar.tsx`): botão Sincronizar e
   estado (aguardando robô · varrendo 210 de 513 · concluída há 5 min · erro · robô offline).
   É o mesmo para os dois módulos.
8. ✅ **Vitest no backend** (`npm test` em `src/backend`): 84 testes, com nomes reais do levantamento.

**Pronto quando:** um clique em Sincronizar traz o inventário completo em menos de 5
minutos (✅ ~30 s com o robô de teste) e 5 clientes conferidos à mão batem com a tela (⏳).

### Fase 2A — Auditoria Aditivos (Kauan) · em paralelo com a 2B

> **Status em 01/10/2026** (branch `feat/auditoria-aditivos`): itens 1 a 3 feitos e testados
> com o inventário real. Sem migration: o ano de referência é um seletor na tela.

1. ✅ **Classificador** (`services/auditAditivosClassificador.ts`): só extrai fatos de cada
   arquivo (aditivo, modelo, 13º, honorário, formato, assinatura, ICP, ano, CNPJ no nome).
   Pega erros de digitação ("Adtivo", "Adivito", "ADITVO"), descarta modelos e não confunde
   "FILIAL 13" com 13º. No inventário real: 783 aditivos em 276 pastas, sem nenhum falso positivo.
2. ✅ **Status por empresa** (`services/auditAditivosStatus.ts`, regras da seção 7 com as
   decisões 3 a 5) e o cruzamento com o app: alerta **"gerado no Aditiva Pronto mas não
   está na pasta"**, além da contagem de termos gerados no ano. O contrário não virou alerta,
   porque nem todo aditivo nasce no app.
3. ✅ **Tela Auditoria › Aditivos**: resumo (em dia / total), filtros por status, ano,
   responsável e busca, todos guardados na URL. Lista de arquivos de cada empresa, **copiar
   caminho da pasta** e exportação XLSX com os mesmos filtros. O navegador bloqueia link
   `file://` vindo de página web, então copiar o caminho é o jeito que funciona.

Retrato de 2026 com os dados de 01/10 (robô de teste): **60 de 428 empresas em dia (14%)**,
160 com PDF sem assinatura, 82 sem aditivo do ano, 114 sem pasta vinculada.

### Fase 2B — Auditoria Contratos (Angelo) · em paralelo com a 2A

O mesmo formato: classificador, status por empresa, tela e exportação. **As regras são
suas.** A seção 3.3 traz os padrões que encontrei, e a seção 7 é só um exemplo de
estrutura. Pontos que merecem atenção nos contratos: contrato antigo junto com o novo, distrato,
"Sem assinatura" escrito no nome, e contrato de abertura de empresa (outro serviço).

### Fase 3 — Integração e homologação

- Menu lateral com o grupo **Auditoria** (Contratos · Aditivos · Vínculo de pastas).
- **Conferência manual**: o usuário marca uma empresa como "conferido" com uma observação
  (por exemplo, assinado em papel e escaneado sem "ASS" no nome). O mecanismo é o mesmo nos
  dois módulos, tabela `au_overrides`.
- **Homologação com o Societário**: 20 clientes sorteados, conferidos à mão contra a
  tela, com meta de ≥ 95% de acerto. Cada divergência vira regra nova ou ajuste manual.
- Manual de operação do robô: como instalar, onde ficam os logs, o que fazer se ficar offline.

### Fase 4 — Depois (sem compromisso)

- Ler o conteúdo do DOCX/PDF (data, valor do honorário) para confirmar o ano sem depender da data do arquivo.
- Mostrar quem assinou o PDF (nome do certificado).
- E-mail semanal ao Societário com as pendências por responsável.
- Relatório de pastas fora do padrão, como sugestão de padronização. O robô **nunca** renomeia nada.
- Migração para o Connect, reaproveitando o robô.

---

## 7. Status por empresa — proposta para Aditivos (exemplo de estrutura para Contratos)

Avaliados nesta ordem. Vale o primeiro que se aplicar:

| Status | Quando | Cor |
|--------|--------|-----|
| `SEM_VINCULO` | A empresa ativa não tem pasta ligada | cinza |
| `SEM_PASTA_CONTRATO` | Tem pasta, mas não tem subpasta de contrato | vermelho |
| `SEM_ADITIVO` | Nenhum aditivo do ano de referência | vermelho |
| `SO_DOCX` | O aditivo do ano só existe em `.docx` (gerado, não enviado) | amarelo |
| `PDF_SEM_ASSINATURA` | Tem PDF, sem assinatura embutida e sem "ASS" no nome | amarelo |
| `ASSINADO_PELO_NOME` | "ASS/ASSINADO" no nome, sem assinatura embutida | verde-claro |
| `ASSINADO_DIGITAL` | PDF com assinatura digital embutida | verde |
| `CONFERIDO_MANUAL` | Ajuste manual registrado (Fase 3) | azul |

**Detectar assinatura digital:** o PDF assinado tem `/ByteRange` e um campo `/Sig`. Basta
procurar esses marcadores nos bytes, sem biblioteca. No levantamento, isso separou os 85
assinados dos ~335 que são só a exportação. Fica no robô, porque é ele que lê o arquivo,
e vale para os dois módulos.

---

## 8. O contrato da Base (implementado e em produção)

> Atualizado em 01/10/2026 com o que foi implementado e testado contra a rede real
> (513 pastas, 1.601 arquivos, 11 lotes, ~30 s). O que mudou em relação ao rascunho:
> o lote usa `pastas` (não `folders`), a tela consulta `GET /status` (no lugar de
> `/sync/:id` e `/sync/latest`) e a lista de pastas ignoradas virou vínculo do tipo `ignorado`.
> **Mudou aqui, muda no código e no robô.** O código de referência do contrato é
> `src/backend/src/services/auditPayload.ts`.

### 8.1 Tabelas — `scripts/migrations/003-auditoria-base.sql`

| Tabela | O que guarda |
|--------|--------------|
| `au_config` | Linha única: `raiz_unc`, `pasta_inicial`, `pasta_final`, `regex_subpasta_contrato`, `horario_agendado` (`'06:00'`, fuso de São Paulo; `NULL` desliga). O app grava os valores padrão na primeira leitura |
| `au_sync_jobs` | Fila: `status` (`pendente`/`executando`/`concluido`/`erro`), `origem` (`manual`/`agendado`), horários com milissegundos, `robo_host`, `pastas_total`, `pastas_recebidas`, `arquivos_recebidos`, `erro`. Uma coluna gerada `ativo` + índice único garantem **no máximo um job pendente/rodando** |
| `au_robot_heartbeat` | `host`, `versao`, `visto_em`: último contato de cada robô |
| `au_folders` | Pastas vistas em cada job, com `subpastas_contrato` (JSON) e `erro` |
| `au_files` | Arquivos dentro das subpastas de contrato: `caminho_relativo`, `nome`, `ext`, `tamanho`, `modificado_em`, `pdf_assinado`, `pdf_marca` |
| `au_folder_links` | Vínculo pasta ↔ empresa (`auto`/`confirmado`/`ignorado`). Não depende de job, então sobrevive entre sincronizações |

- Nomes de pasta usam `COLLATE utf8mb4_bin`: pastas que diferem só por acento são pastas diferentes.
- Nenhuma tabela `au_*` tem FK nem JOIN com `companies`, porque a collation dessa tabela em
  produção não foi conferida. O cruzamento com empresas é feito em memória.
- Cada job guarda um retrato completo. Ao concluir, apaga jobs com mais de 30 dias, sempre
  preservando o último concluído.
- `au_overrides` (conferência manual) **não** está na `003`. Entra na Fase 3.
- Cada módulo cria as próprias tabelas: `004` para Aditivos e `005` para Contratos.

### 8.2 Endpoints

Tela (sem token, como o resto do app):

```
GET  /api/audit/status        → { ativo, ultimoConcluido, ultimoErro, robo: { host, versao, vistoEm, online } }
POST /api/audit/sync          → 201 { job, criado: true }  |  200 { job, criado: false } se já houver um ativo
GET  /api/audit/folders       → { job, resumo, pastas: [{ nomePasta, subpastasContrato, arquivos, erro, vinculo, sugestoes }] }
PUT  /api/audit/folders/link  → { acao: 'vincular', nomePasta, companyId } | { acao: 'ignorar', nomePasta } | { acao: 'desfazer', nomePasta }
```

Robô (header `Authorization: Bearer <AUDIT_ROBOT_TOKEN>`; sem token configurado no servidor → 503):

```
POST /api/audit/robot/next-job          { host, versao? }               → 200 { job, config, limites }  |  204 nada a fazer
POST /api/audit/robot/jobs/:id/folders  { totalPastas?, pastas: [...] } → 200 { recebidas }
POST /api/audit/robot/jobs/:id/finish   { totais: { pastas, arquivos } } → 200 { vinculosAutomaticos }
POST /api/audit/robot/jobs/:id/fail     { erro }                         → 200
```

Resposta do `next-job`:

```json
{
  "job":     { "id": "c5671e13-…", "origem": "manual", "retomada": false },
  "config":  {
    "raizUnc": "\\\\192.168.140.249\\Contabilidade",
    "pastaInicial": "041 CONTABILIDADE",
    "pastaFinal": "ZANATO & CHAVES LTDA",
    "regexSubpastaContrato": "^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)",
    "horarioAgendado": "06:00",
    "normalizacao": "semAcentoMaiusculo"
  },
  "limites": { "maxPastasPorLote": 500, "maxArquivosPorLote": 5000 }
}
```

Códigos que o robô precisa tratar: **400** (payload inválido, com a mensagem do campo),
**401** (token errado), **409** (o job não está mais em execução: pare a varredura),
**422** no `finish` (os totais não batem com o que chegou, e o job vira erro).

### 8.3 Lote enviado pelo robô

```json
{
  "totalPastas": 513,
  "pastas": [
    {
      "nomePasta": "ALLMETAL LTDA",
      "subpastasContrato": ["CONTRATO DE PRESTAÇÃO DE SERVIÇOS"],
      "erro": null,
      "arquivos": [
        {
          "caminhoRelativo": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS/ALLMETAL - Termo Aditivo.pdf",
          "nome": "ALLMETAL - Termo Aditivo.pdf",
          "ext": ".pdf",
          "tamanho": 184320,
          "modificadoEm": "2026-03-24T10:56:43-03:00",
          "pdf": { "assinado": true, "marca": "icp" }
        }
      ]
    },
    { "nomePasta": "SCANNER", "subpastasContrato": [], "arquivos": [] }
  ]
}
```

- `modificadoEm` precisa ter fuso (`-03:00` ou `Z`). `stat.mtime.toISOString()` serve.
- `pdf` só para `.pdf`. Para outros arquivos, omita o campo.
- A mesma pasta não pode aparecer duas vezes no mesmo lote.

### 8.4 O que o robô faz, passo a passo (para o Angelo)

1. A cada ~15 s, `POST next-job` com o nome da máquina. Recebeu 204, espera e repete. Essa
   chamada também é o sinal de vida: sem ela por 2 min, a tela mostra "robô offline".
2. Recebeu um job: lista as pastas de `config.raizUnc` e fica com as que estão entre
   `pastaInicial` e `pastaFinal`, **comparando os nomes já normalizados**:
   ```js
   const semAcentoMaiusculo = (s) =>
     s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
   ```
3. Em cada pasta, as subpastas de 1º nível cujo `semAcentoMaiusculo(nome)` casa com
   `new RegExp(config.regexSubpastaContrato)` são as subpastas de contrato. Lista os
   arquivos delas **recursivamente**. Pasta sem subpasta de contrato também vai no lote, com `[]`.
4. PDF: lê os bytes e procura `/ByteRange` (assinado) e a marca ICP-Brasil (`marca: 'icp'`).
   **Atenção:** a marca fica dentro do certificado, em `/Contents <…>`, que é **hexadecimal**.
   Procurar o texto `ICP-Brasil` acha 1 de 256 PDFs assinados da pasta. Procurar também o
   hex `4943502d42726173696c` (sem diferenciar maiúscula de minúscula) acha 243:
   ```js
   const t = buffer.toString('latin1');
   const assinado = t.includes('/ByteRange');
   const icp = assinado && (t.includes('ICP-Brasil') || t.toLowerCase().includes('4943502d42726173696c'));
   ```
5. Manda lotes de até 50 pastas ou 200 arquivos, com `totalPastas`. Se uma pasta der erro de
   leitura, manda a pasta com `erro` preenchido e segue para a próxima.
6. No fim, `POST finish` com os totais que **o robô contou**. O app confere com o que recebeu.
7. Erro geral (sem acesso à rede, por exemplo): `POST fail` com a mensagem.

Garantias do lado do app, para o robô poder ser simples:
- **Reenviar um lote é seguro.** O app substitui os arquivos da pasta, sem duplicar.
- **Robô que reinicia no meio** recebe o mesmo job no próximo `next-job` (`retomada: true`)
  e pode recomeçar do zero.
- **Job sem lote por 15 min** vira erro sozinho. Pendente esquecido por 24 h também.
- **Sincronização diária:** o app cria o job "agendado" na primeira consulta depois das
  06:00. O robô não precisa de agendador próprio.
- **Somente leitura:** o robô nunca cria, move, renomeia ou apaga nada na rede.

### 8.5 Vínculo pasta ↔ empresa (regras implementadas)

Liga sozinho (tipo `auto`) só em dois casos, ambos sem chute:
1. O nome normalizado da pasta (sem acento, sem `LTDA/ME/EPP/EIRELI`, sem `(antiga …)`,
   `&`→`E`) é igual ao de **exatamente uma** empresa ativa.
2. A pasta é de filial ou matriz (`… - 12 FILIAL - CURITIBA-PR`, `FILIAL 02`, `01 MATRIZ`),
   o nome sem esse trecho bate com a razão social e **só uma** empresa tem aquela ordem no
   CNPJ (`/0012`). No teste com os dados reais, a numeração das pastas bateu com a ordem do
   CNPJ em todos os grupos de filiais conferidos (BLD, X ONE, INOVATI, BATEL…).

O resto aparece na tela **Auditoria › Vínculo de pastas** com até 3 sugestões (a filial que
confere vem primeiro) e busca manual. Resultado com os dados de 01/10: **335 de 513 pastas
ligadas sozinhas**, 104 das 178 restantes com sugestão. 114 das 428 empresas ativas ainda
sem pasta.

---

## 9. Como trabalhamos em dupla

- **Branches:** `feat/auditoria-base`, `feat/auditoria-aditivos`, `feat/auditoria-contratos`.
  PR para a `main` sempre revisado pelo outro.
- **Migrations com número reservado:** `003` é da Base, `004` dos Aditivos e `005` dos
  Contratos. Isso evita dois "003" criados no mesmo dia.
- **Banco compartilhado com o Radar Societário:** nada de `DROP`/`ALTER` fora das tabelas
  `au_*`. Migration sempre idempotente, como as atuais.
- **A rede é somente leitura.** O robô nunca cria, move, renomeia ou apaga nada em
  `\\192.168.140.249\Contabilidade`. Se possível, a conta dele nem tem permissão de escrita.
- **Testes com dados reais:** os nomes de arquivo do levantamento viram fixtures dos
  classificadores (só nomes, sem conteúdo de documento de cliente).
- **Segredos:** `AUDIT_ROBOT_TOKEN` fica no `.env` do robô e nas variáveis do EasyPanel. Nunca no git.

---

## 10. Decisões em aberto

> As decisões 1, 2, 8 e 9 já foram **implementadas como sugerido** na Fase 1, para o trabalho
> andar. Todas dá para mudar: se você discordar, a gente conversa antes do merge.

| # | Pergunta | Minha sugestão |
|---|----------|----------------|
| 1 | O robô fala com a API ou direto com o MySQL? | API (seção 4). ✅ Implementado assim |
| 2 | Um botão Sincronizar atualiza os dois módulos ou cada um tem o seu? | Uma varredura atualiza os dois, e o botão aparece nas duas telas. ✅ Implementado assim (`<SyncBar/>`) |
| 3 | O que é "aditivo em dia"? | ✅ **Decidido (Kauan, 01/10):** tem aditivo assinado do ano de referência. O ano é um seletor na tela, e o ano do arquivo vem do nome ou da data de modificação. Na Fase 4, ler a data de dentro do documento |
| 4 | "ASS" no nome sem assinatura embutida conta como assinado? | ✅ **Decidido (Kauan, 01/10):** conta como em dia, mas com status próprio (`ASSINADO_PELO_NOME`) para dar para filtrar |
| 5 | O Termo Aditivo 13º conta como o aditivo do ano? | ✅ **Decidido (Kauan, 01/10):** sozinho não fecha a pendência. "13º e Honorário" fecha |
| 6 | Filial: o contrato/aditivo fica na pasta da filial ou na da matriz? | Perguntar ao Societário. Isso muda a regra das 65 pastas de filial |
| 7 | Qual PC roda o robô, com qual conta? Ele alcança o app pela VPN? | Verificar na Fase 0 |
| 8 | Sincronização automática? | Sim, diária às 06:00, além do botão. ✅ Implementado (`au_config.horario_agendado`; `NULL` desliga) |
| 9 | Quem faz o quê na Fase 1? | Angelo: o robô coletor (é independente e só depende do JSON da seção 8.3). Kauan: migration, API e `<SyncBar/>`. ✅ A parte do Kauan está pronta, e também uma 1ª versão da tela de vínculo, que era "os dois juntos": revisa e mexe à vontade |

## 11. Perguntas para você, Angelo

1. O que você já tem dos contratos (código, rascunho, ideia de tela)? Já lê as pastas?
2. Prefere escrever o robô em Node (padrão do repo) ou tem outra preferência? Se for
   outra linguagem, tudo bem, desde que respeite o JSON da seção 8.3.
3. Quais status de contrato fazem sentido para você? A tabela da seção 7 é só um ponto de partida.
4. Alguma coisa nesta divisão te atrapalha ou te deixa esperando por mim? A ideia é cada
   um destravar o outro o mais cedo possível. O JSON da seção 8.3 existe para isso.
