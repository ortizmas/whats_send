#!/bin/bash

# Total de mensagens
TOTAL=10

# Sessão que vai enviar
SESSION="bot1"

# Número destino
NUMBER="554791877265"

# URL da API
API="http://localhost:3000"

# Enviar para um worker aleatório
RANDOM_FLAG=true

for i in $(seq 1 "$TOTAL"); do
  PAYLOAD=$(cat <<EOF
{
  "session": "$SESSION",
  "number": "$NUMBER",
  "message": "Mensagem de teste $i",
  "random": $( [ "$RANDOM_FLAG" = true ] && echo true || echo false )
}
EOF
)
  curl -s -X POST "$API/send" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" &
done

wait
echo "✅ $TOTAL mensagens enviadas!"
