# API test script — scanner-dashboard backend
# Run: powershell -ExecutionPolicy Bypass -File backend\test_api.ps1
$ErrorActionPreference = "Continue"
$base = "http://localhost:8000"
$results = @()

function Test-Step {
    param([string]$Name, [scriptblock]$Block)
    try {
        $out = & $Block
        $script:results += [pscustomobject]@{ Test = $Name; Result = "PASS"; Detail = "$out" }
        Write-Host "PASS  $Name  $out"
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $msg = $_.ErrorDetails.Message
        if (-not $msg) { $msg = $_.Exception.Message }
        $script:results += [pscustomobject]@{ Test = $Name; Result = "FAIL"; Detail = "HTTP $status $msg" }
        Write-Host "FAIL  $Name  HTTP $status $msg"
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Path, [object]$Body, [string]$Token, [switch]$Raw)
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{ Method = $Method; Uri = "$base$Path"; Headers = $headers; TimeoutSec = 60 }
    if ($null -ne $Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 5)
        $params["ContentType"] = "application/json"
    }
    Invoke-RestMethod @params
}

# Helper: expect a specific HTTP error status
function Expect-Error {
    param([string]$Method, [string]$Path, [object]$Body, [string]$Token, [int]$ExpectStatus)
    try {
        Invoke-Api -Method $Method -Path $Path -Body $Body -Token $Token | Out-Null
        throw "expected HTTP $ExpectStatus but request succeeded"
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -ne $ExpectStatus) { throw "expected HTTP $ExpectStatus, got $status : $($_.ErrorDetails.Message)" }
        return "got expected $ExpectStatus"
    }
}

Write-Host "`n=== 1. Health ==="
Test-Step "GET /api/health" { (Invoke-Api GET "/api/health").status }

Write-Host "`n=== 2. Auth ==="
$adminToken = $null; $guestToken = $null
Test-Step "login kartik -> admin role" {
    $r = Invoke-Api POST "/api/auth/login" @{ email = "kartik@scanner.io"; password = "kartik" }
    $script:adminToken = $r.access_token
    if ($r.user.role -ne "admin") { throw "role is '$($r.user.role)', expected admin" }
    "role=$($r.user.role)"
}
Test-Step "login guest -> user role" {
    $r = Invoke-Api POST "/api/auth/login" @{ email = "guest"; password = "guest" }
    $script:guestToken = $r.access_token
    if ($r.user.role -ne "user") { throw "role is '$($r.user.role)', expected user" }
    "role=$($r.user.role)"
}

Write-Host "`n=== 3. Admin endpoints ==="
Test-Step "GET /api/admin/users (admin) -> 200" {
    $r = Invoke-Api GET "/api/admin/users" -Token $adminToken
    "count=$($r.Count)"
}
Test-Step "GET /api/admin/users (guest) -> 403" { Expect-Error GET "/api/admin/users" -Token $guestToken -ExpectStatus 403 }

$testUserId = $null
Test-Step "POST /api/admin/users -> 201" {
    $r = Invoke-Api POST "/api/admin/users" @{ email = "testuser@example.com"; name = "Test User"; password = "testpass123"; role = "user"; plan = "free" } -Token $adminToken
    $script:testUserId = $r.id
    "id=$($r.id) role=$($r.role)"
}
Test-Step "POST duplicate user -> 400" { Expect-Error POST "/api/admin/users" @{ email = "testuser@example.com"; name = "Dup"; password = "testpass123" } -Token $adminToken -ExpectStatus 400 }
Test-Step "PATCH /api/admin/users/{id} plan=pro role=user" {
    $r = Invoke-Api PATCH "/api/admin/users/$testUserId" @{ plan = "pro" } -Token $adminToken
    if ($r.plan -ne "pro") { throw "plan=$($r.plan)" }
    "plan=$($r.plan)"
}
Test-Step "POST reset-password -> 200" {
    (Invoke-Api POST "/api/admin/users/$testUserId/reset-password" @{ new_password = "newpass1234" } -Token $adminToken).message
}
Test-Step "login testuser with new password" {
    $r = Invoke-Api POST "/api/auth/login" @{ email = "testuser@example.com"; password = "newpass1234" }
    "ok role=$($r.user.role)"
}
Test-Step "DELETE /api/admin/users/{id} -> 200" {
    (Invoke-Api DELETE "/api/admin/users/$testUserId" -Token $adminToken).message
}
Test-Step "GET /api/admin/stats -> 200" {
    $r = Invoke-Api GET "/api/admin/stats" -Token $adminToken
    "users=$($r.total_users) scans=$($r.total_scans) picks=$($r.total_picks) trades=$($r.total_trades) cats=$($r.total_categories)"
}

