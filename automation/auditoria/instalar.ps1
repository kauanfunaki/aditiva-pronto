# Instala (ou atualiza) o robô da Auditoria do Aditiva Pronto NESTE PC.
#
# Rodar na máquina do robô, logado com o usuário que vai executar o robô:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
#
# O pacote é a pasta automation/auditoria do repositório COM node_modules (npm ci feito no
# PC do Kauan) e, só na primeira instalação, um .env com o token. Para atualizar, o pacote
# não precisa de .env: o que já está instalado é mantido.
#
# O que faz, em ordem:
#   1. confere o Node.js (22 ou mais novo: a leitura de PDF pede) e o node_modules do pacote;
#   2. para o robô, se já estiver instalado;
#   3. copia os arquivos (com node_modules) para C:\Automacoes\auditoria-robo (mantém .env e logs);
#   4. protege o .env (só você e os administradores leem);
#   5. roda os testes do robô;
#   6. cria o iniciador sem janela e a tarefa agendada (no seu logon, reinicia se cair);
#   7. liga o robô e mostra as primeiras linhas do log.
# Pode rodar de novo para atualizar: o .env e os logs ficam preservados.
#
# Quem roda o robô: o DONO DA SESSÃO ABERTA neste PC (quem está logado na área de trabalho),
# mesmo que este PowerShell tenha sido aberto "como administrador" com a credencial de outra
# pessoa. Para forçar outro usuário: .\instalar.ps1 -Usuario 'PREMIER\fulano'

param([string]$Usuario)

$ErrorActionPreference = 'Stop'
$origem  = $PSScriptRoot
$destino = 'C:\Automacoes\auditoria-robo'
$tarefa  = 'AditivaPronto - Robo da Auditoria'

function Passo([string]$texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }

# Dono da sessão: o usuário do explorer.exe desta mesma sessão do Windows (funciona no
# console e por acesso remoto). Se não achar, usa quem está rodando este PowerShell.
if (-not $Usuario) {
  $sessao   = (Get-Process -Id $PID).SessionId
  $explorer = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" |
                Where-Object { $_.SessionId -eq $sessao } | Select-Object -First 1
  if ($explorer) {
    $dono = Invoke-CimMethod -InputObject $explorer -MethodName GetOwner
    if ($dono.User) { $Usuario = "$($dono.Domain)\$($dono.User)" }
  }
  if (-not $Usuario) { $Usuario = "${env:USERDOMAIN}\${env:USERNAME}" }
}
$usuario = $Usuario
Write-Host "O robô vai rodar como: $usuario" -ForegroundColor Yellow
if ($usuario -ne "${env:USERDOMAIN}\${env:USERNAME}") {
  Write-Host "(este PowerShell está como ${env:USERDOMAIN}\${env:USERNAME}; a tarefa e as permissões vão para $usuario, o dono da sessão)"
}

Passo '1/7 Conferindo o Node.js'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js não encontrado. Instale a versão LTS (https://nodejs.org) e rode este script de novo.' }
$versao = [version]((& $node -v).Trim().TrimStart('v'))
if ($versao.Major -lt 22) { throw "Node $versao é antigo demais; o robô precisa do 22 ou mais novo (instale a versão LTS)." }
if (-not (Test-Path "$origem\node_modules\unpdf\package.json")) {
  throw "O pacote está sem node_modules\unpdf. Gere o pacote de novo com 'npm ci' na pasta automation/auditoria."
}
Write-Host "    Node $versao em $node"

Passo '2/7 Parando o robô, se já estiver instalado'
if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $tarefa
  Write-Host '    Tarefa existente parada (será atualizada).'
} else {
  Write-Host '    Primeira instalação.'
}
# Parar a tarefa encerra só o wscript; o cmd e o node que ele abriu continuam vivos,
# segurando o logs\robo.log. Sem isto, a versão antiga segue rodando e a nova não sobe.
$lancadores = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
  Where-Object { $_.CommandLine -like '*index.js*logs\robo.log*' })
$robos = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $lancadores.ProcessId -contains $_.ParentProcessId })
foreach ($p in $robos + $lancadores) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
if ($robos.Count) { Write-Host "    Robô antigo encerrado ($($robos.Count) processo(s) do Node)." }

