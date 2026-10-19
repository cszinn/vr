require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// O SDK lê automaticamente a variável GEMINI_API_KEY do ambiente
const ai = new GoogleGenAI({});

const SYSTEM_INSTRUCTION = `Você é o orquestrador espacial de uma Sala de Realidade Virtual no Meta Quest 3. Converta o pedido de voz do usuário em um array JSON estrito de comandos.
Operações permitidas (op): 'spawn', 'modify', 'remove', 'set_environment', 'set_lighting', 'clear_scene'.
Campos de cada item do array:
- op (string, obrigatório)
- instance_id (string opcional, ex: 'cavalo_1')
- asset_id (string opcional, ex: 'animal_horse', 'env_corral', 'prop_cube')
- placement (objeto opcional: { mode: 'relative_to_user' | 'absolute', direction: 'front' | 'back' | 'left' | 'right', distance_m: number, vertical: 'ground' | 'eye_level' })
- scale (objeto opcional: { mode: 'multiply' | 'set', value: number })
Retorne APENAS um array JSON válido.`;

// Middlewares
app.use(cors());
app.use(express.json());

// Rota principal de comandos de cena
app.post('/api/v1/scene/command', async (req, res) => {
  try {
    const { transcript, user_position, user_rotation_y } = req.body;

    console.log('--- Novo comando recebido ---');
    console.log('transcript:', transcript);
    console.log('user_position:', user_position);
    console.log('user_rotation_y:', user_rotation_y);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: JSON.stringify({ transcript, user_position, user_rotation_y }),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      },
    });

    const commands = JSON.parse(response.text);
    console.log('commands:', JSON.stringify(commands, null, 2));

    res.json({ status: 'ok', commands });
  } catch (err) {
    console.error('Erro ao gerar comandos:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`VR Room BFF rodando em http://localhost:${PORT}`);
});
