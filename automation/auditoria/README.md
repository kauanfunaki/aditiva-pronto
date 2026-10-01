# Robô de auditoria

Coletor compartilhado pelos módulos de Contratos e Aditivos. Ele consulta a fila do
Aditiva Pronto, lê a pasta de rede configurada pelo servidor e envia apenas metadados.

O robô é estritamente somente leitura: não cria, move, renomeia nem apaga arquivos.

## Configuração

1. Instale Node.js 18 ou superior na máquina que alcança a rede interna.
2. Copie `.env.example` para `.env`.
3. Preencha `AUDIT_API_BASE_URL` e um token novo em `AUDIT_ROBOT_TOKEN`.
4. Garanta que a conta do Windows tenha acesso de leitura ao caminho UNC. Não use unidade
   mapeada (`J:`), pois serviços do Windows normalmente não a enxergam.
5. Execute `npm test` e depois `npm start` nesta pasta.

`npm run once` faz uma única consulta à fila e termina. Se houver um job, ele será processado
por inteiro; por isso, esse comando não é um dry run.

## O que é enviado

- nome da pasta e das subpastas de contrato reconhecidas pela configuração do app;
- caminho relativo, nome, extensão, tamanho e data de modificação dos arquivos;
- para PDFs, presença de assinatura digital (`/ByteRange`) e marca ICP-Brasil.

O conteúdo dos documentos não é enviado. Nome indicando `ASSINADO` sem assinatura digital
será tratado pelo módulo de Contratos como revisão manual de possível assinatura física.

## Operação

O processo deve permanecer em execução e consulta a API aproximadamente a cada 15 segundos.
As mensagens são escritas em `stdout`/`stderr`, adequadas para captura pelo gerenciador do
serviço. O app cria o job diário; não configure um segundo agendador no robô.

Em caso de reinício, o mesmo job é retomado desde o começo. O reenvio é idempotente por pasta.
