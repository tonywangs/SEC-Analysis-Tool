# SEC Analyzer - AI-Powered Document Reader

A web application that allows users to upload SEC filings (such as 10-Ks or 10-Qs) and ask natural-language questions about them. The system extracts and interprets information from these documents and returns answers with clear citations to the source text.

## Deployment

This app is currently deployed on Heroku: [Link](https://sec-analyzer-b75a1b2841d4.herokuapp.com/) 
Demo video: [Link](https://youtu.be/o0zxt_X5EsY)

## Features

- **File Upload Interface**: Upload 10-K, 10-Q, or other SEC documents (PDF/TXT)
- **AI-Powered Analysis**: Ask questions and get intelligent answers with citations
- **Document Library**: Organize and manage your uploaded documents
- **Question History**: Track all your previous questions and answers
- **Modern UI**: Clean, intuitive interface with smooth animations

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Supabase Storage
- **AI/LLM**: OpenAI GPT-4
- **Animations**: Framer Motion
- **Icons**: Lucide React

## Prerequisites

Before you begin, ensure you have the following:

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Supabase account** - [Sign up here](https://supabase.com)
4. **OpenAI API key** - [Get one here](https://platform.openai.com/api-keys)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <this-repo-url>
cd sec-analyzer
npm install
```

### 2. Set Up Supabase

1. **Create a new Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note down your project URL and anon key

2. **Set up the database schema**:
   - Go to your Supabase dashboard → SQL Editor
   - Run the following SQL to create the required tables:

```sql
-- Create documents table
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company_ticker TEXT,
  document_type TEXT,
  filing_date TEXT,
  content_preview TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create questions table
CREATE TABLE questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  processing_time DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_questions_document_id ON questions(document_id);
CREATE INDEX idx_questions_created_at ON questions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to documents" ON documents;
DROP POLICY IF EXISTS "Allow public insert access to documents" ON documents;
DROP POLICY IF EXISTS "Allow public update access to documents" ON documents;
DROP POLICY IF EXISTS "Allow public delete access to documents" ON documents;

DROP POLICY IF EXISTS "Allow public read access to questions" ON questions;
DROP POLICY IF EXISTS "Allow public insert access to questions" ON questions;
DROP POLICY IF EXISTS "Allow public update access to questions" ON questions;
DROP POLICY IF EXISTS "Allow public delete access to questions" ON questions;

-- Create comprehensive policies for documents
CREATE POLICY "Allow public read access to documents" ON documents
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to documents" ON documents
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to documents" ON documents
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete access to documents" ON documents
  FOR DELETE USING (true);

-- Create comprehensive policies for questions
CREATE POLICY "Allow public read access to questions" ON questions
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to questions" ON questions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to questions" ON questions
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete access to questions" ON questions
  FOR DELETE USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_documents_updated_at 
  BEFORE UPDATE ON documents 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at 
  BEFORE UPDATE ON questions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage policies for the documents bucket
-- Note: You'll need to create the bucket first in the Supabase dashboard
-- Then run these policies

-- Allow public read access to documents bucket
CREATE POLICY "Allow public read access to documents bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Allow public insert access to documents bucket
CREATE POLICY "Allow public insert access to documents bucket" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

-- Allow public update access to documents bucket
CREATE POLICY "Allow public update access to documents bucket" ON storage.objects
  FOR UPDATE USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

-- Allow public delete access to documents bucket
CREATE POLICY "Allow public delete access to documents bucket" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents'); 
```

3. **Set up Supabase Storage**:
   - Go to Storage in your Supabase dashboard
   - Create a new bucket called `documents`
   - Set the bucket to public (for this demo)
   - Adjust RLS policies if needed

### 3. Configure Environment Variables

1. **Copy the example environment file**:
   ```bash
   cp env.example .env.local
   ```

2. **Fill in your environment variables**:
   ```bash
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   ```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## API Endpoints

- `GET /api/documents` - Get all documents
- `POST /api/documents` - Create a new document
- `GET /api/questions` - Get questions (optionally filtered by document)
- `POST /api/questions` - Create a new question
- `POST /api/upload` - Upload and process a file
- `POST /api/analyze` - Analyze a document with AI

## Goals Implemented

- [x] Clean, modern UI with attention to UX
- [x] User authentication with Supabase
- [x] PDF parsing and text extraction
- [x] File upload with drag-and-drop support
- [x] AI-powered question answering with citations
- [x] Document library with metadata extraction
- [x] Question history and tracking (chat threading)
- [x] Responsive design for mobile and desktop
- [x] Loading states and error handling
- [x] TypeScript for better type safety

## Future Enhancements

- [ ] SEC external search integration
- [ ] Multi-document comparison (redlining)