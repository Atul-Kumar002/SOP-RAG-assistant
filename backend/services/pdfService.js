const { PDFParse } = require('pdf-parse');

/**
 * Parses a PDF buffer and extracts text page-by-page along with metadata.
 * @param {Buffer} dataBuffer - The PDF file data buffer.
 * @returns {Promise<{pages: Array<{pageNumber: number, text: string, metadata: object}>, metadata: object}>} - Extracted pages and document metadata.
 */
const parsePdf = async (dataBuffer) => {
  const parser = new PDFParse({ data: dataBuffer });

  try {
    // Extract plain text for all pages (with hyperlink detection enabled)
    const textResult = await parser.getText({ parseHyperlinks: true });

    // Extract document metadata and page layout/links details
    const infoResult = await parser.getInfo({ parsePageInfo: true });

    // Parse creation and modification dates safely
    let creationDate = null;
    let modificationDate = null;
    try {
      const dates = infoResult.getDateNode();
      if (dates) {
        creationDate = dates.CreationDate || dates.XmpCreateDate || dates.XapCreateDate || null;
        modificationDate = dates.ModDate || dates.XmpModifyDate || dates.XapModifyDate || null;
      }
    } catch (e) {
      console.warn('Failed to extract creation/modification dates from PDF metadata:', e.message);
    }

    // Assemble document-level metadata
    const docMetadata = {
      title: infoResult.info?.Title || null,
      author: infoResult.info?.Author || null,
      subject: infoResult.info?.Subject || null,
      creator: infoResult.info?.Creator || null,
      producer: infoResult.info?.Producer || null,
      creationDate,
      modificationDate,
      totalPages: infoResult.total || textResult.total || 0,
    };

    // Combine page texts with page-level layout and structure metadata
    const pages = textResult.pages.map((pageTextObj) => {
      const pageNum = pageTextObj.num;
      const pageInfo = infoResult.pages.find((p) => p.pageNumber === pageNum) || {};

      const text = pageTextObj.text || '';
      const trimmedText = text.trim();
      const wordCount = trimmedText ? trimmedText.split(/\s+/).filter(Boolean).length : 0;
      const characterCount = trimmedText.length;

      return {
        pageNumber: pageNum,
        text: trimmedText,
        metadata: {
          width: pageInfo.width || null,
          height: pageInfo.height || null,
          pageLabel: pageInfo.pageLabel || null,
          links: pageInfo.links || [],
          wordCount,
          characterCount,
        },
      };
    });

    // Ensure page elements are sorted in ascending page number order
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      pages,
      metadata: docMetadata,
    };
  } catch (error) {
    console.error('Error in PDF parsing service:', error);
    throw new Error(`Failed to parse PDF document: ${error.message}`);
  } finally {
    // Explicitly destroy the parser instance to free native memory resources
    try {
      await parser.destroy();
    } catch (err) {
      console.error('Failed to clean up PDFParse resources:', err.message);
    }
  }
};

module.exports = { parsePdf };
