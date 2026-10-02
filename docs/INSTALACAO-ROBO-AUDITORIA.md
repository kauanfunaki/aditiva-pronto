# Instalação do robô da Auditoria (Aditiva Pronto)

> **Quem faz:** Kauan, no PC das automações (com apoio do Angelo na Parte 2)
> **Decisão de 02/10/2026:** o robô roda **com o usuário do Kauan**, na sessão que já fica
> aberta nesse PC, como as outras automações. Uma conta de serviço dedicada fica como opção
> futura (Anexo).

## O que é

Um programa em Node.js que roda num PC da rede interna. A cada ~15 segundos ele pergunta
ao app **Aditiva Pronto** (`https://aditivapronto.41tech.cloud`) se há uma sincronização
pedida. Quando há, ele **lê** as pastas dos clientes em `\\192.168.140.249\Contabilidade`
e manda para o app os nomes, as datas e os tamanhos dos arquivos dos contratos e aditivos.

**Desde a versão 1.1 (02/10/2026)** ele também extrai o **texto** dos PDF e DOCX das subpastas
de contrato, para o app ler o honorário (tela Honorários). Só lê o que o app pede, só dentro de
`\\192.168.140.249\Contabilidade` (a raiz fica travada no `.env` do robô) e só arquivo novo ou
alterado.

**O robô é somente leitura:** não cria, altera, move, renomeia nem apaga nada na rede. O
código foi revisado para isso: não há nenhuma chamada de escrita na rede. Há uma única biblioteca
externa, com versão fixa: `unpdf` 1.8.1 (o pdf.js da Mozilla empacotado, sem código nativo), que
vai junto no pacote de instalação.

## Já conferido no PC escolhido

| Item | Situação |
|---|---|
| Fica ligado, logado com o usuário do Kauan, no domínio `premier.lan` | ✅ |
| Enxerga `\\192.168.140.249\Contabilidade` | ✅ |
| Acessa `https://aditivapronto.41tech.cloud` (porta 443) | ✅ |
| Node.js 22 ou mais novo | ✅ v24 (conferido em 02/10) |

Nome do PC: `PREMIER080`. Instalado em 02/10/2026 rodando como `PREMIER\kauan.brasileiro`.

## Por que o usuário do Kauan, e o que isso implica

| | Usuário do Kauan (escolhido) | Conta dedicada (Anexo) |
|---|---|---|
| Precisa do TI / AD | Não | Sim |
| Mexe nas outras automações | Não | Não |
| Senha guardada no PC | **Não** (roda na sessão aberta) | Sim |
| Para se a senha mudar | **Não** | Sim, até atualizar |
| Roda se o PC reiniciar e ninguém logar | Não: volta no próximo logon | Sim |
| Proteção se um dia o código errar e tentar escrever | Só o código (revisado) | Código + permissão do Windows |

O ponto de atenção é o último: com o usuário do Kauan, a garantia de "só leitura" vem só do
código. Por isso, **toda mudança na pasta `automation/auditoria/` passa por revisão** antes
de ir para o PC.

---

## Parte 1 — Node.js

### 1.1 Verificar

No PowerShell:

```powershell
node -v
```

| Resultado | O que fazer |
|---|---|
| `v22…` ou maior (`v24…`) | Já serve. Pular para a Parte 2. |
| `v20…` ou menor | Atualizar (1.2). A leitura de PDF pede o 22. |
| `'node' não é reconhecido…` | Não está instalado. Instalar (1.2). |

### 1.2 Instalar ou atualizar

Usar a versão **LTS** (a recomendada para produção).

**Opção A — winget** (PowerShell como administrador):

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

