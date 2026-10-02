# Decisões Técnicas — Aditiva Pronto

## ADR-001: MySQL com CHAR(36) UUID como chave primária

**Contexto:** A aplicação precisa de IDs únicos para empresas, complementos e documentos.

**Decisão:** `CHAR(36) NOT NULL DEFAULT (UUID())` — UUID v1 gerado pelo MySQL.

**Motivo:** Simplicidade de setup (sem extensão UUID), compatibilidade com MySQL 8.0, IDs legíveis em URLs e logs sem colisão entre ambientes.

**Trade-off:** UUID como PK é maior que INT e fragmenta índices. Aceitável dado o volume esperado (< 10k empresas).

---

## ADR-002: Upsert por CNPJ no import

**Contexto:** O mesmo arquivo pode ser importado mais de uma vez; o Domínio pode atualizar a razão social de uma empresa.

**Decisão:** Ao importar, verifica se o CNPJ já existe. Se sim, atualiza apenas `razao_social`. Se não, insere novo registro.

**Motivo:** Evita duplicatas e mantém complementos existentes intactos.

---

## ADR-003: Texto do contratante montado no backend

**Contexto:** O `texto_contratante` precisa de lógica condicional: inclui endereço, dados pessoais e contatos apenas quando todos os campos de cada bloco estão preenchidos.

**Decisão:** `buildContratanteText()` em `textBuilderService.ts` — função pura no backend, testável isoladamente.

**Motivo:** Garante consistência independente de qual cliente consome a API. A pré-visualização e a geração do DOCX usam a mesma função.

---

## ADR-004: docxtemplater para geração de DOCX

**Contexto:** O template final deve ser um arquivo Word editável (.docx), não PDF.

**Decisão:** `docxtemplater` + `PizZip` com placeholders `{campo}` no template.

**Motivo:** O template pode ser editado por qualquer pessoa usando o Word, sem precisar de desenvolvedor. Alternativas (html-to-docx, pdf-lib) não preservam formatação arbitrária do Word.

**Trade-off:** O template precisa ter exatamente os placeholders corretos. Erros de digitação em placeholders resultam em campos em branco silenciosamente.

---

## ADR-005: Frontend servido pelo backend em produção

**Contexto:** Simplificar o deploy — um único processo Node.js em vez de servidor web separado.

**Decisão:** Em `NODE_ENV=production`, Express serve o build do Vite em `dist/frontend` como arquivos estáticos. O nginx faz proxy de tudo para a porta 3001.

**Motivo:** Reduz containers e complexidade de deploy. O nginx ainda é necessário para TLS e `client_max_body_size`.

**Trade-off:** O build do frontend precisa ser feito antes do start do backend. Resolvido no Dockerfile multi-stage.

---

## ADR-006: Sem autenticação no MVP

> **Substituída pela ADR-008 em 02/10/2026.**

**Contexto:** A aplicação é interna para uso da equipe da 41 Contábil.

**Decisão:** Sem sistema de autenticação no MVP. O acesso é controlado por rede (VPN ou IP allowlist no nginx).

**Motivo:** Reduz escopo e tempo de desenvolvimento. Pode ser adicionado como NextAuth.js ou sessões Express em iteração futura.

**Risco:** Se exposto à internet sem proteção de rede, qualquer pessoa tem acesso.

---

## ADR-007: npm workspaces para monorepo

**Contexto:** Backend e frontend compartilham tipos TypeScript.

**Decisão:** `npm workspaces` no `package.json` raiz com workspaces `src/backend` e `src/frontend`.

**Motivo:** Permite rodar `npm install` uma vez, hoist de dependências comuns, e scripts `--workspace=` para build seletivo.

**Trade-off:** A pasta `shared/` com tipos compartilhados requer alias `@shared/*` tanto no `tsconfig.json` do backend quanto no `vite.config.ts`.

---

## ADR-008: Login com contas compartilhadas por setor

**Contexto (02/10/2026):** a API respondia sem credencial nenhuma (`/api/companies` devolvia até o
complemento com CPF do sócio). Os honorários e o envio ao Acessórias não podiam ir ao ar assim.

**Decisão:** login com usuário e senha, **uma conta por setor** (Societário e Controladoria), sem
perfis, e a mesma conta aberta em vários computadores ao mesmo tempo. As contas são criadas e têm a
senha trocada só pelo script `npm --prefix src/backend run conta`, que gera a senha (~93 bits) e a
mostra uma vez; não há cadastro nem troca de senha pela tela.

**Como:** senha com scrypt (`services/senha.ts`); sessão em cookie `__Host-ap_sessao` (HttpOnly,
Secure, SameSite=Strict, 12 h), com só o SHA-256 do token no banco (`ap_sessoes`, migration 007);
pedido que muda dado só vale vindo do próprio site (`Sec-Fetch-Site`/`Origin`); limite de
tentativas por IP + conta. O robô continua só com o `AUDIT_ROBOT_TOKEN` (rotas `/api/audit/robot/*`
ficam antes do login).

**Trade-off:** com conta compartilhada, o registro diz qual SETOR fez cada coisa (ex.: quem atualizou
um honorário no Acessórias), não qual pessoa.

---

## ADR-009: Honorário do documento mais recente, enviado ao Acessórias pela API

**Contexto (02/10/2026):** muitas empresas com o honorário desatualizado no Acessórias. O modelo de
importação de empresas do Acessórias não tem campo de honorário; a API tem (`honorario` em
`POST /companies`, devolvido em `GET /companies/{cnpj}`).

**Decisão:** vale o valor do **documento mais recente** entre contrato e termo aditivo de honorário,
sem correção pelo IPCA. O robô extrai o texto dos PDF/DOCX das subpastas de contrato; o app lê o
valor (`services/honorarioLeitor.ts`) e escolhe o documento (`services/honorariosRegras.ts`). Contrato
digitalizado não tem texto: a pessoa informa o valor na tela. O envio ao Acessórias é por botão,
uma empresa ou várias.

**Cuidados com a API do Acessórias** (a documentação não diz se campo omitido é apagado):
só envia para empresa que já existe lá (o POST também cria); lê a ficha antes e depois e, se algum
outro campo mudar, trava todos os envios até alguém conferir; o envio em lote só libera depois de
um envio individual sem efeito colateral. Cada envio fica em `au_acessorias_envios` com a ficha de
antes e de depois.

---

## ADR-010: Distrato tira a empresa das pendências da auditoria

**Contexto (02/10/2026):** cliente que encerrou o contrato continuava cobrado nos módulos (aditivo
do ano, contrato, honorário). O distrato fica numa subpasta própria ("DISTRATO…") que o robô não via.

**Decisão:** a varredura inclui as subpastas de distrato (migration 009). Distrato da prestação de
serviços contábeis põe a empresa em "Distrato" em Aditivos, Contratos e Honorários (fora das
pendências e do percentual, sem envio de honorário). Contrato mais novo que o distrato = cliente
voltou, distrato desconsiderado. Distrato de BPO e social são só aviso. Nada vai ao Acessórias por
enquanto.

