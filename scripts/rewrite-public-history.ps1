param(
  [string]$ReplaceTextFile,
  [string]$PathRenameJsonFile,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
  throw "git-filter-repo is required. Install it first, then rerun this script."
}

$status = git status --porcelain
if ($status -and -not $Force) {
  throw "Working tree must be clean before rewriting history. Commit or stash changes, or rerun with -Force if you know what you are doing."
}

$repoRoot = git rev-parse --show-toplevel
if (-not $ReplaceTextFile) {
  throw "Pass -ReplaceTextFile with a git-filter-repo replace-text file kept outside the repository."
}

$replaceFile = Resolve-Path -LiteralPath $ReplaceTextFile

$filterArgs = @(
  "--force",
  "--replace-text", $replaceFile
)

if ($PathRenameJsonFile) {
  $renameFile = Resolve-Path -LiteralPath $PathRenameJsonFile
  $env:PUBLIC_HISTORY_PATH_RENAMES = $renameFile
  $filterArgs += @(
    "--filename-callback",
    "import json, os; mapping = {k.encode(): v.encode() for k, v in json.load(open(os.environ['PUBLIC_HISTORY_PATH_RENAMES'], encoding='utf-8')).items()}; filename = mapping.get(filename, filename)"
  )
}

$filterArgs += @(
  "--path", ".agents",
  "--path", ".codex",
  "--path", "docs/superpowers",
  "--path", "docs/plans",
  "--path", "docs/diagnoza-problemow-2026-05-13.md",
  "--path", "docs/pelny-audit-2026-05-13.md",
  "--path", "apps/backend/CLAUDE.md",
  "--invert-paths"
)

git filter-repo @filterArgs

Write-Host "History rewritten locally. Re-run repository scans before pushing."
