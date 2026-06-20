/**
 * Service to build structured context for LLMs from retrieved vector search chunks,
 * and to format retrieved sources with document name, page number, and section references.
 */

/**
 * Dedupes and merges overlapping/consecutive chunks from the same document and page.
 */
const mergeChunks = (chunks) => {
  if (!chunks || chunks.length === 0) return [];

  const merged = [];
  
  for (const chunk of chunks) {
    const docId = chunk.documentId || null;
    const docName = chunk.documentName || (chunk.metadata && chunk.metadata.documentName) || 'Unknown Document';
    const pageNum = chunk.pageNumber || (chunk.metadata && chunk.metadata.pageNumber) || 'Unknown Page';
    const sectionRef = (chunk.metadata && chunk.metadata.sectionInfo) || 'Introduction';
    const text = (chunk.text || '').trim();
    const score = typeof chunk.score === 'number' ? chunk.score : null;

    // Find if we have an existing merged chunk from the same document and page
    const existing = merged.find(m => m.documentName === docName && m.pageNumber === pageNum);

    if (existing) {
      // If the existing text already contains the new text, skip it
      if (existing.text.includes(text)) {
        // Keep the higher score
        if (score !== null && (existing.score === null || score > existing.score)) {
          existing.score = score;
        }
        continue;
      }
      // If the new text contains the existing text, replace the existing text
      if (text.includes(existing.text)) {
        existing.text = text;
        if (score !== null && (existing.score === null || score > existing.score)) {
          existing.score = score;
        }
        continue;
      }

      // Check for overlap at boundaries (suffix of existing matching prefix of new text)
      const maxOverlap = Math.min(existing.text.length, text.length);
      let overlapLen = 0;
      
      // Look for overlaps up to 200 characters
      for (let len = Math.min(200, maxOverlap); len > 0; len--) {
        const suffix = existing.text.slice(-len);
        const prefix = text.slice(0, len);
        if (suffix === prefix) {
          overlapLen = len;
          break;
        }
      }

      if (overlapLen > 0) {
        existing.text += ' ' + text.slice(overlapLen);
      } else {
        existing.text += '\n...\n' + text;
      }

      // Keep the highest score for the merged chunk
      if (score !== null && (existing.score === null || score > existing.score)) {
        existing.score = score;
      }
    } else {
      merged.push({
        documentId: docId,
        documentName: docName,
        pageNumber: pageNum,
        sectionRef: sectionRef,
        text: text,
        score: score
      });
    }
  }

  return merged;
};

/**
 * Merges retrieved chunks into a structured text context.
 *
 * @param {Array} chunks - Array of chunk objects retrieved from MongoDB Atlas Vector Search
 * @returns {string} - Merged, structured context window representation
 */
const buildContext = (chunks) => {
  const mergedChunks = mergeChunks(chunks);
  
  if (mergedChunks.length === 0) {
    return 'No relevant standard operating procedure context found.';
  }

  return mergedChunks
    .map((chunk, index) => {
      return `[Source Reference ${index + 1}]
Document Name: ${chunk.documentName}
Page Number: ${chunk.pageNumber}
Section Reference: ${chunk.sectionRef}
Content:
${chunk.text}`;
    })
    .join('\n\n---\n\n');
};

/**
 * Formats retrieved chunks into a standardized structure for user presentation.
 *
 * @param {Array} chunks - Array of chunk objects
 * @returns {Array<{documentName: string, pageNumber: number|string, sectionRef: string, text: string, score: number|null}>}
 */
const formatSources = (chunks) => {
  const mergedChunks = mergeChunks(chunks);
  
  return mergedChunks.map(chunk => {
    return {
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      pageNumber: chunk.pageNumber,
      sectionRef: chunk.sectionRef,
      text: chunk.text,
      score: chunk.score
    };
  });
};

module.exports = {
  buildContext,
  formatSources,
  mergeChunks
};