Write-Host "`n=== 4. Categories (guest token) ==="
$catId = $null
Test-Step "POST /api/categories -> 201" {
    $r = Invoke-Api POST "/api/categories" @{ name = "Test"; color = "green" } -Token $guestToken
    $script:catId = $r.id
    "id=$($r.id) color=$($r.color)"
}
Test-Step "GET /api/categories -> contains Test" {
    $r = Invoke-Api GET "/api/categories" -Token $guestToken
    if (-not ($r | Where-Object { $_.name -eq "Test" })) { throw "Test category missing" }
    "count=$($r.Count)"
}
Test-Step "POST item RELIANCE.NS -> normalized RELIANCE" {
    $r = Invoke-Api POST "/api/categories/$catId/items" @{ symbol = "RELIANCE.NS" } -Token $guestToken
    if ($r.symbol -ne "RELIANCE") { throw "symbol=$($r.symbol), expected RELIANCE" }
    "symbol=$($r.symbol)"
}
Test-Step "POST duplicate item -> 400" { Expect-Error POST "/api/categories/$catId/items" @{ symbol = "RELIANCE" } -Token $guestToken -ExpectStatus 400 }
Test-Step "GET /api/categories/symbol/RELIANCE -> contains cat" {
    $r = Invoke-Api GET "/api/categories/symbol/RELIANCE" -Token $guestToken
    if (-not ($r | Where-Object { $_.id -eq $catId })) { throw "category not returned" }
    "count=$($r.Count)"
}
Test-Step "per-user isolation: kartik does NOT see guest category" {
    $r = Invoke-Api GET "/api/categories" -Token $adminToken
    if ($r | Where-Object { $_.id -eq $catId }) { throw "ISOLATION BREACH: kartik sees guest category" }
    "isolated ok"
}
Test-Step "DELETE item -> 200" {
    (Invoke-Api DELETE "/api/categories/$catId/items/RELIANCE" -Token $guestToken).message
}
Test-Step "PATCH hide -> is_hidden true" {
    $r = Invoke-Api PATCH "/api/categories/$catId" @{ is_hidden = $true } -Token $guestToken
    if (-not $r.is_hidden) { throw "is_hidden=$($r.is_hidden)" }
    "is_hidden=$($r.is_hidden)"
}
Test-Step "DELETE category -> 200" {
    (Invoke-Api DELETE "/api/categories/$catId" -Token $guestToken).message
}

Write-Host "`n=== 5. OHLCV charts ==="
Test-Step "GET /api/charts/RELIANCE/ohlcv?timeframe=daily" {
    $r = Invoke-Api GET "/api/charts/RELIANCE/ohlcv?timeframe=daily" -Token $guestToken
    if (-not $r.bars -or $r.bars.Count -lt 1) { throw "no bars returned" }
    "bars=$($r.bars.Count) first=$($r.bars[0].time) last=$($r.bars[-1].time)"
}
Test-Step "GET ohlcv second call (cached, fast)" {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-Api GET "/api/charts/RELIANCE/ohlcv?timeframe=daily" -Token $guestToken
    $sw.Stop()
    "bars=$($r.bars.Count) elapsed=$($sw.ElapsedMilliseconds)ms"
}

Write-Host "`n=== 6. Regression: existing endpoints ==="
Test-Step "GET /api/scans" { $r = Invoke-Api GET "/api/scans" -Token $adminToken; "count=$($r.Count)" }
Test-Step "GET /api/tracker" { $r = Invoke-Api GET "/api/tracker" -Token $adminToken; "ok" }
Test-Step "GET /api/screens" { $r = Invoke-Api GET "/api/screens" -Token $adminToken; "count=$($r.Count)" }
Test-Step "GET /api/alerts" { $r = Invoke-Api GET "/api/alerts" -Token $adminToken; "count=$($r.Count)" }

Write-Host "`n=== 7. Rate limit: hammer login >10/min ==="
Test-Step "login rate limit -> 429 eventually" {
    $got429 = $false
    for ($i = 1; $i -le 15; $i++) {
        try {
            Invoke-Api POST "/api/auth/login" @{ email = "hammer@nope.io"; password = "wrongpass" } | Out-Null
        } catch {
            $status = $null
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            if ($status -eq 429) { $got429 = $true; break }
        }
    }
    if (-not $got429) { throw "never got 429 after 15 attempts" }
    "429 after $i attempts"
}

Write-Host "`n=== SUMMARY ==="
$results | Format-Table -AutoSize | Out-String | Write-Host
$fails = ($results | Where-Object { $_.Result -eq "FAIL" }).Count
Write-Host "TOTAL: $($results.Count)  FAIL: $fails"
exit $fails
