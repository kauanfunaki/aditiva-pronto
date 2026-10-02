# Robô de auditoria

Coletor compartilhado pelos módulos de Contratos, Aditivos e Honorários. Ele consulta a fila
do Aditiva Pronto, lê a pasta de rede configurada pelo servidor e envia metadados dos arquivos
e, para o honorário, o texto dos PDF/DOCX das subpastas de contrato.

O robô é estritamente somente leitura: não cria, move, renomeia nem apaga arquivos.

## Configuração

1. Instale Node.js 22 ou superior na máquina que alcança a rede interna.
2. Rode `npm ci` nesta pasta (uma dependência: `unpdf`, o pdf.js empacotado, sem código nativo).
   No PC do robô não é preciso: o pacote de instalação já leva o `node_modules`.
3. Copie `.env.example` para `.env` e preencha `AUDIT_API_BASE_URL` e `AUDIT_ROBOT_TOKEN` com o
   **mesmo** token configurado no servidor (EasyPanel). Token diferente = HTTP 401.
4. Garanta que a conta do Windows tenha acesso de leitura ao caminho UNC. Não use unidade
   mapeada (`J:`), pois serviços do Windows normalmente não a enxergam.
5. Execute `npm test` e depois `npm start` nesta pasta.

`npm run once` faz uma única consulta à fila e termina. Se houver um job, ele será processado
por inteiro; por isso, esse comando não é um dry run.

## O que é enviado

- nome da pasta e das subpastas de contrato reconhecidas pela configuração do app (desde a
  migration 009, também as subpastas de DISTRATO);
- caminho relativo, nome, extensão, tamanho e data de modificação dos arquivos;
- para PDFs, presença de assinatura digital (`/ByteRange`) e marca ICP-Brasil;
- **texto dos PDF e DOCX** das subpastas de contrato das pastas vinculadas a uma empresa, para o
  app ler o honorário. O app diz quais arquivos ler (`/api/audit/robot/texts/pending`) e o robô
  devolve o texto (`/api/audit/robot/texts`), em lotes de 40 a cada consulta à fila. Só arquivo
  novo ou alterado é lido de novo.

**Onde o robô lê conteúdo:** só dentro de `AUDIT_RAIZ_PERMITIDA` (padrão
`\\192.168.140.249\Contabilidade`), na subpasta de contrato da pasta do cliente, e só `.pdf` e
`.docx`. Essa raiz fica no `.env` do robô, não no servidor: mesmo que a configuração do app seja
alterada, o robô não lê fora da pasta de clientes. PDF digitalizado (imagem) volta como "sem texto".

Arquivos temporários do Office, AppleDouble, `Thumbs.db`, `.DS_Store` e `desktop.ini`
são ignorados. PDFs acima de 30 MB não são carregados na memória e ficam sinalizados
como não analisados para revisão no app.

Nome indicando `ASSINADO` sem assinatura digital é tratado pelo módulo de Contratos como
revisão manual de possível assinatura física.

## Operação

O processo deve permanecer em execução e consulta a API aproximadamente a cada 15 segundos.
As mensagens são escritas em `stdout`/`stderr`, adequadas para captura pelo gerenciador do
serviço. O app cria o job diário; não configure um segundo agendador no robô.

Em caso de reinício, o mesmo job é retomado desde o começo. O reenvio é idempotente por pasta.
Os lotes são enviados enquanto a varredura avança, mantendo o progresso e a atividade do job.
