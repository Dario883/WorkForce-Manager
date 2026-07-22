# =============================================================
# WorkForce Manager - Full Azure + GitHub setup (minimal input)
# Only interactive steps: Azure login + GitHub login
# =============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param($msg); Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg); Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn { param($msg); Write-Host "   !! $msg" -ForegroundColor Yellow }

function Run-OrFail {
    param([scriptblock]$Command, [string]$FailureMessage)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Install-IfMissing {
    param($cmd, $wingetId, $name)

    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        Write-Ok "$cmd already installed"
        return
    }

    Write-Warn "$name not found - installing via winget..."

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget not found. Install $name manually, then rerun this script."
    }

    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements | Out-Null

    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"

    # Azure CLI on Windows is often installed here, but not immediately visible
    # in current PATH until shell restart.
    if ($cmd -eq "az") {
        $azKnownPath = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin"
        if ((Test-Path $azKnownPath) -and ($env:PATH -notlike "*$azKnownPath*")) {
            $env:PATH = "$env:PATH;$azKnownPath"
        }
    }

    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd still not found after install. Open a new terminal and rerun."
    }

    Write-Ok "$name installed"
}

function New-RandomToken {
    param([int]$Bytes = 24)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $rng.GetBytes($buf)
    return [Convert]::ToBase64String($buf).TrimEnd('=')
}

function To-SafeName {
    param([string]$Value)
    $v = $Value.ToLowerInvariant()
    $v = $v -replace "[^a-z0-9-]", "-"
    $v = $v -replace "-+", "-"
    $v = $v.Trim('-')
    if (-not $v) { $v = "workforce-manager" }
    return $v
}

Write-Step "Checking prerequisites"
Install-IfMissing "git" "Git.Git" "Git"
Install-IfMissing "az" "Microsoft.AzureCLI" "Azure CLI"
Install-IfMissing "gh" "GitHub.cli" "GitHub CLI"

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
$azCmd = Get-Command az -ErrorAction SilentlyContinue

if (-not $azCmd) {
    $azKnownPath = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    if (Test-Path $azKnownPath) {
        $azCmd = Get-Item $azKnownPath
    }
}

if (-not $gitCmd -or -not $ghCmd -or -not $azCmd) {
    throw "Failed to resolve one or more required CLIs (git/gh/az)."
}

$GitExe = if ($gitCmd.Source) { $gitCmd.Source } else { $gitCmd.Path }
$GhExe = if ($ghCmd.Source) { $ghCmd.Source } else { $ghCmd.Path }
$AzExe = if ($azCmd.Source) { $azCmd.Source } else { $azCmd.FullName }

Write-Step "Detecting GitHub repo"
$remoteUrl = (& $GitExe remote get-url origin 2>&1)
if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) {
    throw "No git remote 'origin' found. Push your repo to GitHub first."
}
$ghRepo = $remoteUrl -replace "\.git$", "" -replace "^https://github\.com/", "" -replace "^git@github\.com:", ""
Write-Ok "Repo: $ghRepo"

Write-Step "Azure login"
& $AzExe account show --output none 2>$null
if ($LASTEXITCODE -ne 0) {
    Run-OrFail { & $AzExe login --output none } "Azure login failed"
}
Write-Ok "Azure authenticated"

Write-Step "GitHub login"
& $GhExe auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Run-OrFail { & $GhExe auth login --hostname github.com --web } "GitHub login failed"
}
Write-Ok "GitHub authenticated"

Write-Step "Deriving resource names"
$repoName = ($ghRepo -split "/")[-1]
$safeBase = To-SafeName $repoName
$suffix = -join ((97..122) + (48..57) | Get-Random -Count 6 | ForEach-Object {[char]$_})

$preferredLocation = "westeurope"
$mysqlCandidateLocations = @("westeurope", "northeurope", "swedencentral", "francecentral", "italynorth")
$location = $preferredLocation
$resourceGroup = "$safeBase-rg"
$appName = ("$safeBase-$suffix").Substring(0, [Math]::Min(("$safeBase-$suffix").Length, 60)).Trim('-')
$planName = "$safeBase-plan"
$mysqlServer = ("$safeBase-db-$suffix").Substring(0, [Math]::Min(("$safeBase-db-$suffix").Length, 63)).Trim('-')
$mysqlDbName = "workforce_manager"
$mysqlAdminUser = "wfmadmin"
$mysqlAdminPassword = "Wfm!" + (New-RandomToken 18)
$jwtSecret = New-RandomToken 32