Passo "3/7 Copiando os arquivos para $destino"
robocopy $origem $destino /E /XF .env instalar.ps1 LEIA-ME.txt /XD logs /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "A cópia falhou (robocopy saiu com $LASTEXITCODE)." }
New-Item "$destino\logs" -ItemType Directory -Force | Out-Null
& icacls "$destino" /grant "${usuario}:(OI)(CI)RX" | Out-Null
& icacls "$destino\logs" /grant "${usuario}:(OI)(CI)M" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Não consegui dar acesso à pasta de logs para $usuario." }
if (Test-Path "$destino\.env") {
  Write-Host '    .env já existia no destino: mantido como está.'
} else {
  if (-not (Test-Path "$origem\.env")) { throw "Primeira instalação: falta o .env (com o token) junto deste script ($origem)." }
  Copy-Item "$origem\.env" "$destino\.env"
  Write-Host '    .env copiado.'
}

Passo '4/7 Protegendo o .env'
& icacls "$destino\.env" /inheritance:r /grant '*S-1-5-32-544:F' "${usuario}:R" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não consegui ajustar as permissões do .env.' }
Write-Host "    Leitura só para $usuario e Administradores."

Passo '5/7 Rodando os testes do robô'
Push-Location $destino
try {
  & $node --test
  if ($LASTEXITCODE -ne 0) { throw 'Os testes do robô falharam. Nada foi ligado.' }
} finally { Pop-Location }

Passo '6/7 Criando o iniciador e a tarefa agendada'
# Iniciador sem janela: roda o Node, grava stdout e stderr no log e devolve o código de
# saída para a tarefa saber se o robô caiu (e reiniciar).
$linha = 'WScript.Quit sh.Run("cmd /c ""{0}"" index.js >> logs\robo.log 2>&1", 0, True)' -f $node
Set-Content "$destino\iniciar-robo.vbs" -Encoding Default -Value @(
  'Set sh = CreateObject("WScript.Shell")',
  $linha
)

$acao    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$destino\iniciar-robo.vbs`"" -WorkingDirectory $destino
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$config  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
             -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
             -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
             -MultipleInstances IgnoreNew
$conta   = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $config -Principal $conta `
    -Description 'Coletor somente leitura da Auditoria de Contratos e Aditivos (Aditiva Pronto)' -Force | Out-Null
} catch {
  throw "Não consegui criar a tarefa agendada ($($_.Exception.Message)). Rode o PowerShell como administrador e tente de novo."
}
Write-Host "    Tarefa '$tarefa' criada: liga no logon de $usuario e reinicia a cada 1 min se cair."

Passo '7/7 Ligando o robô'
Start-ScheduledTask -TaskName $tarefa
$estado = $null
for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Seconds 2
  $estado = (Get-ScheduledTask -TaskName $tarefa).State
  if ($estado -eq 'Running' -and $i -ge 3) { break }
}
Write-Host "    Estado da tarefa: $estado (Running = rodando)"
if ($estado -ne 'Running') {
  $info = Get-ScheduledTask -TaskName $tarefa | Get-ScheduledTaskInfo
  Write-Host "    O robô não ficou rodando (último resultado: $($info.LastTaskResult)). Veja o log abaixo." -ForegroundColor Red
}
if (Test-Path "$destino\logs\robo.log") {
  Write-Host '    Últimas linhas do log:'
  Get-Content "$destino\logs\robo.log" -Tail 5 -Encoding UTF8 | ForEach-Object { Write-Host "      $_" }
}

Write-Host ''
Write-Host 'Pronto.' -ForegroundColor Green
Write-Host "1) Abra https://aditivapronto.41tech.cloud/auditoria/pastas: em até 30 s deve aparecer 'Robô $env:COMPUTERNAME online'."
Write-Host '2) Clique em Sincronizar para a primeira varredura.'
if (Test-Path "$origem\.env") {
  Write-Host "3) APAGUE esta pasta de instalação ($origem): ela tem uma cópia do token. O robô já tem a dele em $destino."
} else {
  Write-Host "3) Pode apagar esta pasta de instalação ($origem)."
}
