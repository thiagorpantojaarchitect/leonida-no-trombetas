# Funções usadas pelos outros scripts.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTA_ESPERADA="494110627220"
REGIAO="${AWS_REGION:-sa-east-1}"
export AWS_REGION="$REGIAO" AWS_PAGER=""
conferir_conta() {
  local conta
  conta="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || { echo "Sessão AWS expirada. Rode: aws login"; exit 1; }
  [ "$conta" = "$CONTA_ESPERADA" ] || { echo "Conta errada: $conta (esperada $CONTA_ESPERADA). Nada foi feito."; exit 1; }
  # O Terraform não lê a sessão do "aws login" sozinho: repassa credenciais temporárias só para este processo.
  eval "$(aws configure export-credentials --format env 2>/dev/null)" || true
  echo "Conta conferida: $conta · região $REGIAO"
}
