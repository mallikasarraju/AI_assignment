const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const openai = require('openai');
const pdfParse = require('pdf-parse');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = new openai.OpenAI({ apiKey: openaiApiKey });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let knowledgeBaseEmbeddings = [];
let pdfTexts = [];
let isFileUploaded = false;

app.post('/api/chat', async (req, res) => {
  const userQuery = req.body.query;

  try {
    let botResponse = '';

    if (isFileUploaded) {
      botResponse = await answerQueryWithEmbeddings(userQuery, knowledgeBaseEmbeddings, pdfTexts);
    } else {
      botResponse = await generateResponseWithOpenAI(userQuery);
    }

    res.json({ botResponse });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/learn', upload.array('pdfs', 3), async (req, res) => {
  console.log('Hit learn');
  try {
    console.log(req.files);

    if (req.files && req.files.length > 0) {
      const pdfBuffers = req.files.slice(0, 3).map(file => file.buffer);
      pdfTexts = await Promise.all(pdfBuffers.map(extractTextFromPDF));
      knowledgeBaseEmbeddings = await Promise.all(pdfTexts.map(generateEmbeddings));
      isFileUploaded = true;
      console.log(isFileUploaded);
    }
    res.status(200).json({ message: 'Generated Embeddings' });
  } catch (error) {
    console.error('Error generating embeddings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function extractTextFromPDF(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  console.log('Extracted text from pdf');
  return data.text;
}

async function generateEmbeddings(text) {
  const embedding = await openaiClient.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  return embedding.data[0].embedding;
}

async function answerQueryWithEmbeddings(userQuery, knowledgeBaseEmbeddings, pdfTexts) {
  const prompt = `Context - ${pdfTexts.join('\n')} - Now reply to the following question/statement - ${userQuery}`;
  console.log(prompt);
  const response = await openaiClient.completions.create({
    model: 'text-davinci-003',
    prompt: prompt,
    temperature: 0.25,
    max_tokens: 200,
  });
  console.log(knowledgeBaseEmbeddings);
  return response.choices[0].text.trim();
}

async function generateResponseWithOpenAI(userQuery) {
  const response = await openaiClient.completions.create({
    model: 'text-davinci-003',
    prompt: userQuery,
    temperature: 0.25,
    max_tokens: 200,
  });
  console.log(userQuery);
  return response.choices[0].text.trim();
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
