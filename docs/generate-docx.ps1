param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "WorkForce-Manager-Documentazione.docx")
)

$sourceFiles = @(
    "01-funzionale.md",
    "02-architettura.md",
    "03-tecnica.md",
    "04-sicurezza.md",
    "backlog.md"
) | ForEach-Object { Join-Path $PSScriptRoot $_ }

$pandoc = Get-Command pandoc -ErrorAction Stop
$mermaidCli = Join-Path $PSScriptRoot "..\node_modules\.bin\mmdc.cmd"
$diagramsDirectory = Join-Path $PSScriptRoot "diagrams"
$intermediatePath = Join-Path $env:TEMP "WorkForce-Manager-Documentazione.md"

if (-not (Test-Path $mermaidCli)) {
    throw "Mermaid CLI non trovata. Eseguire npm install prima di generare il documento Word."
}

New-Item -ItemType Directory -Path $diagramsDirectory -Force | Out-Null
$diagramIndex = 0
$wordContent = foreach ($sourceFile in $sourceFiles) {
    $sourceName = [IO.Path]::GetFileNameWithoutExtension($sourceFile)
    $content = Get-Content -Path $sourceFile -Raw

    [regex]::Replace($content, '(?s)```mermaid\r?\n(.*?)```', [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)

        $script:diagramIndex++
        $diagramName = "{0}-{1:D2}" -f $sourceName, $script:diagramIndex
        $diagramSource = Join-Path $diagramsDirectory "$diagramName.mmd"
        $diagramImage = Join-Path $diagramsDirectory "$diagramName.png"
        Set-Content -Path $diagramSource -Value $match.Groups[1].Value -Encoding utf8

        & $mermaidCli --input $diagramSource --output $diagramImage --backgroundColor white --scale 2
        if ($LASTEXITCODE -ne 0) {
            throw "Mermaid CLI non ha generato il diagramma $diagramName."
        }

        "![](diagrams/$diagramName.png){ width=95% }"
    })
}

Set-Content -Path $intermediatePath -Value ($wordContent -join "`r`n`r`n") -Encoding utf8
$pandocArguments = @(
    "--metadata=title:WorkForce Manager",
    "--metadata=subtitle:Documentazione funzionale, architetturale, tecnica e di sicurezza",
    "--metadata=date:$(Get-Date -Format 'yyyy-MM-dd')"
)

& $pandoc.Source $intermediatePath `
    --standalone `
    --toc `
    --toc-depth=3 `
    "--resource-path=$PSScriptRoot" `
    @pandocArguments `
    --output $OutputPath

if ($LASTEXITCODE -ne 0) {
    throw "Pandoc non ha generato il documento Word."
}

Remove-Item -Path $intermediatePath -ErrorAction SilentlyContinue