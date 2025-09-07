const openapiSpec: Record<string, any> = {
  openapi: "3.0.3",
  info: {
    title: "WPP Sessions API",
    version: "1.0.0",
    description:
      "API para gerenciamento de sessões e envio de mensagens com balanceamento por workers. Use hostname para forçar destino específico. Use random para seleção aleatória."
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Workers" },
    { name: "Sessions" },
    { name: "Messages" },
    { name: "Utils" }
  ],
  components: {
    schemas: {
      StartRequest: {
        type: "object",
        required: ["session"],
        properties: {
          session: { type: "string", example: "bot1" },
          hostname: {
            type: "string",
            description:
              "Opcional. Informe o nome do worker. Use random, aleatorio, any ou * para seleção aleatória."
          }
        }
      },
      SendRequest: {
        type: "object",
        required: ["session", "number", "message"],
        properties: {
          session: { type: "string", example: "bot1" },
          number: { type: "string", example: "5599999999999" },
          message: { type: "string", example: "Olá" },
          hostname: {
            type: "string",
            description:
              "Opcional. Informe o nome do worker"
          },
          random:{
            type:"boolean",
            description:
              "Opcional. coloque true se quiser q seja aleatorio"
          }
        }
      },
      WorkerInfo: {
        type: "object",
        properties: {
          hostname: { type: "string" },
          startedAt: { type: "string", format: "date-time" },
          sessions: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  paths: {
    "/workers": {
      get: {
        tags: ["Workers"],
        summary: "Lista workers vivos e informações básicas",
        responses: {
          200: {
            description: "Lista de workers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    replicas: { type: "number" },
                    workers: { type: "array", items: { $ref: "#/components/schemas/WorkerInfo" } }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/start": {
      post: {
        tags: ["Sessions"],
        summary: "Inicia sessão. Pode direcionar por hostname. Sem hostname usa balanceamento",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/StartRequest" } }
          }
        },
        responses: {
          200: { description: "Solicitação de início enviada" },
          400: { description: "Requisição inválida" },
          409: { description: "Worker indisponível" }
        }
      }
    },
    "/send": {
      post: {
        tags: ["Messages"],
        summary: "Envia mensagem. Pode direcionar por hostname. Sem hostname usa balanceamento",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SendRequest" } }
          }
        },
        responses: {
          200: { description: "Envio roteado" },
          400: { description: "Requisição inválida" },
          409: { description: "Worker indisponível" }
        }
      }
    },
    "/qr/{session}": {
      get: {
        tags: ["Utils"],
        summary: "Retorna HTML com QRCode da sessão",
        parameters: [
          {
             name: "session", in: "path", required: true, schema: { type: "string" } 
            },
             {
                   name: "base64", in: "path", schema: { type: "bollean" } 
              },
        ],
        responses: {
          200: { description: "HTML com QRCode", content: { "text/html": { schema: { type: "string" } } } },
          404: { description: "QR não disponível" }
        }
      }
    },
    "/status/{session}": {
      get: {
        tags: ["Utils"],
        summary: "Retorna status recente da sessão",
        parameters: [
          { name: "session", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Status JSON" }
        }
      }
    }
  }
};
export{
    openapiSpec
}