**Opção B — instalador:** baixar o `.msi` da versão **LTS** em https://nodejs.org e instalar
com as opções padrão (vai para `C:\Program Files\nodejs\`).

### 1.3 Confirmar

**Fechar e abrir de novo** o PowerShell (o PATH só atualiza em janelas novas):

```powershell
node -v; (Get-Command node).Source
```

Esperado: versão 22 ou maior e `C:\Program Files\nodejs\node.exe`.

---

## Parte 2 — Instalar o robô

> O pacote leva o `node_modules` pronto (`npm ci` feito no PC do Kauan): no PC do robô não é
> preciso `npm install` nem acesso ao npm.

### Caminho rápido: pacote + `instalar.ps1` (usado em 02/10/2026)

O PC do robô **não é** o PC onde fica o repositório. Por isso o caminho é dividido assim:

| Onde | O quê |
|---|---|
| **PC do Kauan** (onde está o repositório) | Gerar o pacote: pasta `automation/auditoria` da `main` com `npm ci` feito (leva o `node_modules`) e o `instalar.ps1` (que está no repositório). **Só na primeira instalação** vai também um `.env` com o token, e aí a pasta fica legível só para o Kauan e os administradores |
| **PC do robô** | Copiar a pasta do pacote (área de transferência do acesso remoto ou pendrive; **nunca** pelo `J:`) e rodar **um comando**: `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`. Depois, **apagar a pasta do pacote** |

O `instalar.ps1` faz sozinho os passos 2.1 a 2.4 abaixo: confere o Node, copia para
`C:\Automacoes\auditoria-robo` (mantém `.env` e logs já existentes), protege o `.env`, roda os
testes, cria o iniciador sem janela e a tarefa agendada e liga o robô. Para **atualizar**, basta
gerar um pacote novo e rodar o mesmo script. As seções abaixo descrevem os passos manuais, como
referência.

### 2.1 Pasta do robô

Não é preciso clonar nada se o repositório já está no PC: basta atualizar a `main` e
**copiar** a pasta do robô para `C:\Automacoes\auditoria-robo\`.

> **Por que copiar e não rodar direto do repositório?** Se o robô rodasse de dentro do
> repositório, qualquer `git checkout` de outra branch (por exemplo, para revisar um PR)
> trocaria o código do robô em produção sem ninguém perceber. Com a cópia, o robô só muda
> quando alguém atualiza de propósito (2.6).

```powershell
cd "C:\Users\kauan.brasileiro\Documents\1. Apps\aditiva-pronto"; git checkout main; git pull
cd automation\auditoria; npm ci; cd ..\..
robocopy "C:\Users\kauan.brasileiro\Documents\1. Apps\aditiva-pronto\automation\auditoria" "C:\Automacoes\auditoria-robo" /E /XF .env /XD logs
New-Item 'C:\Automacoes\auditoria-robo\logs' -ItemType Directory -Force | Out-Null
```

O `robocopy` cria a pasta de destino e copia tudo, **menos** o `.env` e os logs. Assim o
mesmo comando serve para atualizar o robô depois, sem apagar o token nem o histórico.

*Se o PC não tiver o repositório:* `git clone` do repositório (precisa de acesso ao GitHub)
ou baixar o ZIP pelo site do GitHub e copiar só a pasta `automation/auditoria`.

### 2.2 Arquivo `.env`

Na pasta do robô, copiar `.env.example` para `.env` e preencher:

```ini
AUDIT_API_BASE_URL=https://aditivapronto.41tech.cloud/api
AUDIT_ROBOT_TOKEN=<o MESMO token configurado no EasyPanel>
```

- **O token tem que ser o mesmo do servidor**, não um novo. Token diferente → o app recusa
  com **HTTP 401**.
- O `.env` **nunca** vai para o git. Deixar só o Kauan e os administradores lendo:

```powershell
icacls 'C:\Automacoes\auditoria-robo\.env' /inheritance:r /grant '*S-1-5-32-544:F' "${env:USERDOMAIN}\${env:USERNAME}:R"
```

(`*S-1-5-32-544` é o grupo Administradores em qualquer idioma do Windows. As chaves em
`${env:USERNAME}` são necessárias: sem elas, o PowerShell junta o `:R` ao nome da variável.)

### 2.3 Testar

```powershell
cd C:\Automacoes\auditoria-robo
npm test
```

Tem que terminar com `pass 11` e `fail 0` (ou mais testes, se o Angelo tiver adicionado).

> ⚠️ `npm run once` **não é teste**: se houver sincronização pendente, ele faz a varredura
> inteira de verdade. Use só quando quiser rodar uma sincronização completa.

### 2.4 Iniciar sozinho no logon, com a janela oculta

Duas peças: um iniciador `.vbs` que roda o Node **sem abrir janela** (para ninguém fechar
sem querer) e grava o log, e uma tarefa agendada que chama esse iniciador **toda vez que o
Kauan faz logon**. Nenhuma senha fica guardada.

No PowerShell **normal** (não precisa ser administrador), logado com o usuário do Kauan:

```powershell
$robo = 'C:\Automacoes\auditoria-robo'

# 1) Iniciador sem janela. Devolve o código de saída do Node para a tarefa saber se caiu.
@'
Set sh = CreateObject("WScript.Shell")
WScript.Quit sh.Run("cmd /c ""C:\Program Files\nodejs\node.exe"" index.js >> logs\robo.log 2>&1", 0, True)
'@ | Set-Content "$robo\iniciar-robo.vbs" -Encoding ASCII

# 2) Tarefa: no logon do Kauan, sem limite de tempo, reinicia a cada 1 min se cair.
$usuario  = "$env:USERDOMAIN\$env:USERNAME"
$acao     = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$robo\iniciar-robo.vbs`"" -WorkingDirectory $robo
$gatilho  = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$config   = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
              -MultipleInstances IgnoreNew
$conta    = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'AditivaPronto - Robo da Auditoria' `
  -Action $acao -Trigger $gatilho -Settings $config -Principal $conta `
  -Description 'Coletor somente leitura da Auditoria de Contratos e Aditivos (Aditiva Pronto)'

# 3) Iniciar agora, sem precisar sair e entrar de novo
Start-ScheduledTask -TaskName 'AditivaPronto - Robo da Auditoria'
```

- **Não usar `J:`** em lugar nenhum: o caminho da rede vem do próprio app
  (`\\192.168.140.249\Contabilidade`).
- **Não criar outro agendamento** de sincronização: a diária das 06:00 é criada pelo app.
  A tarefa acima só mantém o robô ligado.

### 2.5 Conferir

1. Em até 30 segundos, `https://aditivapronto.41tech.cloud/auditoria/pastas` deve mostrar
   **"Robô `<PC-DAS-AUTOMACOES>` online"** na barra de sincronização.
2. Clicar em **Sincronizar**: a barra mostra "Varrendo as pastas da rede: X de 513" e termina
   com "Sincronização concluída".
3. Log: `C:\Automacoes\auditoria-robo\logs\robo.log`.

Comandos úteis:

```powershell
Get-ScheduledTask -TaskName 'AditivaPronto - Robo da Auditoria' | Get-ScheduledTaskInfo   # última execução
Get-Content 'C:\Automacoes\auditoria-robo\logs\robo.log' -Tail 30                          # últimas linhas do log
Stop-ScheduledTask  -TaskName 'AditivaPronto - Robo da Auditoria'                           # parar
Start-ScheduledTask -TaskName 'AditivaPronto - Robo da Auditoria'                           # iniciar
```

### 2.6 Atualizar o robô (versão nova)

Mesmo caminho da instalação, **sem `.env`** no pacote (o instalado é mantido):

1. No PC do Kauan, na `main` atualizada: `cd automation\auditoria; npm ci` e copiar a pasta
   `automation\auditoria` inteira (com `node_modules` e `instalar.ps1`) para o PC do robô.
2. No PC do robô, dentro da pasta copiada:
   `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`. Ele para a tarefa, copia, roda os
   testes e liga de novo.
3. Apagar a pasta copiada.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| App mostra **"robô offline"** | Robô parado, PC desligado ou sem logon | `Get-ScheduledTaskInfo` (comando acima); ver o log; fazer logon no PC |
| Log com **HTTP 401** | Token do `.env` diferente do EasyPanel | Copiar o mesmo valor do servidor e reiniciar a tarefa |
| Log com **HTTP 503** | Servidor sem `AUDIT_ROBOT_TOKEN` | Configurar no EasyPanel e refazer o deploy |
| Log com **acesso negado** na pasta | Usuário sem leitura em alguma subpasta | Ver no log qual pasta; a varredura continua nas outras |
| Sincronização termina em **"parou de enviar dados"** | Varredura passou de 15 min sem mandar lote | Ver o log; avisar o Angelo |
| Log não é criado | Pasta `logs` não existe ou caminho do Node diferente | Refazer 2.1; conferir `(Get-Command node).Source` e ajustar o `.vbs` |

## Checklist

- [x] Node 22 ou mais novo no PC (Parte 1) — v24
- [ ] Robô copiado para `C:\Automacoes\auditoria-robo`, `.env` com o token do servidor (2.1 e 2.2)
- [ ] `npm test` passando (2.3)
- [ ] Tarefa criada e robô "online" no app (2.4 e 2.5)
- [ ] Primeira sincronização concluída

---

## Anexo — conta de serviço dedicada (opcional, para o futuro)

Se um dia o TI puder criar uma conta só para o robô, ganha-se a proteção do Windows contra
escrita e o robô passa a rodar mesmo sem ninguém logado. **Isso não muda o usuário do PC nem
as outras automações:** a conta é usada só pela tarefa do robô.

No `dc2.premier.lan` (servidor da pasta), como administrador do domínio:

```powershell
# Grupo + usuário (a senha é digitada na hora)
New-ADGroup -Name 'GG-Auditoria-Leitura' -GroupScope Global -GroupCategory Security
New-ADUser -Name 'svc-auditoria' -SamAccountName 'svc-auditoria' -UserPrincipalName 'svc-auditoria@premier.lan' `
  -AccountPassword (Read-Host -AsSecureString 'Senha do svc-auditoria') -Enabled $true `
  -PasswordNeverExpires $true -CannotChangePassword $true `
  -Description 'Robô da Auditoria (Aditiva Pronto) - somente leitura na Contabilidade'
Add-ADGroupMember -Identity 'GG-Auditoria-Leitura' -Members 'svc-auditoria'

# Leitura na pasta compartilhada
$pasta = (Get-SmbShare -Name 'Contabilidade').Path
icacls $pasta /grant 'PREMIER\GG-Auditoria-Leitura:(OI)(CI)RX'

# Se "Domain Users"/"Everyone"/"Authenticated Users" tiver (M) ou (F) na pasta,
# bloquear a escrita herdada só para a conta do robô:
icacls $pasta
icacls $pasta /deny 'PREMIER\svc-auditoria:(OI)(CI)(WD,AD,WEA,WA,DE,DC)'
```

Para provar que é só leitura, no PC das automações rode `runas /user:PREMIER\svc-auditoria
powershell` e, na janela nova:
- `Get-ChildItem '\\192.168.140.249\Contabilidade'` deve **listar**;
- `New-Item '\\192.168.140.249\Contabilidade\_teste_robo.txt' -ItemType File` deve dar
  **acesso negado**. Se criar o arquivo, apague na hora e revise o `icacls`.

Depois, na tarefa da Parte 2.4, trocar a conta para `PREMIER\svc-auditoria` com
"executar estando o usuário conectado ou não" (`-LogonType Password` e a senha da conta).
