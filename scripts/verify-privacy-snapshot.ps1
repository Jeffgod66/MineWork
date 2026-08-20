[CmdletBinding()]
param(
    [Parameter()]
    [string] $Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$scriptRelativePath = 'scripts/verify-privacy-snapshot.ps1'
$violations = [System.Collections.Generic.List[string]]::new()

function Add-Violation {
    param(
        [string] $Path,
        [string] $Reason
    )

    $violations.Add("$Path`:$Reason")
}

function Is-VendorPath {
    param([string] $Path)

    return $Path.StartsWith('resources/app/node_modules/', [System.StringComparison]::OrdinalIgnoreCase)
}

Push-Location -LiteralPath $resolvedRoot
try {
    $tracked = @(git -C $resolvedRoot ls-files)
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to read the tracked file list with git ls-files.'
    }

    $pathRules = @(
        '.edge-qa/', '.visual-qa/', '.codex-backup/', '.superpowers/', '.tools/',
        'dist/', 'build/', 'release/', 'out/', 'session-data', 'user-data',
        'browser-data', 'cookie', 'token', 'credential', 'journal', 'cache'
    )

    foreach ($path in $tracked) {
        $normalizedPath = $path.Replace('\', '/')
        $pathForMatching = $normalizedPath.ToLowerInvariant()
        $isVendor = Is-VendorPath $normalizedPath

        if (-not $isVendor) {
            foreach ($rule in $pathRules) {
                if ($pathForMatching.Contains($rule.ToLowerInvariant())) {
                    Add-Violation $normalizedPath "tracked path contains $rule"
                }
            }

            if ($pathForMatching.EndsWith('.log')) {
                Add-Violation $normalizedPath 'tracked path has forbidden .log extension'
            }
        }

        $binaryExtensions = @('.exe', '.pak', '.dat', '.bin', '.dll')
        foreach ($extension in $binaryExtensions) {
            if ($pathForMatching.EndsWith($extension) -and -not $isVendor) {
                Add-Violation $normalizedPath "tracked artifact has forbidden $extension extension"
            }
        }

        foreach ($extension in @('.db', '.sqlite', '.ldb', '.local', '.tmp')) {
            if ($pathForMatching.EndsWith($extension)) {
                Add-Violation $normalizedPath "tracked file has forbidden $extension extension"
            }
        }
    }

    $binaryExtensionsToSkip = @(
        '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.webp', '.woff', '.woff2',
        '.eot', '.ttf', '.otf', '.node', '.dll', '.exe', '.pak', '.dat', '.bin'
    )
    $utf8 = [System.Text.UTF8Encoding]::new($false, $true)
    $identityPatterns = [ordered]@{
        'Zhou Wan Qin' = 'identity string: Zhou Wan Qin'
        '周琬芹' = 'identity string: 周琬芹'
        '颜晟' = 'identity string: 颜晟'
        'MineWork · 已登录本机' = 'logged-in default label: MineWork · 已登录本机'
        'C:\Users\' = 'absolute Windows user path: C:\Users\'
        'C:/Users/' = 'absolute Windows user path: C:/Users/'
        'D:\MineWork' = 'absolute local path: D:\MineWork'
        'D:/MineWork' = 'absolute local path: D:/MineWork'
    }
    $emailPattern = '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'
    # This tracked test intentionally contains the identity fixtures it verifies;
    # Task 3 will replace those visible fixtures with non-real-name values.
    $contentScanExclusions = @('resources/app/tests/privacy-sanitization.test.js')

    foreach ($path in $tracked) {
        $normalizedPath = $path.Replace('\', '/')
        if ($normalizedPath.Equals($scriptRelativePath, [System.StringComparison]::OrdinalIgnoreCase) -or
            ($contentScanExclusions -contains $normalizedPath) -or
            (Is-VendorPath $normalizedPath)) {
            continue
        }

        $extension = [System.IO.Path]::GetExtension($normalizedPath).ToLowerInvariant()
        if ($binaryExtensionsToSkip -contains $extension) {
            continue
        }

        $fullPath = Join-Path $resolvedRoot ($normalizedPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        try {
            $content = $utf8.GetString([System.IO.File]::ReadAllBytes($fullPath))
        } catch [System.Text.DecoderFallbackException] {
            continue
        } catch [System.IO.IOException] {
            continue
        }

        foreach ($entry in $identityPatterns.GetEnumerator()) {
            if ($content.IndexOf($entry.Key, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Add-Violation $normalizedPath $entry.Value
            }
        }

        if ([System.Text.RegularExpressions.Regex]::IsMatch($content, $emailPattern)) {
            Add-Violation $normalizedPath 'email-shaped value detected'
        }
    }
} finally {
    Pop-Location
}

if ($violations.Count -gt 0) {
    foreach ($violation in ($violations | Sort-Object -Unique)) {
        Write-Output $violation
    }
    Write-Output ("Summary: {0} violation(s) detected." -f (($violations | Sort-Object -Unique).Count))
    exit 1
}

Write-Output 'Summary: clean; 0 violations detected.'
exit 0
