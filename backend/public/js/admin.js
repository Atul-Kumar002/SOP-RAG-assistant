document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectedFileContainer = document.getElementById('selectedFileContainer');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const progressWrapper = document.getElementById('progressWrapper');
  const progressBar = document.getElementById('progressBar');
  const uploadStatusText = document.getElementById('uploadStatusText');
  const uploadPercentage = document.getElementById('uploadPercentage');
  const uploadBtn = document.getElementById('uploadBtn');
  const searchDocsInput = document.getElementById('searchDocsInput');
  const loadingDocs = document.getElementById('loadingDocs');
  const emptyDocs = document.getElementById('emptyDocs');
  const tableContainer = document.getElementById('tableContainer');
  const documentsTableBody = document.getElementById('documentsTableBody');
  const toastContainer = document.getElementById('toastContainer');
  
  // Search UI Elements
  const searchQueryInput = document.getElementById('searchQueryInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResultsWrapper = document.getElementById('searchResultsWrapper');
  const resultsCount = document.getElementById('resultsCount');
  const searchResultsList = document.getElementById('searchResultsList');
  const aiAnswerCard = document.getElementById('aiAnswerCard');
  const aiAnswerContent = document.getElementById('aiAnswerContent');

  // Relevance Tuning UI Elements
  const tuningToggle = document.getElementById('tuningToggle');
  const tuningContent = document.getElementById('tuningContent');
  const similarityThresholdInput = document.getElementById('similarityThresholdInput');
  const similarityThresholdVal = document.getElementById('similarityThresholdVal');
  const limitInput = document.getElementById('limitInput');
  const limitVal = document.getElementById('limitVal');
  const numCandidatesInput = document.getElementById('numCandidatesInput');
  const numCandidatesVal = document.getElementById('numCandidatesVal');

  let activeFile = null;
  let allDocuments = [];

  // Initialize Lucide Icons
  lucide.createIcons();

  // Load documents on init
  loadDocuments();

  // Dropzone Events
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropzone.addEventListener(type, () => {
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUploadState();
  });

  uploadBtn.addEventListener('click', () => {
    if (!activeFile) return;
    uploadAndIndexFile(activeFile);
  });

  // Real-time search/filtering
  searchDocsInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allDocuments.filter(doc => doc.name.toLowerCase().includes(term));
    renderTable(filtered);
  });

  // Relevance Tuning Accordion Toggle
  tuningToggle.addEventListener('click', () => {
    const isExpanded = tuningContent.style.display !== 'none';
    if (isExpanded) {
      tuningContent.style.display = 'none';
      tuningToggle.classList.remove('active');
    } else {
      tuningContent.style.display = 'flex';
      tuningToggle.classList.add('active');
    }
  });

  // Real-time slider feedback listeners
  similarityThresholdInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value).toFixed(2);
    similarityThresholdVal.textContent = val;
  });

  limitInput.addEventListener('input', (e) => {
    limitVal.textContent = e.target.value;
  });

  numCandidatesInput.addEventListener('input', (e) => {
    numCandidatesVal.textContent = e.target.value;
  });

  // SOP Query Assistant Search Events
  searchBtn.addEventListener('click', () => {
    performSemanticSearch();
  });

  searchQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSemanticSearch();
    }
  });

  // Functions
  function handleFileSelection(file) {
    // Client-side validations
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (fileExt !== '.pdf') {
      showToast('Invalid File Type', 'Only PDF files (.pdf) are supported.', 'error');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      showToast('File Too Large', 'Maximum file size limit is 50MB.', 'error');
      return;
    }

    activeFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);
    
    // Hide dropzone, show active file box
    dropzone.style.display = 'none';
    selectedFileContainer.style.display = 'flex';
    progressWrapper.style.display = 'none';
    uploadBtn.disabled = false;
    
    lucide.createIcons();
  }

  function resetUploadState() {
    activeFile = null;
    fileInput.value = '';
    dropzone.style.display = 'flex';
    selectedFileContainer.style.display = 'none';
    progressWrapper.style.display = 'none';
    progressBar.style.width = '0%';
    uploadPercentage.textContent = '0%';
    uploadBtn.disabled = false;
  }

  function uploadAndIndexFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    
    // Setup listeners
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        
        // Cap upload visual indicator at 95% while processing
        const visualPercent = percentComplete >= 98 ? 98 : percentComplete;
        progressBar.style.width = `${visualPercent}%`;
        uploadPercentage.textContent = `${visualPercent}%`;
        
        if (visualPercent >= 98) {
          uploadStatusText.textContent = 'Processing & indexing knowledge blocks...';
        } else {
          uploadStatusText.textContent = `Uploading file (${percentComplete}%)...`;
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        progressBar.style.width = '100%';
        uploadPercentage.textContent = '100%';
        uploadStatusText.textContent = 'Completed!';
        
        const response = JSON.parse(xhr.responseText);
        showToast('Success', response.message || 'File uploaded successfully!', 'success');
        
        setTimeout(() => {
          resetUploadState();
          loadDocuments();
        }, 1500);
      } else {
        let errorMsg = 'An unexpected error occurred during processing.';
        try {
          const response = JSON.parse(xhr.responseText);
          errorMsg = response.error || errorMsg;
        } catch (e) {}
        
        showToast('Processing Failed', errorMsg, 'error');
        uploadStatusText.textContent = 'Failed';
        uploadBtn.disabled = false;
      }
    });

    xhr.addEventListener('error', () => {
      showToast('Network Error', 'Could not complete file upload request.', 'error');
      uploadStatusText.textContent = 'Failed';
      uploadBtn.disabled = false;
    });

    // Make the request
    xhr.open('POST', '/api/docs/upload', true);
    
    // UI Updates
    progressWrapper.style.display = 'block';
    uploadBtn.disabled = true;
    uploadStatusText.textContent = 'Uploading...';
    
    xhr.send(formData);
  }

  async function loadDocuments() {
    showTableLoading(true);
    try {
      const res = await fetch('/api/docs');
      if (!res.ok) throw new Error('Failed to retrieve catalog');
      
      allDocuments = await res.json();
      renderTable(allDocuments);
    } catch (error) {
      console.error(error);
      showToast('Fetch Error', 'Failed to retrieve ingested documents list.', 'error');
      showTableLoading(false);
    }
  }

  function renderTable(docs) {
    showTableLoading(false);
    documentsTableBody.innerHTML = '';
    
    if (docs.length === 0) {
      tableContainer.style.display = 'none';
      emptyDocs.style.display = 'flex';
      return;
    }
    
    emptyDocs.style.display = 'none';
    tableContainer.style.display = 'block';

    docs.forEach(doc => {
      const tr = document.createElement('tr');
      
      // Name cell
      const nameTd = document.createElement('td');
      nameTd.className = 'doc-name-cell';
      nameTd.innerHTML = `
        <i data-lucide="file-text"></i>
        <span class="doc-name-text" title="${doc.name}">${doc.name}</span>
      `;
      tr.appendChild(nameTd);

      // Size cell
      const sizeTd = document.createElement('td');
      sizeTd.textContent = formatBytes(doc.size);
      tr.appendChild(sizeTd);

      // Chunk count cell
      const chunkTd = document.createElement('td');
      chunkTd.innerHTML = `<span class="badge badge-chunks">${doc.chunkCount} chunks</span>`;
      tr.appendChild(chunkTd);

      // Storage Provider cell
      const storageTd = document.createElement('td');
      const provider = doc.storageProvider || 'local';
      storageTd.innerHTML = `<span class="badge badge-${provider}">${provider.toUpperCase()}</span>`;
      tr.appendChild(storageTd);

      // Ingested Date cell
      const dateTd = document.createElement('td');
      const date = new Date(doc.createdAt);
      dateTd.className = 'doc-date';
      dateTd.textContent = date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      tr.appendChild(dateTd);

      // Actions cell
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions-cell';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon btn-delete';
      deleteBtn.title = 'Delete Document';
      deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      deleteBtn.addEventListener('click', () => confirmAndDeleteDocument(doc));
      actionsTd.appendChild(deleteBtn);
      
      tr.appendChild(actionsTd);
      documentsTableBody.appendChild(tr);
    });

    lucide.createIcons();
  }

  async function confirmAndDeleteDocument(doc) {
    if (confirm(`Are you sure you want to delete "${doc.name}"? This will delete all chunks and the physical file.`)) {
      try {
        const res = await fetch(`/api/docs/${doc.id || doc._id}`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showToast('Deleted', 'Document deleted successfully.', 'success');
          loadDocuments();
        } else {
          const err = await res.json();
          showToast('Deletion Failed', err.error || 'Failed to delete file.', 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error', 'An error occurred during deletion request.', 'error');
      }
    }
  }

  function showTableLoading(isLoading) {
    if (isLoading) {
      loadingDocs.style.display = 'flex';
      tableContainer.style.display = 'none';
      emptyDocs.style.display = 'none';
    } else {
      loadingDocs.style.display = 'none';
    }
  }

  // Toast System
  function showToast(title, desc, type = 'info') {
    // Check if duplicate toast exists to prevent spam
    const existingToasts = Array.from(toastContainer.querySelectorAll('.toast'));
    const isDuplicate = existingToasts.some(t => {
      const tTitle = t.querySelector('.toast-title').textContent;
      const tDesc = t.querySelector('.toast-desc').textContent;
      return tTitle === title && tDesc === desc;
    });
    if (isDuplicate) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${icon}" class="toast-icon"></i>
      <div class="toast-content">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-desc">${desc}</p>
      </div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, 4000);
  }

  // Helper: Format Bytes to human readable
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Vector Search & AI Q&A Assistant Implementation
  async function performSemanticSearch() {
    const query = searchQueryInput.value.trim();
    if (!query) {
      showToast('Empty Query', 'Please enter a question or keywords to search.', 'info');
      return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; margin: 0 0.5rem 0 0; display: inline-block; border-width: 2px; vertical-align: middle;"></span> Consulting Assistant...';
    searchResultsWrapper.style.display = 'none';
    aiAnswerCard.style.display = 'none';
    searchResultsList.innerHTML = '';

    try {
      const limit = parseInt(limitInput.value);
      const similarityThreshold = parseFloat(similarityThresholdInput.value);
      const numCandidates = parseInt(numCandidatesInput.value);

      const res = await fetch('/api/docs/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          query, 
          limit, 
          similarityThreshold, 
          numCandidates 
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to complete Q&A assistant query.');
      }

      const data = await res.json();
      renderSearchResults(data);
    } catch (error) {
      console.error(error);
      showToast('Assistant Error', error.message || 'An error occurred during assistant query.', 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i data-lucide="sparkles"></i> Ask Assistant';
      lucide.createIcons();
    }
  }

  function renderSearchResults(data) {
    searchResultsWrapper.style.display = 'block';

    // 1. Render AI Assistant Answer
    if (data.answer) {
      aiAnswerCard.style.display = 'block';
      if (data.responseChunks && data.responseChunks.length > 0) {
        aiAnswerContent.innerHTML = renderAnswerWithCitations(data.responseChunks);
      } else {
        aiAnswerContent.innerHTML = formatAnswer(data.answer);
      }
    } else {
      aiAnswerCard.style.display = 'none';
    }

    // 2. Render Source references
    const sources = data.sources || [];
    resultsCount.textContent = `${sources.length} source${sources.length === 1 ? '' : 's'}`;

    if (sources.length === 0) {
      searchResultsList.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          No matching knowledge sources found. Try uploading a relevant PDF or refining your search.
        </div>
      `;
      return;
    }

    sources.forEach((source, index) => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.id = `source-card-${index + 1}`;
      div.setAttribute('data-source-index', index + 1);

      const matchPercent = typeof source.score === 'number' ? `${(source.score * 100).toFixed(1)}% match` : 'N/A';
      const sectionInfo = source.sectionRef || 'Introduction';

      div.innerHTML = `
        <div class="result-meta">
          <span class="result-doc-name" title="${source.documentName}">
            <i data-lucide="file-text"></i>
            ${source.documentName}
          </span>
          <span class="badge badge-score">${matchPercent}</span>
          <span class="badge badge-page">Page ${source.pageNumber}</span>
        </div>
        <p class="result-text">"${escapeHtml(source.text)}"</p>
        <div class="result-section">
          <i data-lucide="hash"></i>
          Section: ${sectionInfo}
        </div>
      `;

      searchResultsList.appendChild(div);
    });

    lucide.createIcons();

    // Bind interaction events for citation mapping
    if (data.responseChunks && data.responseChunks.length > 0) {
      bindInteractiveCitations(data.responseChunks);
    }
  }

  // Helper: Renders structured chunks with citation badges and proper list wrappers
  function renderAnswerWithCitations(responseChunks) {
    const container = document.createElement('div');
    let currentList = null;
    let currentListType = null; // 'ul' or 'ol'

    responseChunks.forEach((chunk, chunkIdx) => {
      const text = chunk.text;
      const isBullet = text.startsWith('* ') || text.startsWith('- ');
      const isNumbered = /^\d+\.\s/.test(text);

      if (isBullet || isNumbered) {
        const listType = isBullet ? 'ul' : 'ol';
        const cleanText = isBullet ? text.substring(2) : text.replace(/^\d+\.\s/, '');

        if (!currentList || currentListType !== listType) {
          if (currentList) {
            container.appendChild(currentList);
          }
          currentList = document.createElement(listType);
          currentListType = listType;
        }

        const li = document.createElement('li');
        const chunkSpan = document.createElement('span');
        chunkSpan.className = 'response-chunk';
        chunkSpan.setAttribute('data-chunk-index', chunkIdx);
        chunkSpan.innerHTML = formatTextBold(cleanText);

        appendCitationBadges(chunkSpan, chunk.citations);
        li.appendChild(chunkSpan);
        currentList.appendChild(li);
      } else {
        if (currentList) {
          container.appendChild(currentList);
          currentList = null;
          currentListType = null;
        }

        const p = document.createElement('p');
        const chunkSpan = document.createElement('span');
        chunkSpan.className = 'response-chunk';
        chunkSpan.setAttribute('data-chunk-index', chunkIdx);
        chunkSpan.innerHTML = formatTextBold(text);

        appendCitationBadges(chunkSpan, chunk.citations);
        p.appendChild(chunkSpan);
        container.appendChild(p);
      }
    });

    if (currentList) {
      container.appendChild(currentList);
    }

    return container.innerHTML;
  }

  // Helper: Appends superscript citation badges to a response chunk
  function appendCitationBadges(element, citations) {
    if (!citations || citations.length === 0) return;
    citations.forEach(cit => {
      const badge = document.createElement('span');
      badge.className = 'citation-badge';
      badge.setAttribute('data-ref', cit.sourceIndex);
      badge.textContent = cit.sourceIndex;
      badge.title = `${cit.documentName} (Page ${cit.pageNumber})`;
      element.appendChild(badge);
    });
  }

  // Helper: Bold formatting replacement
  function formatTextBold(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // Binds hover and click event handlers to chunks and citation badges
  function bindInteractiveCitations(responseChunks) {
    const chunks = document.querySelectorAll('.response-chunk');
    const badges = document.querySelectorAll('.citation-badge');

    // Highlight source references on chunk hover
    chunks.forEach(chunk => {
      chunk.addEventListener('mouseenter', () => {
        const chunkIdx = parseInt(chunk.getAttribute('data-chunk-index'), 10);
        const chunkData = responseChunks[chunkIdx];
        if (chunkData && chunkData.citations) {
          chunkData.citations.forEach(cit => {
            const sourceCard = document.getElementById(`source-card-${cit.sourceIndex}`);
            if (sourceCard) {
              sourceCard.classList.add('highlighted-source');
            }
          });
        }
      });

      chunk.addEventListener('mouseleave', () => {
        document.querySelectorAll('.search-result-item').forEach(card => {
          card.classList.remove('highlighted-source');
        });
      });
    });

    // Scroll and flash source reference on badge click
    badges.forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const refIndex = badge.getAttribute('data-ref');
        const sourceCard = document.getElementById(`source-card-${refIndex}`);
        if (sourceCard) {
          // Smooth scroll to card
          sourceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Flash animation
          sourceCard.classList.remove('flash-source');
          void sourceCard.offsetWidth; // Trigger reflow
          sourceCard.classList.add('flash-source');

          // Add a glow highlight temporarily
          document.querySelectorAll('.search-result-item').forEach(card => {
            card.classList.remove('highlighted-source');
          });
          sourceCard.classList.add('highlighted-source');
          setTimeout(() => {
            sourceCard.classList.remove('highlighted-source');
          }, 2500);
        }
      });
    });
  }

  // Helper: Format raw LLM text/markdown to beautiful HTML paragraphs and lists
  function formatAnswer(text) {
    if (!text) return '';
    
    // First, escape HTML to ensure safety
    let escaped = escapeHtml(text);

    // Replace markdown-style bold tag: **bold** with <strong>bold</strong>
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Parse lines and group lists
    const lines = escaped.split('\n');
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    let html = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
          listType = null;
        }
        continue;
      }

      // Check for bullet list item: * or -
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        if (inList && listType !== 'ul') {
          html += `</${listType}>`;
          inList = false;
        }
        if (!inList) {
          html += '<ul>';
          inList = true;
          listType = 'ul';
        }
        html += `<li>${trimmed.substring(2)}</li>`;
      } 
      // Check for numbered list item: e.g. "1. " or "2. "
      else if (/^\d+\.\s/.test(trimmed)) {
        if (inList && listType !== 'ol') {
          html += `</${listType}>`;
          inList = false;
        }
        if (!inList) {
          html += '<ol>';
          inList = true;
          listType = 'ol';
        }
        const bulletContent = trimmed.replace(/^\d+\.\s/, '');
        html += `<li>${bulletContent}</li>`;
      } 
      // Normal paragraph
      else {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
          listType = null;
        }
        html += `<p>${line}</p>`;
      }
    }

    if (inList) {
      html += `</${listType}>`;
    }

    return html;
  }


  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
