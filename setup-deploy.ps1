# =============================================================
# WorkForce Manager - Azure App Service + PostgreSQL setup
# Interactive steps: Azure login + GitHub login (optional)
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

function Ensure-AzProviderRegistered {
    param([string]$Namespace)

    $state = & $AzExe provider show --namespace $Namespace --query registrationState --output tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $state -eq "Registered") {
        Write-Ok "Azure provider $Namespace already registered"
        return
    }

    Write-Warn "Registering Azure provider $Namespace..."
    Run-OrFail { & $AzExe provider register --namespace $Namespace --wait --output none } "Failed registering provider $Namespace"
    Write-Ok "Azure provider $Namespace registered"
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

Write-Step "Checking Azure provider registrations"
Ensure-AzProviderRegistered "Microsoft.Web"
Ensure-AzProviderRegistered "Microsoft.DBforPostgreSQL"

Write-Step "Deriving resource names"
$repoName = ($ghRepo -split "/")[-1]
$safeBase = To-SafeName $repoName
$suffix = -join ((97..122) + (48..57) | Get-Random -Count 6 | ForEach-Object {[char]$_})

$preferredLocation = "westeurope"
$pgCandidateLocations = @("westeurope", "northeurope", "swedencentral", "francecentral", "italynorth")
$location = $preferredLocation
$resourceGroup = "$safeBase-rg"
$appName = ("$safeBase-$suffix").Substring(0, [Math]::Min(("$safeBase-$suffix").Length, 60)).Trim('-')
$planName = "$safeBase-plan"
$pgServer = ("$safeBase-pg-$suffix").Substring(0, [Math]::Min(("$safeBase-pg-$suffix").Length, 63)).Trim('-')
$pgDbName = "workforce_manager"
$pgAdminUser = "wfmadmin"
$pgAdminPassword = "Wfm!" + (New-RandomToken 18)
$jwtSecret = New-RandomToken 32

Write-Ok "Resource group: $resourceGroup"
Write-Ok "Web app: $appName"
Write-Ok "PostgreSQL server: $pgServer"

Write-Step "Creating resource group"
Run-OrFail { & $AzExe group create --name $resourceGroup --location $location --output none } "Failed creating resource group"
Write-Ok "Resource group ready"

Write-Step "Creating App Service plan"
Run-OrFail { & $AzExe appservice plan create --name $planName --resource-group $resourceGroup --sku B1 --is-linux --output none } "Failed creating App Service plan"
Write-Ok "App Service plan ready"

Write-Step "Creating Web App (Node 22 LTS)"
Run-OrFail { & $AzExe webapp create --name $appName --resource-group $resourceGroup --plan $planName --runtime "NODE:22-lts" --output none } "Failed creating Web App"
Run-OrFail { & $AzExe webapp config set --name $appName --resource-group $resourceGroup --startup-file "node dist/index.js" --output none } "Failed setting startup command"
Write-Ok "Web App ready"

Write-Step "Creating Azure PostgreSQL Flexible Server"
$pgCreated = $false
foreach ($candidateLocation in $pgCandidateLocations) {
    for ($i = 1; $i -le 3; $i++) {
        $candidateSuffix = -join ((97..122) + (48..57) | Get-Random -Count 4 | ForEach-Object {[char]$_})
        $candidateServer = ("$safeBase-pg-$suffix-$candidateSuffix").Substring(0, [Math]::Min(("$safeBase-pg-$suffix-$candidateSuffix").Length, 63)).Trim('-')
        Write-Warn "Trying PostgreSQL create in $candidateLocation with server $candidateServer (attempt $i/3)"
        & $AzExe postgres flexible-server create `
          --resource-group $resourceGroup `
          --name $candidateServer `
          --location $candidateLocation `
          --admin-user $pgAdminUser `
          --admin-password $pgAdminPassword `
          --sku-name Standard_B1ms `
          --tier Burstable `
          --version 16 `
          --storage-size 32 `
          --public-access 0.0.0.0 `
          --yes `
          --output none
        if ($LASTEXITCODE -eq 0) {
            $pgServer = $candidateServer
            $location = $candidateLocation
            $pgCreated = $true
            break
        }
    }
    if ($pgCreated) { break }
}

if (-not $pgCreated) {
    throw "Failed creating PostgreSQL server in tested regions: $($pgCandidateLocations -join ', ')"
}
Write-Ok "PostgreSQL server ready in ${location}: $pgServer"

$publicIp = ""
try {
    $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org").ToString()
} catch {
    Write-Warn "Could not detect your public IP automatically; local DB access may require manual firewall rule."
}

