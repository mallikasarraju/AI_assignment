const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const openai = require('openai');
const pdfParse = require('pdf-parse');
const multer = require('multer');
require('dotenv').config();
const XLSX = require('xlsx');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = new openai.OpenAI({ apiKey: openaiApiKey });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const database = XLSX.readFile('pdfEmbeddings.xlsx');
const worksheet = database.Sheets['EmbeddingsData'];

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
      const pdfEmbeddings = await Promise.all(pdfTexts.map(generateEmbeddings));
      for (var i=0; i<pdfEmbeddings.length; i++){
        knowledgeBaseEmbeddings.push({pdfText: pdfTexts[i], pdfEmbedding: pdfEmbeddings[i]});
      }
      console.log(knowledgeBaseEmbeddings);
      embeddingsStored = storeEmbeddings(knowledgeBaseEmbeddings);
      
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

async function storeEmbeddings(knowledgeBaseEmbeddings) {
  try {
    const existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const updatedData = [...existingData, ['pdfText', 'pdfEmbedding'], ...knowledgeBaseEmbeddings.map(item => [item.pdfText, ...item.pdfEmbedding])];
    const updatedWorksheet = XLSX.utils.aoa_to_sheet(updatedData);
    database.Sheets['EmbeddingsData'] = updatedWorksheet;
    XLSX.writeFile(database, 'pdfEmbeddings.xlsx', { bookSST: true });
    return true;
  } catch(error) {
    console.error(error);
    return false;
  }
}

async function promptCosineSimilarity(knowledgeBaseEmbeddings, query) {
  const queryEmbedding = generateEmbeddings(query);
  const maxSimilarity = 0;
  const promptText = query;
  knowledgeBaseEmbeddings.forEach(pdf => {
    const maxLength = Math.max(pdf.pdfEmbedding.length, queryEmbedding.length);
    const paddedEmbedding1 = [...pdf.pdfEmbedding, ...Array(Math.abs(maxLength - pdf.pdfEmbedding.length)).fill(0)];
    const paddedEmbedding2 = [...queryEmbedding, ...Array(Math.abs(maxLength - queryEmbedding.length)).fill(0)];

    // Calculate the cosine similarity using the padded embeddings
    const dotProduct = paddedEmbedding1.reduce((acc, val, index) => acc + val * paddedEmbedding2[index], 0);
    const magnitude1 = Math.sqrt(paddedEmbedding1.reduce((acc, val) => acc + val * val, 0));
    const magnitude2 = Math.sqrt(paddedEmbedding2.reduce((acc, val) => acc + val * val, 0));

    if (magnitude1 !== 0 && magnitude2 !== 0) {
      const similarity = dotProduct / (magnitude1 * magnitude2);
      promptText = (similarity>=maxSimilarity) ? pdf.pdfText : promptText;
    }
  });

  if(promptText!=query){
    return `Context: ${promptText} - Now answer the following question - ${query}`;
  } else return query;
}

async function answerQueryWithEmbeddings(userQuery) {
  //const prompt = promptCosineSimilarity(knowledgeBaseEmbeddings, userQuery);
  const response = await openaiClient.completions.create({
    model: 'text-davinci-003',
    //prompt: prompt,
    prompt: `Context: ${knowledgeBaseEmbeddings.map(pdf => pdf.pdfText).join('\n')} - Now answer the following question - ${userQueryuery}`,
    temperature: 0.25,
    max_tokens: 200,
  });
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
