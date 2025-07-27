import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Get the current user
    const user = await requireAuth(request)
    
    const body = await request.json()
    const { document_id, question, conversation_id } = body
    
    if (!document_id || !question) {
      return NextResponse.json({ error: 'Document ID and question are required' }, { status: 400 })
    }

    // Get the user's JWT token from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No valid authorization token provided')
    }
    const userToken = authHeader.substring(7) // Remove 'Bearer ' prefix
    
    // Use authenticated Supabase client to get the document
    const supabase = createAuthenticatedSupabaseClient(userToken)
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()
    
    if (documentError || !document) {
      console.error('Error fetching document:', documentError)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    console.log('Document retrieved for analysis:', {
      id: document.id,
      title: document.title,
      hasContent: !!document.content,
      contentLength: document.content?.length || 0,
      contentPreview: document.content?.substring(0, 200) + '...',
      allFields: Object.keys(document)
    })

    // Get conversation history if conversation_id is provided
    let conversationHistory = ''
    if (conversation_id) {
      try {
        const historyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/questions?document_id=${document_id}&conversation_id=${conversation_id}`)
        if (historyResponse.ok) {
          const historyQuestions = await historyResponse.json()
          if (historyQuestions.length > 0) {
            conversationHistory = historyQuestions.map((q: any) => 
              `Q: ${q.question_text}\nA: ${q.answer}`
            ).join('\n\n')
          }
        }
      } catch (error) {
        console.log('Could not load conversation history:', error)
      }
    }

    // Use the actual document content if available
    const documentContent = document.content || `Document: ${document.title}
Type: ${document.document_type}
Company: ${document.company_ticker}
Preview: ${document.content_preview}

Note: Full document content is not available. This analysis is based on the document preview only.`

    console.log('Sending to Express server for analysis...')

    // Call our Express server for analysis
    const expressUrl = process.env.EXPRESS_URL || 'http://localhost:3001'
    const response = await fetch(`${expressUrl}/analyze-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        question, 
        documentContent,
        conversationHistory
      })
    })

    if (!response.ok) {
      throw new Error(`Express server responded with status: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.success) {
      console.log('Express server response:', {
        answer: result.answer,
        citations: result.citations,
        citationsType: typeof result.citations,
        citationsLength: result.citations?.length
      })
      
      console.log('Document analysis completed successfully')
      return NextResponse.json(result)
    } else {
      throw new Error(result.error || 'Document analysis failed')
    }

  } catch (error) {
    console.error('Error analyzing document:', error)
    return NextResponse.json({ error: 'Failed to analyze document' }, { status: 500 })
  }
} 