Write-Ok "Resource group: $resourceGroup"
Write-Ok "Web app: $appName"
Write-Ok "MySQL server: $mysqlServer"

Write-Step "Creating resource group"
Run-OrFail { & $AzExe group create --name $resourceGroup --location $location --output none } "Failed creating resource group"
Write-Ok "Resource group ready"

Write-Step "Creating App Service plan"
Run-OrFail { & $AzExe appservice plan create --name $planName --resource-group $resourceGroup --sku B1 --is-linux --output none } "Failed creating App Service plan"
Write-Ok "App Service plan ready"

Write-Step "Creating Web App (Node 22 LTS)"
Run-OrFail { & $AzExe webapp create --name $appName --resource-group $resourceGroup --plan $planName --runtime "NODE:22-lts" --output none } "Failed creating Web App"
Run-OrFail { & $AzExe webapp config set --name $appName --resource-group $resourceGroup --startup-file "node dist/index.mjs" --output none } "Failed setting startup command"
Write-Ok "Web App ready"

Write-Step "Creating Azure MySQL Flexible Server"
$mysqlCreated = $false
foreach ($candidateLocation in $mysqlCandidateLocations) {
    for ($i = 1; $i -le 3; $i++) {
        $candidateSuffix = -join ((97..122) + (48..57) | Get-Random -Count 4 | ForEach-Object {[char]$_})
        $candidateServer = ("$safeBase-db-$suffix-$candidateSuffix").Substring(0, [Math]::Min(("$safeBase-db-$suffix-$candidateSuffix").Length, 63)).Trim('-')
        Write-Warn "Trying MySQL create in $candidateLocation with server $candidateServer (attempt $i/3)"
                & $AzExe mysql flexible-server create `
          --resource-group $resourceGroup `
          --name $candidateServer `
          --location $candidateLocation `
          --admin-user $mysqlAdminUser `
          --admin-password $mysqlAdminPassword `
          --sku-name Standard_B1ms `
          --tier Burstable `
          --version 8.0.21 `
          --storage-size 32 `
          --public-access 0.0.0.0 `
          --output none
        if ($LASTEXITCODE -eq 0) {
            $mysqlServer = $candidateServer
            $location = $candidateLocation
            $mysqlCreated = $true
            break
        }
    }
    if ($mysqlCreated) { break }
}

if (-not $mysqlCreated) {
    throw "Failed creating MySQL server in tested regions: $($mysqlCandidateLocations -join ', ')"
}
Write-Ok "MySQL server ready in ${location}: $mysqlServer"

Run-OrFail {
    & $AzExe mysql flexible-server firewall-rule create `
      --resource-group $resourceGroup `
      --name $mysqlServer `
      --rule-name allow-azure-services `
      --start-ip-address 0.0.0.0 `
      --end-ip-address 0.0.0.0 `
      --output none
} "Failed configuring MySQL firewall for Azure services"

$publicIp = ""
try {
    $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org").ToString()
} catch {
    Write-Warn "Could not detect your public IP automatically; local DB access may require manual firewall rule."
}

if ($publicIp) {
    Run-OrFail {
        & $AzExe mysql flexible-server firewall-rule create `
          --resource-group $resourceGroup `
          --name $mysqlServer `
          --rule-name allow-local-setup `
          --start-ip-address $publicIp `
          --end-ip-address $publicIp `
          --output none
    } "Failed adding local IP firewall rule"
}

Run-OrFail {
    & $AzExe mysql flexible-server db create `
      --resource-group $resourceGroup `
      --server-name $mysqlServer `
      --database-name $mysqlDbName `
      --output none
} "Failed creating MySQL database"

$mysqlHost = "$mysqlServer.mysql.database.azure.com"
$escapedDbPass = [System.Uri]::EscapeDataString($mysqlAdminPassword)
$databaseUrl = ('mysql://{0}:{1}@{2}:3306/{3}?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D' -f $mysqlAdminUser, $escapedDbPass, $mysqlHost, $mysqlDbName)
Write-Ok "MySQL database ready"

Write-Step "Applying Azure Web App environment variables"
$appSettings = @(
    "DATABASE_URL=$databaseUrl",
    "JWT_SECRET=$jwtSecret",
    "APP_AUTH_MODE=local",
    "NODE_ENV=production"
)
Run-OrFail { & $AzExe webapp config appsettings set --name $appName --resource-group $resourceGroup --settings $appSettings --output none } "Failed setting app settings"
Write-Ok "App settings applied"

Write-Step "Configuring GitHub secret and variables"
$publishProfile = & $AzExe webapp deployment list-publishing-profiles --name $appName --resource-group $resourceGroup --xml
if ($LASTEXITCODE -ne 0 -or -not $publishProfile) {
    throw "Failed fetching publish profile"
}
$publishProfile | & $GhExe secret set AZURE_WEBAPP_PUBLISH_PROFILE --repo $ghRepo
if ($LASTEXITCODE -ne 0) { throw "Failed setting GitHub secret AZURE_WEBAPP_PUBLISH_PROFILE" }

$publishingCredentials = & $AzExe webapp deployment list-publishing-credentials --name $appName --resource-group $resourceGroup -o json | ConvertFrom-Json
if (-not $publishingCredentials -or -not $publishingCredentials.publishingUserName -or -not $publishingCredentials.publishingPassword -or -not $publishingCredentials.scmUri) {
    throw "Failed fetching publishing credentials"
}

$null = & $GhExe secret set AZURE_WEBAPP_PUBLISH_USER --repo $ghRepo --body "$($publishingCredentials.publishingUserName)"
if ($LASTEXITCODE -ne 0) { throw "Failed setting GitHub secret AZURE_WEBAPP_PUBLISH_USER" }

$null = & $GhExe secret set AZURE_WEBAPP_PUBLISH_PASSWORD --repo $ghRepo --body "$($publishingCredentials.publishingPassword)"
if ($LASTEXITCODE -ne 0) { throw "Failed setting GitHub secret AZURE_WEBAPP_PUBLISH_PASSWORD" }

$null = & $GhExe secret set AZURE_WEBAPP_SCM_URI --repo $ghRepo --body "$($publishingCredentials.scmUri)"
if ($LASTEXITCODE -ne 0) { throw "Failed setting GitHub secret AZURE_WEBAPP_SCM_URI" }

Run-OrFail { & $GhExe variable set AZURE_WEBAPP_NAME --body $appName --repo $ghRepo } "Failed setting GitHub variable AZURE_WEBAPP_NAME"
Run-OrFail { & $GhExe variable set VITE_AUTH_MODE --body "local" --repo $ghRepo } "Failed setting GitHub variable VITE_AUTH_MODE"
Write-Ok "GitHub CI/CD variables configured"

Write-Step "Applying database schema migrations"
$skipDbPush = $false
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $env:DATABASE_URL = $databaseUrl

    if (-not (Test-Path "./node_modules/drizzle-kit/bin.cjs")) {
        Write-Warn "node_modules not ready, running pnpm install first..."
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "pnpm install failed. Skipping db:push for now."
            $env:DATABASE_URL = ""
            $skipDbPush = $true
        }
    }

    if (-not $skipDbPush) {
        pnpm db:push
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Database migrations applied"
        } else {
            Write-Warn "pnpm db:push failed. You can rerun it later with DATABASE_URL already printed below."
        }
    }
} else {
    Write-Warn "pnpm not found. Skipping db migration step."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Setup complete" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Web App URL: https://$appName.azurewebsites.net" -ForegroundColor Green
Write-Host " Resource Group: $resourceGroup" -ForegroundColor Green
Write-Host " MySQL Server: $mysqlServer" -ForegroundColor Green
Write-Host " MySQL DB: $mysqlDbName" -ForegroundColor Green
Write-Host " MySQL Admin User: $mysqlAdminUser" -ForegroundColor Green
Write-Host " MySQL Admin Password: $mysqlAdminPassword" -ForegroundColor Yellow
Write-Host " DATABASE_URL: $databaseUrl" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Every push to main now builds and deploys automatically." -ForegroundColor Green
