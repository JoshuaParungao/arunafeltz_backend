$BaseUrl = "http://localhost:5000"
$Passed = 0
$Failed = 0

function Write-Pass {
  param([string]$Message)
  $script:Passed++
  Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Fail {
  param([string]$Message)
  $script:Failed++
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Read-ErrorBody {
  param($ErrorRecord)

  try {
    $response = $ErrorRecord.Exception.Response

    if ($null -eq $response) {
      return @{
        success = $false
        error = @{
          code = "NO_HTTP_RESPONSE"
          message = $ErrorRecord.Exception.Message
        }
      }
    }

    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()

    if ([string]::IsNullOrWhiteSpace($body)) {
      return @{
        success = $false
        error = @{
          code = "EMPTY_ERROR_BODY"
          message = $ErrorRecord.Exception.Message
        }
      }
    }

    return $body | ConvertFrom-Json
  }
  catch {
    return @{
      success = $false
      error = @{
        code = "POWERSHELL_ERROR_PARSE_FAILED"
        message = $ErrorRecord.Exception.Message
      }
    }
  }
}

function Invoke-ArunafeltzApi {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [string]$Body = $null
  )

  try {
    $params = @{
      Method = $Method
      Uri = $Uri
      UseBasicParsing = $true
    }

    if ($Headers.Count -gt 0) {
      $params.Headers = $Headers
    }

    if ($Body -ne $null) {
      $params.ContentType = "application/json"
      $params.Body = $Body
    }

    $response = Invoke-WebRequest @params
    return $response.Content | ConvertFrom-Json
  }
  catch {
    return Read-ErrorBody $_
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if ($Condition) {
    Write-Pass $Message
  }
  else {
    Write-Fail $Message
  }
}

function Assert-Equal {
  param(
    $Actual,
    $Expected,
    [string]$Message
  )

  if ($Actual -eq $Expected) {
    Write-Pass "$Message => $Actual"
  }
  else {
    Write-Fail "$Message => expected $Expected but got $Actual"
  }
}

function Assert-Near {
  param(
    [double]$Actual,
    [double]$Expected,
    [double]$Tolerance,
    [string]$Message
  )

  if ([Math]::Abs($Actual - $Expected) -le $Tolerance) {
    Write-Pass "$Message => $Actual"
  }
  else {
    Write-Fail "$Message => expected near $Expected but got $Actual"
  }
}

Write-Host ""
Write-Host "========================================"
Write-Host "ARUNAFELTZ PHASE 3 FINAL TEST - FIXED"
Write-Host "========================================"
Write-Host ""

# 1. Health Check
$health = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/health"
Assert-True ($health.success -eq $true) "Health endpoint returns success"
Assert-Equal $health.data.status "healthy" "Health status"

# 2. Super Owner Login
$superLogin = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/auth/login" -Body '{
  "identifier": "superowner",
  "password": "Password123!"
}'

Assert-True ($superLogin.success -eq $true) "Super Owner login success"

$superToken = $superLogin.data.token
$superHeaders = @{
  Authorization = "Bearer $superToken"
}

# 3. Admin Login
$adminLogin = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/auth/login" -Body '{
  "identifier": "mainadmin",
  "password": "Password123!"
}'

Assert-True ($adminLogin.success -eq $true) "Admin login success"

$adminToken = $adminLogin.data.token
$adminHeaders = @{
  Authorization = "Bearer $adminToken"
}

# 4. Settings Count
$settings = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings" -Headers $superHeaders
Assert-True ($settings.success -eq $true) "Super Owner can view settings"
Assert-Equal $settings.data.Count 14 "Settings count remains"

# 5. No Token Protection
$noTokenSettings = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings"
Assert-Equal $noTokenSettings.error.code "TOKEN_REQUIRED" "No token protected route"

# 6. Invalid Token Protection
$invalidTokenHeaders = @{
  Authorization = "Bearer invalid-token"
}

$invalidTokenSettings = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings" -Headers $invalidTokenHeaders
Assert-Equal $invalidTokenSettings.error.code "INVALID_TOKEN" "Invalid token protected route"

# 7. Super Owner Can Update Setting
$updateSetting = Invoke-ArunafeltzApi -Method "PATCH" -Uri "$BaseUrl/api/settings/scope/GLOBAL:quotation.suggested_retail_price_basis" -Headers $superHeaders -Body '{
  "value": 0.96
}'

Assert-True ($updateSetting.success -eq $true) "Super Owner can update setting"
Assert-Equal $updateSetting.data.value 0.96 "Updated suggested retail price basis"

