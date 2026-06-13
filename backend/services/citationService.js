/**
 * Service to parse LLM answers and map segments/chunks of the answer
 * to their respective source standard operating procedure documents.
 */

/**
 * Processes a single text segment (sentence, paragraph, or list item)
 * to extract citations and clean the text.
 *
 * @param {string} segmentText - Raw text segment from the LLM
 * @param {Array} formattedSources - List of sources formatted for presentation
 * @returns {{text: string, citations: Array}}
 */
const processSegment = (segmentText, formattedSources) => {
  const citations = [];
  // Matches [Source Reference X], [Ref X], or [X] (case-insensitive)
  const citationRegex = /\[(?:Source Reference\s+|Ref\s+)?(\d+)\]/gi;
  let match;

  // Find all unique citations in this segment
  while ((match = citationRegex.exec(segmentText)) !== null) {
    const index = parseInt(match[1], 10);
    if (!citations.some(c => c.sourceIndex === index)) {
      if (formattedSources && formattedSources[index - 1]) {
        const source = formattedSources[index - 1];
        citations.push({
          sourceIndex: index,
          documentName: source.documentName,
          pageNumber: source.pageNumber,
          sectionRef: source.sectionRef,
          score: source.score
        });
      }
    }
  }

  // Clean the segment text by removing citation tags and collapsing extra spaces
  let cleanText = segmentText.replace(citationRegex, '').replace(/\s+/g, ' ').trim();
  
  // Clean up any trailing punctuation or space changes that might leave punctuation isolated
  cleanText = cleanText.replace(/\s+([.,!?;:])/g, '$1');

  return {
    text: cleanText,
    citations: citations
  };
};

/**
 * Parses the generated answer into structured chunks, mapping each chunk
 * to its corresponding source references.
 *
 * @param {string} answerText - The raw AI generated answer
 * @param {Array} formattedSources - The formatted list of source chunks
 * @returns {Array<{text: string, citations: Array}>} - List of traceable chunks
 */
const parseResponseChunks = (answerText, formattedSources) => {
  if (!answerText) return [];

  const lines = answerText.split('\n');
  const chunks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line is a list item (bullet or numbered list)
    const isListItem = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('+ ') || /^\d+\.\s/.test(trimmed);

    if (isListItem) {
      // Process list items as single chunks to preserve list structure
      chunks.push({
        ...processSegment(trimmed, formattedSources),
        isListItem: true
      });
    } else {
      // Split paragraphs into sentences
      // Use lookahead to split by sentence endings followed by whitespace and uppercase/number
      const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);
      for (const sentence of sentences) {
        const sTrimmed = sentence.trim();
        if (sTrimmed) {
          chunks.push({
            ...processSegment(sTrimmed, formattedSources),
            isListItem: false
          });
        }
      }
    }
  }

  return chunks;
};

module.exports = {
  parseResponseChunks,
  processSegment
};
