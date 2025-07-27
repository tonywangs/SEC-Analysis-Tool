import { NextRequest, NextResponse } from 'next/server'
import { fileApi } from '@/lib/api'
import { requireAuth } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    // Get the current user
    const user = await requireAuth(request)
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log(`Processing file: ${file.name}, size: ${file.size} bytes for user: ${user.id}`)

    // Upload file to Supabase storage first
    let file_url: string
    let file_name: string
    
    try {
      const uploadResult = await fileApi.upload(file)
      file_url = uploadResult.file_url
      file_name = uploadResult.file_name
      console.log('File uploaded to Supabase:', { file_url, file_name })
    } catch (uploadError) {
      console.error('Error uploading file to Supabase:', uploadError)
      return NextResponse.json({ 
        error: `Failed to upload file: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}` 
      }, { status: 500 })
    }

    // Now process the PDF using our Express server
    let fileContent = ''
    let documentInfo = {
      title: file.name.replace(/\.pdf$/i, ''),
      company_ticker: '',
      document_type: '10-Q',
      filing_date: '',
      content_preview: 'Document uploaded successfully. Processing...'
    }

    const fileExtension = file.name.toLowerCase().split('.').pop()
    
    if (fileExtension === 'pdf') {
      try {
        console.log('Sending PDF to Express server for processing...')
        
        // Call our Express server to process the PDF
        const expressUrl = process.env.EXPRESS_URL || 'http://localhost:3001'
        const response = await fetch(`${expressUrl}/process-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pdfUrl: file_url })
        })

        if (!response.ok) {
          throw new Error(`Express server responded with status: ${response.status}`)
        }

        const result = await response.json()
        
        if (result.success) {
          fileContent = result.content
          documentInfo = result.metadata
          
          console.log('PDF processing successful:', {
            contentLength: fileContent.length,
            title: documentInfo.title,
            pages: result.pages
          })
        } else {
          throw new Error(result.error || 'PDF processing failed')
        }
        
      } catch (pdfError) {
        console.error('Error processing PDF with Express server:', pdfError)
        fileContent = `PDF document uploaded successfully. Text extraction failed: ${pdfError}. Please review the original file for complete document details.`
      }
    } else if (fileExtension === 'txt') {
      // For text files, use the text() method
      try {
        fileContent = await file.text()
        console.log('Text file content extracted:', {
          filename: file.name,
          textLength: fileContent.length
        })
      } catch (textError) {
        console.error('Error reading text file:', textError)
        fileContent = 'Error reading text file content'
      }
    } else {
      // For unsupported file types
      fileContent = `File type '${fileExtension}' is not supported for text extraction. Please upload a PDF or TXT file.`
    }

    const responseData = {
      file_url,
      file_name: file.name,
      file_size: file.size,
      content: fileContent,
      ...documentInfo
    }

    console.log('Upload API response data:', {
      ...responseData,
      contentLength: responseData.content?.length || 0,
      contentPreview: responseData.content?.substring(0, 200) + '...'
    })

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
} 