#!/usr/bin/env bash
# Cria, uma única vez, o bucket que guarda o estado do Terraform (privado, versionado, cifrado).
source "$(dirname "$0")/comum.sh"; conferir_conta
B="leonida-trombetas-tfstate-$CONTA_ESPERADA"
if aws s3api head-bucket --bucket "$B" 2>/dev/null; then echo "Bucket de estado já existe: $B"; else
  aws s3api create-bucket --bucket "$B" --region "$REGIAO" --create-bucket-configuration LocationConstraint="$REGIAO" >/dev/null
  echo "Criado: $B"
fi
aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$B" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
cd "$RAIZ/infra" && terraform init -backend-config=backend.hcl -input=false
echo "Pronto. Próximo passo: scripts/infra.sh plano"
