/**
 * PDF and DOCX Resume Parser
 * Handles multiple file formats and font encodings
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';
import mammoth from 'mammoth';

// Set worker source to the local file to match the API version exactly
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

/**
 * Extract text from PDF file with robust font handling
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer
    }).promise;
    
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text items with proper spacing
      const pageText = textContent.items
        .map((item: any) => {
          // Handle different font encodings
          if (item.str) {
            // Normalize unicode characters
            return item.str
              .normalize('NFKD') // Normalize unicode
              .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
              .trim();
          }
          return '';
        })
        .filter((text: string) => text.length > 0)
        .join(' ');
      
      fullText += pageText + '\n';
    }
    
    return cleanText(fullText);
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file. Please ensure the file is not corrupted.');
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Direct usage of top-level import to prevent bundler errors
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    if (result.messages && result.messages.length > 0) {
      console.warn('DOCX parsing warnings:', result.messages);
    }
    
    return cleanText(result.value);
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file. Please ensure the file is valid.');
  }
}

/**
 * Clean and normalize extracted text
 */
function cleanText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Normalize quotes
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Ensure proper encoding (UTF-8)
    .normalize('NFKC')
    .trim();
}

/**
 * Parse resume file (auto-detect format)
 */
export async function parseResumeFile(file: File): Promise<string> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractTextFromPDF(file);
  } else if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    return extractTextFromDOCX(file);
  } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
    // Handle plain text files
    return file.text().then(cleanText);
  } else {
    throw new Error('Unsupported file format. Please upload PDF, DOCX, or TXT files.');
  }
}

/**
 * Validate file before parsing
 */
export function validateResumeFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  const allowedExtensions = ['.pdf', '.docx', '.txt'];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }
  
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  const hasValidType = allowedTypes.includes(file.type);
  
  if (!hasValidExtension && !hasValidType) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload PDF, DOCX, or TXT files only.' 
    };
  }
  
  return { valid: true };
}