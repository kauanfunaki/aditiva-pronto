# Configuração no EasyPanel (VPS Linux)

## Pré-requisitos na VPS

Acesse a VPS via SSH e crie as pastas que serão montadas como volumes:

```bash
mkdir -p /srv/aditiva/imports
mkdir -p /srv/aditiva/exports
mkdir -p /srv/aditiva/generated
mkdir -p /srv/aditiva/templates

# Copie o template Word para a VPS
# (do seu computador Windows, via SCP ou painel de arquivos do EasyPanel)
scp "Template Termo Aditivo.docx" usuario@IP_DA_VPS:/srv/aditiva/templates/termo_aditivo.docx
```

---

## Variáveis de Ambiente no EasyPanel

No painel do serviço `app`, vá em **Environment Variables** e adicione:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DB_HOST` | `db` (nome do serviço MySQL) |
| `DB_PORT` | `3306` |
| `DB_NAME` | `aditiva_pronto` |
| `DB_USER` | `aditiva` |
| `DB_PASS` | *(senha forte escolhida)* |
| `IMPORT_FOLDER` | `/app/imports` |
| `GENERATED_DIR` | `/app/generated` |
| `TEMPLATE_PATH` | `/app/templates/termo_aditivo.docx` |
| `AUDIT_ROBOT_TOKEN` | *(token do robô da Auditoria, 32+ caracteres — o mesmo do `.env` do robô)* |
| `ACESSORIAS_API_TOKEN` | *(token da API do Acessórias: engrenagem → API Token, no Acessórias. Sem ele, a tela de Honorários funciona, mas não envia)* |
| `TRUST_PROXY` | *(opcional)* `1` = um proxy na frente (padrão em produção). Serve para o limite de tentativas de login ver o IP de verdade |

**Contas de acesso (login, ADR-008):** depois da migration `007`, crie as contas no PC com o
repositório (o `.env` da raiz aponta para o banco de produção):

```bash
npm --prefix src/backend run conta -- --login societario --nome "Societário"
npm --prefix src/backend run conta -- --login controladoria --nome "Controladoria"
```

A senha aparece uma vez no terminal. Para trocar (e derrubar quem estiver logado):
`npm --prefix src/backend run conta -- --login societario --nova-senha`.

---

## Volumes no EasyPanel

No painel do serviço `app`, vá em **Volumes** e configure:

| Caminho na VPS | Caminho no container | Tipo |
|---|---|---|
| `/srv/aditiva/imports` | `/app/imports` | Bind Mount |
| `/srv/aditiva/generated` | `/app/generated` | Bind Mount |
| `/srv/aditiva/templates` | `/app/templates` | Bind Mount (Read-only) |

> **Importante:** Use **Bind Mount** (pasta real da VPS), não Volume Docker anônimo.
> Volume anônimo começa sempre vazio e não pode ser acessado via SFTP.

---

## Como colocar relatórios para sincronizar

### Opção A — Via SCP (linha de comando)

```bash
# Do seu computador Windows (PowerShell):
scp "N:\KAUAN\AditivaPronto\Exports\Relacao_Empresas_01052025.xlsx" usuario@IP_DA_VPS:/srv/aditiva/imports/
```

### Opção B — Via painel de arquivos do EasyPanel

1. Abra o EasyPanel → seu projeto → **Files**
2. Navegue até `/srv/aditiva/imports/`
3. Faça upload do arquivo `.xlsx`

### Opção C — Via interface web da aplicação

Use o botão **"Importar planilha"** no Dashboard — ele faz upload direto pelo navegador, sem precisar acessar a VPS.

---

## Checklist de Teste após Deploy

### 1. Verificar health da API
```bash
curl http://SEU_DOMINIO/api/health
# Esperado: {"status":"ok","ts":"..."}
```

### 2. Subir arquivo de teste

```bash
# Na VPS:
ls /srv/aditiva/imports/
# Deve listar o arquivo .xlsx copiado
```

### 3. Testar sincronização pela API

```bash
curl -X POST http://SEU_DOMINIO/api/import/sync
# Sucesso:
# {
#   "inserted": 10,
#   "updated": 0,
#   "skipped": 0,
#   "total": 10,
#   "errors": [],
#   "sourceFile": "Relacao_Empresas_01052025.xlsx",
#   "message": "Sincronização concluída. ..."
# }
#
# Erro de pasta não configurada (400):
# {"error": "Variável de ambiente IMPORT_FOLDER não está definida..."}
#
# Erro de pasta vazia (400):
# {"error": "Nenhum arquivo .xlsx, .xls ou .csv encontrado em \"/app/imports\"..."}
```

### 4. Testar pelo navegador

1. Abrir o Dashboard da aplicação
2. Clicar **"Sincronizar pasta"**
3. Deve aparecer alert com resultado: inseridas, atualizadas, ignoradas
4. Ir em **Empresas** e confirmar que os registros aparecem

### 5. Verificar logs do container

```bash
docker logs aditiva_app --tail 50
# Deve conter linhas como:
# [import/sync] IMPORT_FOLDER configurado: "/app/imports"
# [import/sync] verificando existência da pasta: "/app/imports"
# [import/sync] total de entradas na pasta: 1
# [import/sync] arquivos encontrados (1): Relacao_Empresas_01052025.xlsx
# [import/sync] importando arquivo mais recente: "Relacao_Empresas_01052025.xlsx"
# [import/sync] concluído — inseridos:42 atualizados:0 pulados:0
```

### 6. Validar empresas no banco

```bash
docker exec -it aditiva_db mysql -u aditiva -p aditiva_pronto -e "SELECT COUNT(*) FROM companies;"
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| 400 "IMPORT_FOLDER não definida" | Variável não foi adicionada no EasyPanel | Adicionar `IMPORT_FOLDER=/app/imports` nas env vars |
| 400 "Pasta não encontrada" | Volume não está montado | Criar pasta na VPS + configurar Bind Mount |
| 400 "Nenhum arquivo encontrado" | Pasta está vazia | Copiar .xlsx para `/srv/aditiva/imports/` |
| 500 genérico | Erro na leitura do Excel | Ver `docker logs aditiva_app` para detalhe |
| Dados não aparecem após sync | CNPJ inválido na planilha | Verificar campo `errors` no JSON de resposta |
