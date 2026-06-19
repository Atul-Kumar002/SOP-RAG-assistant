/**
 * Service to build structured context for LLMs from retrieved vector search chunks,
 * and to format retrieved sources with document name, page number, and section references.
 */

/**
 * Merges retrieved chunks into a structured text context.
 *
 * @param {Array} chunks - Array of chunk objects retrieved from MongoDB Atlas Vector Search
 * @returns {string} - Merged, structured context window representation
 */
const buildContext = (chunks) => {
  if (!chunks || chunks.length === 0) {
    return 'No relevant standard operating procedure context found.';
  }

  return chunks
    .map((chunk, index) => {
      const docName = chunk.documentName || (chunk.metadata && chunk.metadata.documentName) || 'Unknown Document';
      const pageNum = chunk.pageNumber || (chunk.metadata && chunk.metadata.pageNumber) || 'Unknown Page';
      const sectionRef = (chunk.metadata && chunk.metadata.sectionInfo) || 'Introduction';
      const text = chunk.text || '';

      return `[Source Reference ${index + 1}]
Document Name: ${docName}
Page Number: ${pageNum}
Section Reference: ${sectionRef}
Content:
${text.trim()}`;
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
  if (!chunks || chunks.length === 0) return [];

  return chunks.map(chunk => {
    const docId = chunk.documentId || null;
    const docName = chunk.documentName || (chunk.metadata && chunk.metadata.documentName) || 'Unknown Document';
    const pageNum = chunk.pageNumber || (chunk.metadata && chunk.metadata.pageNumber) || 'Unknown Page';
    const sectionRef = (chunk.metadata && chunk.metadata.sectionInfo) || 'Introduction';
    const text = chunk.text || '';
    const score = typeof chunk.score === 'number' ? chunk.score : null;

    return {
      documentId: docId,
      documentName: docName,
      pageNumber: pageNum,
      sectionRef: sectionRef,
      text: text.trim(),
      score: score
    };
  });
};

module.exports = {
  buildContext,
  formatSources
};