# 8. Admin Cannot Manage Settings
$adminUpdateSetting = Invoke-ArunafeltzApi -Method "PATCH" -Uri "$BaseUrl/api/settings/scope/GLOBAL:quotation.suggested_retail_price_basis" -Headers $adminHeaders -Body '{
  "value": 0.96
}'

Assert-Equal $adminUpdateSetting.error.code "FORBIDDEN" "Admin cannot update setting"

# 9. Quotation Rules
$quotationRules = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings/business-rules/quotation" -Headers $superHeaders

Assert-True ($quotationRules.success -eq $true) "Quotation rules endpoint works"
Assert-Equal $quotationRules.data.basis.suggestedRetailPriceBasis 0.96 "Quotation SRP basis"
Assert-Equal $quotationRules.data.basis.regularPriceBasis 0.875 "Quotation regular price basis"

$quotationCompute = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/quotation/test-compute" -Headers $superHeaders -Body '{
  "items": [
    {
      "itemCode": "ITEM-001",
      "description": "Sample Item 1",
      "quantity": 2,
      "cashDiscountedPrice": 1000
    },
    {
      "itemCode": "ITEM-002",
      "description": "Sample Item 2",
      "quantity": 1,
      "cashDiscountedPrice": 500
    }
  ]
}'

Assert-True ($quotationCompute.success -eq $true) "Quotation computation works"
Assert-Equal $quotationCompute.data.totals.totalCashDiscountedPrice 2500 "Quotation total cash discounted price"
Assert-Near $quotationCompute.data.totals.suggestedRetailPrice 2604.17 0.01 "Quotation suggested retail price"
Assert-Near $quotationCompute.data.totals.regularPrice 2857.14 0.01 "Quotation regular price"

$quotationInvalid = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/quotation/test-compute" -Headers $superHeaders -Body '{
  "items": [
    {
      "itemCode": "BAD",
      "description": "Invalid",
      "quantity": 0,
      "cashDiscountedPrice": 1000
    }
  ]
}'

Assert-Equal $quotationInvalid.error.code "VALIDATION_ERROR" "Quotation invalid payload validation"

# 10. Installment Rules
$installmentRules = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings/business-rules/installment" -Headers $superHeaders

Assert-True ($installmentRules.success -eq $true) "Installment rules endpoint works"
Assert-Equal $installmentRules.data.termBasis.MONTH_12 0.875 "Installment MONTH_12 basis"
Assert-Equal $installmentRules.data.termBasis.MONTH_6 0.935 "Installment MONTH_6 basis"

$installmentCompute = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/installment/test-compute" -Headers $superHeaders -Body '{
  "cashPromoTotalAmount": 2500,
  "cashDownpayment": 500,
  "term": "MONTH_12"
}'

Assert-True ($installmentCompute.success -eq $true) "Installment MONTH_12 computation works"
Assert-Near $installmentCompute.data.result.regularPriceTotalAmount 2857.14 0.01 "Installment regular price total amount"
Assert-Near $installmentCompute.data.result.balance 2285.71 0.01 "Installment balance"

$installmentInvalidDownpayment = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/installment/test-compute" -Headers $superHeaders -Body '{
  "cashPromoTotalAmount": 2500,
  "cashDownpayment": 3000,
  "term": "MONTH_12"
}'

Assert-Equal $installmentInvalidDownpayment.error.code "INVALID_CASH_DOWNPAYMENT" "Installment invalid downpayment validation"

$installmentInvalidTerm = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/installment/test-compute" -Headers $superHeaders -Body '{
  "cashPromoTotalAmount": 2500,
  "cashDownpayment": 500,
  "term": "MONTH_99"
}'

Assert-Equal $installmentInvalidTerm.error.code "VALIDATION_ERROR" "Installment invalid term validation"

# 11. Warranty Rules
$warrantyRules = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings/business-rules/warranty" -Headers $superHeaders

Assert-True ($warrantyRules.success -eq $true) "Warranty rules endpoint works"
Assert-Equal $warrantyRules.data.rules.majorPartsMonths 12 "Warranty major parts months"
Assert-Equal $warrantyRules.data.rules.accessoriesDays 30 "Warranty accessories days"
Assert-Equal $warrantyRules.data.rules.outrightReplacementDays 7 "Warranty outright replacement days"

$majorWarranty = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/warranty/test-compute" -Headers $superHeaders -Body '{
  "productType": "MAJOR_PART",
  "purchaseDate": "2026-07-28"
}'

