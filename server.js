const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.EXPRESS_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// PDF processing endpoint
app.post('/process-pdf', async (req, res) => {
  try {
    const { pdfUrl } = req.body;
    
    if (!pdfUrl) {
      return res.status(400).json({ error: 'Missing PDF URL' });
    }

    console.log('Processing PDF from URL:', pdfUrl);

    // Download the PDF
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(response.data, 'binary');

    console.log('PDF downloaded, size:', pdfBuffer.length, 'bytes');

    // Extract text from the PDF
    const pdfData = await pdfParse(pdfBuffer);
    const text = pdfData.text;

    console.log('PDF text extracted, length:', text.length, 'characters');

    // Truncate if too long for OpenAI (limit to ~8000 tokens, about 24,000 characters)
    const maxChars = 24000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

    console.log('Text truncated to:', truncatedText.length, 'characters');

    // Extract document metadata using AI
    const metadataPrompt = `
You are a financial document expert. Analyze the following SEC filing document and extract key information. Return your response in this exact format:

Title: [Document title or company name]
Company Ticker: [Stock ticker symbol if found, otherwise leave empty]
Document Type: [10-K, 10-Q, 8-K, or other filing type]
Filing Date: [Date in YYYY-MM-DD format if found, otherwise leave empty]
Preview: [A 2-3 sentence summary of the document's key content and purpose]

Document content:
${truncatedText.substring(0, 5000)}
`;

    const metadataCompletion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a financial document expert specializing in SEC filings.' },
        { role: 'user', content: metadataPrompt }
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    const metadataResponse = metadataCompletion.choices[0]?.message?.content?.trim() || '';
    
    // Parse the metadata response
    const lines = metadataResponse.split('\n');
    const title = lines.find(line => line.startsWith('Title:'))?.replace('Title:', '').trim() || 'Unknown Document';
    const ticker = lines.find(line => line.startsWith('Company Ticker:'))?.replace('Company Ticker:', '').trim() || '';
    const docType = lines.find(line => line.startsWith('Document Type:'))?.replace('Document Type:', '').trim() || '10-K';
    const date = lines.find(line => line.startsWith('Filing Date:'))?.replace('Filing Date:', '').trim() || '';
    const preview = lines.find(line => line.startsWith('Preview:'))?.replace('Preview:', '').trim() || '';

    const result = {
      success: true,
      content: truncatedText,
      pages: pdfData.numpages,
      metadata: {
        title,
        company_ticker: ticker,
        document_type: docType,
        filing_date: date,
        content_preview: preview || `Document content extracted successfully. ${truncatedText.length} characters of text available for analysis.`
      }
    };

    console.log('PDF processing completed successfully');
    res.json(result);

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ 
      error: 'Failed to process PDF', 
      details: error.message 
    });
  }
});

// Document analysis endpoint
app.post('/analyze-document', async (req, res) => {
  try {
    const { question, documentContent, conversationHistory } = req.body;
    
    if (!question || !documentContent) {
      return res.status(400).json({ error: 'Missing question or document content' });
    }

    console.log('Analyzing document with question:', question);

    // Truncate content for OpenAI
    const maxChars = 24000;
    const truncatedContent = documentContent.length > maxChars ? documentContent.slice(0, maxChars) : documentContent;

    const prompt = `
You are a financial document expert. Answer the following question about the SEC filing document below. Provide a clear, accurate answer based on the document content. If the information is not available in the document, say so clearly.

${conversationHistory ? `Previous conversation context:
${conversationHistory}

Please consider the previous questions and answers when responding to this follow-up question.` : ''}

Additionally, provide 1-3 specific citations from the document that support your answer. Each citation should be a direct quote or specific reference from the document content.

Question: ${question}

Document content:
${truncatedContent}

Please format your response as follows:
ANSWER: [Your answer here]

CITATIONS:
1. [First citation - direct quote or specific reference]
2. [Second citation if applicable]
3. [Third citation if applicable]
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a financial document expert specializing in SEC filings and financial analysis. Always provide specific citations from the document content.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '';
    
    console.log('AI Response:', response);
    
    // Parse the response to extract answer and citations
    let answer = '';
    let citations = [];
    
    const lines = response.split('\n');
    let inCitations = false;
    
    for (const line of lines) {
      if (line.startsWith('ANSWER:')) {
        answer = line.replace('ANSWER:', '').trim();
      } else if (line.startsWith('CITATIONS:')) {
        inCitations = true;
      } else if (inCitations && line.trim() && /^\d+\./.test(line.trim())) {
        // Extract citation (remove the number and dot)
        const citation = line.replace(/^\d+\.\s*/, '').trim();
        if (citation) {
          citations.push(citation);
        }
      }
    }
    
    console.log('Parsed answer:', answer);
    console.log('Parsed citations:', citations);
    
    // Fallback if parsing fails
    if (!answer) {
      answer = response;
      citations = ['Document content analysis'];
    }

    const result = {
      success: true,
      answer,
      citations: citations.length > 0 ? citations.map(citation => ({ text: citation })) : [{ text: 'Document content analysis' }],
      processing_time: Date.now()
    };

    console.log('Document analysis completed successfully');
    res.json(result);

  } catch (error) {
    console.error('Error analyzing document:', error);
    res.status(500).json({ 
      error: 'Failed to analyze document', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'PDF processing server is running' });
});

app.listen(PORT, () => {
  console.log(`PDF processing server running on port ${PORT}`);
}); 