# VR Room BFF

Backend for Frontend (BFF) para orquestração espacial de cenas em Realidade Virtual (Meta Quest 3), utilizando a API do Google Gemini (`gemini-2.5-flash`).

## 🚀 Funcionalidades

- **Processamento de Linguagem Natural**: Converte transcrições de comandos de voz do usuário em comandos estruturados para a cena 3D via Gemini.
- **Operações Espaciais**: Geração de comandos como `spawn`, `modify`, `remove`, `set_environment`, `set_lighting` e `clear_scene`.
- **Cálculo de Posicionamento**: Suporte a posicionamento relativo ao usuário (`mode`, `direction`, `distance_m`, `vertical`) e escala.

## 🛠️ Tecnologias

- [Node.js](https://nodejs.org/)
- [Express 5](https://expressjs.com/)
- [@google/genai](https://www.npmjs.com/package/@google/genai)
- [dotenv](https://www.npmjs.com/package/dotenv)
- [cors](https://www.npmjs.com/package/cors)

## 📋 Pré-requisitos

- Node.js instalado (v18+)
- Uma chave de API do Google Gemini ([Google AI Studio](https://aistudio.google.com/))

## ⚙️ Instalação e Execução

1. Clone o repositório:
   ```bash
   git clone https://github.com/cszinn/vr.git
   cd vr
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   - Copie o arquivo `.env.example` para `.env`:
     ```bash
     cp .env.example .env
     ```
   - Preencha sua `GEMINI_API_KEY` no arquivo `.env`.

4. Inicie o servidor:
   ```bash
   npm start
   ```
   O servidor estará rodando em `http://localhost:3000`.

## 📡 API Endpoints

### `POST /api/v1/scene/command`

Envia transcrição de voz e coordenadas do usuário para processamento de cena.

**Payload de Exemplo:**
```json
{
  "transcript": "Coloque um cavalo na minha frente a 3 metros",
  "user_position": { "x": 0, "y": 1.7, "z": 0 },
  "user_rotation_y": 0
}
```

**Resposta de Exemplo:**
```json
{
  "status": "ok",
  "commands": [
    {
      "op": "spawn",
      "instance_id": "cavalo_1",
      "asset_id": "animal_horse",
      "placement": {
        "mode": "relative_to_user",
        "direction": "front",
        "distance_m": 3,
        "vertical": "ground"
      }
    }
  ]
}
```