Assert-True ($majorWarranty.success -eq $true) "Major part warranty computation works"
Assert-Equal $majorWarranty.data.result.warrantyEndDate "2027-07-28" "Major part warranty end date"
Assert-Equal $majorWarranty.data.result.outrightReplacementUntil "2026-08-04" "Major part outright replacement until"

$accessoryWarranty = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/warranty/test-compute" -Headers $superHeaders -Body '{
  "productType": "ACCESSORY",
  "purchaseDate": "2026-07-28"
}'

Assert-True ($accessoryWarranty.success -eq $true) "Accessory warranty computation works"
Assert-Equal $accessoryWarranty.data.result.warrantyEndDate "2026-08-27" "Accessory warranty end date"
Assert-Equal $accessoryWarranty.data.result.outrightReplacementUntil "2026-08-04" "Accessory outright replacement until"

$warrantyInvalidType = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/warranty/test-compute" -Headers $superHeaders -Body '{
  "productType": "PRINTER",
  "purchaseDate": "2026-07-28"
}'

Assert-Equal $warrantyInvalidType.error.code "VALIDATION_ERROR" "Warranty invalid product type validation"

$warrantyInvalidDate = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/warranty/test-compute" -Headers $superHeaders -Body '{
  "productType": "MAJOR_PART",
  "purchaseDate": "invalid-date"
}'

Assert-Equal $warrantyInvalidDate.error.code "INVALID_PURCHASE_DATE" "Warranty invalid date validation"

# 12. Cash Box Rules
$cashBoxRules = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings/business-rules/cash-box" -Headers $superHeaders

Assert-True ($cashBoxRules.success -eq $true) "Cash box rules endpoint works"
Assert-Equal $cashBoxRules.data.rules.requireHandoverConfirmation $true "Cash box requires handover confirmation"
Assert-Equal $cashBoxRules.data.rules.defaultPaymentStatus "PENDING_HANDOVER" "Cash box default payment status"
Assert-Equal $cashBoxRules.data.rules.confirmedPaymentStatus "CONFIRMED_RECEIVED" "Cash box confirmed payment status"

$cashPending = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/cash-box/test-status" -Headers $superHeaders -Body '{
  "paymentAmount": 2500,
  "recordedByRole": "CASHIER",
  "isCustodianConfirmed": false
}'

Assert-True ($cashPending.success -eq $true) "Cash box pending handover test works"
Assert-Equal $cashPending.data.result.currentStatus "PENDING_HANDOVER" "Cash box pending current status"
Assert-Equal $cashPending.data.result.needsCustodianConfirmation $true "Cash box pending needs custodian confirmation"

$cashConfirmed = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/cash-box/test-status" -Headers $superHeaders -Body '{
  "paymentAmount": 2500,
  "recordedByRole": "CASHIER",
  "isCustodianConfirmed": true
}'

Assert-True ($cashConfirmed.success -eq $true) "Cash box confirmed received test works"
Assert-Equal $cashConfirmed.data.result.currentStatus "CONFIRMED_RECEIVED" "Cash box confirmed current status"
Assert-Equal $cashConfirmed.data.result.needsCustodianConfirmation $false "Cash box confirmed does not need custodian confirmation"

$cashInvalidAmount = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/cash-box/test-status" -Headers $superHeaders -Body '{
  "paymentAmount": 0,
  "recordedByRole": "CASHIER",
  "isCustodianConfirmed": false
}'

Assert-Equal $cashInvalidAmount.error.code "VALIDATION_ERROR" "Cash box invalid amount validation"

$cashInvalidRole = Invoke-ArunafeltzApi -Method "POST" -Uri "$BaseUrl/api/settings/business-rules/cash-box/test-status" -Headers $superHeaders -Body '{
  "paymentAmount": 2500,
  "recordedByRole": "CUSTOMER",
  "isCustodianConfirmed": false
}'

Assert-Equal $cashInvalidRole.error.code "VALIDATION_ERROR" "Cash box invalid role validation"

# 13. Final Settings Count
$finalSettings = Invoke-ArunafeltzApi -Method "GET" -Uri "$BaseUrl/api/settings" -Headers $superHeaders
Assert-Equal $finalSettings.data.Count 14 "Final settings count still"

Write-Host ""
Write-Host "========================================"
Write-Host "PHASE 3 FINAL TEST RESULT"
Write-Host "========================================"
Write-Host "PASSED: $Passed" -ForegroundColor Green
Write-Host "FAILED: $Failed" -ForegroundColor Red

if ($Failed -eq 0) {
  Write-Host "STATUS: PHASE 3 PASSED" -ForegroundColor Green
}
else {
  Write-Host "STATUS: PHASE 3 HAS FAILURES" -ForegroundColor Red
}