if ($publicIp) {
    Run-OrFail {
        & $AzExe postgres flexible-server firewall-rule create `
          --resource-group $resourceGroup `
          --server-name $pgServer `
          --name allow-local-setup `
          --start-ip-address $publicIp `
          --end-ip-address $publicIp `
          --output none
    } "Failed adding local IP firewall rule"
}

Run-OrFail {
    & $AzExe postgres flexible-server db create `
      --resource-group $resourceGroup `
      --server-name $pgServer `
    --name $pgDbName `
      --output none
} "Failed creating PostgreSQL database"

$pgHost = "$pgServer.postgres.database.azure.com"
$escapedUser = [System.Uri]::EscapeDataString($pgAdminUser)
$escapedPass = [System.Uri]::EscapeDataString($pgAdminPassword)
$databaseUrl = ('postgresql://{0}:{1}@{2}:5432/{3}?sslmode=require' -f $escapedUser, $escapedPass, $pgHost, $pgDbName)
Write-Ok "PostgreSQL database ready"

Write-Step "Applying Azure Web App environment variables"
$appSettings = @(
    "DATABASE_URL=$databaseUrl",
    "JWT_SECRET=$jwtSecret",
    "NODE_ENV=production"
)
Run-OrFail { & $AzExe webapp config appsettings set --name $appName --resource-group $resourceGroup --settings $appSettings --output none } "Failed setting app settings"
Write-Ok "App settings applied"

Write-Step "Applying database migrations (npm run db:migrate)"
$env:DATABASE_URL = $databaseUrl
if (Get-Command npm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path "./node_modules")) {
        npm ci
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm ci failed. Skipping migration step for now."
            $env:DATABASE_URL = ""
        }
    }

    if ($env:DATABASE_URL) {
        npm run db:migrate
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Database migrations applied"
        } else {
            Write-Warn "npm run db:migrate failed. You can rerun manually with DATABASE_URL shown below."
        }
    }
} else {
    Write-Warn "npm not found. Skipping migration step."
}

Write-Step "Optional GitHub CI/CD secrets setup"
if (Test-Path ".github/workflows/deploy.yml") {
    & $GhExe auth status 2>$null
    if ($LASTEXITCODE -ne 0) {
        Run-OrFail { & $GhExe auth login --hostname github.com --web } "GitHub login failed"
    }

    $subscriptionId = & $AzExe account show --query id --output tsv
    if ($LASTEXITCODE -ne 0 -or -not $subscriptionId) {
        throw "Failed getting Azure subscription ID"
    }

    $scmPolicyId = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Web/sites/$appName/basicPublishingCredentialsPolicies/scm"
    Run-OrFail {
        & $AzExe resource update --ids $scmPolicyId --api-version "2022-03-01" --set properties.allow=true --output none
    } "Failed enabling SCM publishing credentials"

    $publishProfile = & $AzExe webapp deployment list-publishing-profiles --name $appName --resource-group $resourceGroup --xml
    if ($LASTEXITCODE -ne 0 -or -not $publishProfile) {
        throw "Failed fetching publish profile"
    }

    $publishProfile | & $GhExe secret set AZURE_WEBAPP_PUBLISH_PROFILE --repo $ghRepo
    if ($LASTEXITCODE -ne 0) { throw "Failed setting GitHub secret AZURE_WEBAPP_PUBLISH_PROFILE" }

    Run-OrFail { & $GhExe variable set AZURE_WEBAPP_NAME --body $appName --repo $ghRepo } "Failed setting GitHub variable AZURE_WEBAPP_NAME"
    Write-Ok "GitHub CI/CD secrets/variables configured"
} else {
    Write-Warn "No .github/workflows/deploy.yml found. Skipping GitHub secrets setup."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Setup complete" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Web App URL: https://$appName.azurewebsites.net" -ForegroundColor Green
Write-Host " Resource Group: $resourceGroup" -ForegroundColor Green
Write-Host " PostgreSQL Server: $pgServer" -ForegroundColor Green
Write-Host " PostgreSQL DB: $pgDbName" -ForegroundColor Green
Write-Host " PostgreSQL Admin User: $pgAdminUser" -ForegroundColor Green
Write-Host " PostgreSQL Admin Password: $pgAdminPassword" -ForegroundColor Yellow
Write-Host " DATABASE_URL: $databaseUrl" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host "If you add a deploy workflow, rerun this script to push GitHub secrets." -ForegroundColor Green
