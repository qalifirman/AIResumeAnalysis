$ErrorActionPreference = "Stop"

$PROJECT_URL = $env:SUPABASE_URL
$ANON_KEY    = $env:SUPABASE_ANON_KEY
$HR_INVITE   = $env:HR_SIGNUP_INVITE_CODE
$DEMO_PASS   = if ($env:DEMO_PASSWORD) { $env:DEMO_PASSWORD } else { Read-Host "Demo account password" }

if (-not $PROJECT_URL -or -not $ANON_KEY) {
    throw "Set SUPABASE_URL and SUPABASE_ANON_KEY before running this script."
}

$BASE     = "$PROJECT_URL/functions/v1/server"
$AUTH_URL = "$PROJECT_URL/auth/v1/token?grant_type=password"

function Signup($email, $password, $name, $role) {
    $payload = @{ email=$email; password=$password; name=$name; role=$role }
    if ($role -eq "hr") {
        if (-not $HR_INVITE) { throw "Set HR_SIGNUP_INVITE_CODE before creating HR demo accounts." }
        $payload.inviteCode = $HR_INVITE
    }
    $body = $payload | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE/signup" -Method POST `
        -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer $ANON_KEY" } `
        -Body $body | Out-Null
    Write-Host "  [OK] Signup requested for $name ($role)"
}

function Login($email, $password) {
    $body = @{ email=$email; password=$password } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri $AUTH_URL -Method POST `
        -Headers @{ "Content-Type"="application/json"; "apikey"=$ANON_KEY } `
        -Body $body
    return $r.access_token
}

function CreateJob($token, $job) {
    $body = $job | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE/jobs" -Method POST `
        -Headers @{ "Content-Type"="application/json"; "Authorization"="Bearer $token" } `
        -Body $body | Out-Null
    Write-Host "  [OK] Created job: $($job.title)"
}

$hr1Email = "hr.technova@demo.com"
Write-Host "`n>>> Creating HR: TechNova Solutions"
Signup $hr1Email $DEMO_PASS "TechNova Solutions" "hr"
$token1 = Login $hr1Email $DEMO_PASS

CreateJob $token1 @{
    title               = "Senior Frontend Developer"
    description         = "Lead frontend development for accessible, performant web applications using React and TypeScript."
    requirements        = @("React", "TypeScript", "Tailwind CSS", "REST API", "Git")
    salary_range        = "RM 8,000 - RM 12,000"
    department          = "Technology"
    employment_type     = "full-time"
    required_years_exp  = 3
    location            = "Kuala Lumpur, Malaysia"
    work_mode           = "hybrid"
    company_name        = "TechNova Solutions"
}

CreateJob $token1 @{
    title               = "Backend Engineer (Node.js)"
    description         = "Build scalable APIs, services, and database integrations for a SaaS platform."
    requirements        = @("Node.js", "Express", "PostgreSQL", "Docker", "REST API")
    salary_range        = "RM 7,000 - RM 10,000"
    department          = "Technology"
    employment_type     = "full-time"
    required_years_exp  = 2
    location            = "Kuala Lumpur, Malaysia"
    work_mode           = "remote"
    company_name        = "TechNova Solutions"
}

$hr2Email = "hr.healthbridge@demo.com"
Write-Host "`n>>> Creating HR: HealthBridge Group"
Signup $hr2Email $DEMO_PASS "HealthBridge Group" "hr"
$token2 = Login $hr2Email $DEMO_PASS

CreateJob $token2 @{
    title               = "Health Data Analyst"
    description         = "Analyze clinical and operational data to improve patient outcomes and reporting workflows."
    requirements        = @("SQL", "Python", "Power BI", "Data Analysis", "Healthcare")
    salary_range        = "RM 5,500 - RM 8,000"
    department          = "Medical"
    employment_type     = "full-time"
    required_years_exp  = 1
    location            = "Petaling Jaya, Malaysia"
    work_mode           = "hybrid"
    company_name        = "HealthBridge Group"
}

CreateJob $token2 @{
    title               = "Medical Software Developer"
    description         = "Develop clinical information systems and patient management software in a regulated healthcare environment."
    requirements        = @("Java", "Spring Boot", "HL7 FHIR", "MySQL", "Software Testing")
    salary_range        = "RM 7,500 - RM 11,000"
    department          = "Medical"
    employment_type     = "full-time"
    required_years_exp  = 3
    location            = "Kuala Lumpur, Malaysia"
    work_mode           = "on-site"
    company_name        = "HealthBridge Group"
}

Write-Host "`n>>> Creating applicants"
Signup "alex.johnson@demo.com" $DEMO_PASS "Alex Johnson" "applicant"
Signup "sarah.chen@demo.com" $DEMO_PASS "Sarah Chen" "applicant"

Write-Host "`nDemo data script completed."
Write-Host "If email verification is enabled, verify demo accounts before login."
