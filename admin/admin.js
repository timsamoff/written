// ==========================================================================
// Written Admin - Complete Admin Logic
// ==========================================================================

// State
let projects = [];
let allGenres = ['sci-fi', 'ya', 'article', 'poetry', 'essay', 'guide'];
let allThemes = ['technology', 'writing', 'post-apocalyptic', 'publishing', 'autobiographical'];
let selectedGenres = [];
let selectedThemes = [];
let isEditing = false;
let editId = null;
let currentSearchTerm = '';
let autoSaveTimeout = null;

// DOM Elements
const form = document.getElementById('piece-form');
const formHeading = document.getElementById('form-title-heading');
const formEditId = document.getElementById('form-edit-id');
const formTitle = document.getElementById('form-title');
const formPath = document.getElementById('form-path');
const formSlug = document.getElementById('form-slug');
const formDate = document.getElementById('form-date');
const formMedia = document.getElementById('form-media');
const formHtml = document.getElementById('form-html');
const submitBtn = document.getElementById('submit-btn');
const downloadBtn = document.getElementById('download-btn');
const newPieceBtn = document.getElementById('new-piece-btn');
const sortableList = document.getElementById('sortable-list');
const urlPreview = document.getElementById('url-preview');
const adminSearch = document.getElementById('admin-search');
const adminSearchClear = document.getElementById('admin-search-clear');
const formPublished = document.getElementById('form-published');

// Genre elements
const genreTagManager = document.getElementById('genre-tag-manager');
const newGenreInput = document.getElementById('new-genre-input');
const addGenreBtn = document.getElementById('add-genre-btn');

// Theme elements
const themeTagManager = document.getElementById('theme-tag-manager');
const newThemeInput = document.getElementById('new-theme-input');
const addThemeBtn = document.getElementById('add-theme-btn');

// ==========================================================================
// Helper Functions
// ==========================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFirstImageFromHtml(html) {
    if (!html) return null;
    // Look for img tags with src
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
    }
    return null;
}

function extractArticleContent(html) {
    if (!html) return '';
    
    // Try to find the article content - look for the first article tag with story-content class
    const articleMatch = html.match(/<article[^>]*class="story-content[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
        // Check if there's a nested article tag inside
        const nestedMatch = articleMatch[1].match(/<article[^>]*class="story-content[^>]*>([\s\S]*?)<\/article>/i);
        if (nestedMatch) {
            // Return the nested article content (the actual content)
            return nestedMatch[0].trim();
        }
        return articleMatch[0].trim();
    }
    
    // Fallback: try to find any article tag
    const genericMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (genericMatch) {
        // Check for nested article
        const nestedMatch = genericMatch[1].match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (nestedMatch) {
            return nestedMatch[0].trim();
        }
        return genericMatch[0].trim();
    }
    
    return html;
}

// ==========================================================================
// Load content from existing HTML file
// ==========================================================================

async function loadContentFromFile(project) {
    if (!project || !project.path || !project.slug) return '';
    
    const filePath = `http://localhost:3000/writing/${project.path}${project.slug}.html`;
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) return '';
        
        const html = await response.text();
        const content = extractArticleContent(html);
        return content;
    } catch (err) {
        console.warn(`Could not load content for ${project.slug}:`, err);
        return '';
    }
}

// ==========================================================================
// File Upload
// ==========================================================================

const fileInput = document.getElementById('form-html-file');
const fileUploadText = document.getElementById('file-upload-text');
const clearFileBtn = document.getElementById('clear-file-btn');

fileInput.addEventListener('change', function(e) {
    const file = this.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const content = event.target.result;
        const extracted = extractArticleContent(content);
        formHtml.value = extracted || content;
        
        fileUploadText.textContent = file.name;
        fileUploadText.parentElement.classList.add('has-file');
        clearFileBtn.classList.add('visible');
        showNotification(`Loaded: ${file.name}`, 'success');
        
        if (isEditing) debouncedAutoSave();
    };
    reader.readAsText(file);
});

clearFileBtn.addEventListener('click', function() {
    fileInput.value = '';
    fileUploadText.textContent = 'Choose HTML file...';
    fileUploadText.parentElement.classList.remove('has-file');
    this.classList.remove('visible');
    formHtml.value = '';
    if (isEditing) debouncedAutoSave();
});

formHtml.addEventListener('input', function() {
    if (this.value.trim()) {
        fileUploadText.textContent = 'Manual entry';
        fileUploadText.parentElement.classList.add('has-file');
        clearFileBtn.classList.add('visible');
    }
});

// ==========================================================================
// URL Preview
// ==========================================================================

function updateUrlPreview() {
    const path = formPath.value.trim() || 'shorts/';
    const slug = formSlug.value.trim() || 'title-of-piece';
    const cleanPath = path.endsWith('/') ? path : path + '/';
    urlPreview.textContent = `writing/${cleanPath}${slug}.html`;
}

formPath.addEventListener('input', updateUrlPreview);
formSlug.addEventListener('input', updateUrlPreview);

// ==========================================================================
// Simplified Tag Manager
// ==========================================================================

function renderGenreTags() {
    const sorted = [...allGenres].sort();
    const pillsContainer = document.getElementById('genre-pills');
    
    pillsContainer.innerHTML = '';
    
    if (sorted.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--color-text-muted);font-size:0.75rem;padding:0.2rem 0.4rem;font-style:italic;';
        empty.textContent = 'No genres yet';
        pillsContainer.appendChild(empty);
    } else {
        sorted.forEach(genre => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            if (selectedGenres.includes(genre)) {
                chip.classList.add('active');
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = genre;
            chip.appendChild(nameSpan);
            
            if (selectedGenres.includes(genre)) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-tag';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedGenres = selectedGenres.filter(g => g !== genre);
                    renderGenreTags();
                    if (isEditing) debouncedAutoSave();
                });
                chip.appendChild(removeBtn);
            }
            
            chip.addEventListener('click', () => {
                if (selectedGenres.includes(genre)) {
                    selectedGenres = selectedGenres.filter(g => g !== genre);
                } else {
                    selectedGenres.push(genre);
                }
                renderGenreTags();
                if (isEditing) debouncedAutoSave();
            });
            
            pillsContainer.appendChild(chip);
        });
    }
}

function renderThemeTags() {
    const sorted = [...allThemes].sort();
    const pillsContainer = document.getElementById('theme-pills');
    
    pillsContainer.innerHTML = '';
    
    if (sorted.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--color-text-muted);font-size:0.75rem;padding:0.2rem 0.4rem;font-style:italic;';
        empty.textContent = 'No themes yet';
        pillsContainer.appendChild(empty);
    } else {
        sorted.forEach(theme => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            if (selectedThemes.includes(theme)) {
                chip.classList.add('active');
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = theme;
            chip.appendChild(nameSpan);
            
            if (selectedThemes.includes(theme)) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-tag';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedThemes = selectedThemes.filter(t => t !== theme);
                    renderThemeTags();
                    if (isEditing) debouncedAutoSave();
                });
                chip.appendChild(removeBtn);
            }
            
            chip.addEventListener('click', () => {
                if (selectedThemes.includes(theme)) {
                    selectedThemes = selectedThemes.filter(t => t !== theme);
                } else {
                    selectedThemes.push(theme);
                }
                renderThemeTags();
                if (isEditing) debouncedAutoSave();
            });
            
            pillsContainer.appendChild(chip);
        });
    }
}

function addGenre() {
    const name = newGenreInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    if (allGenres.includes(name)) {
        showNotification('Genre already exists', 'error');
        return;
    }
    allGenres.push(name);
    selectedGenres.push(name);
    newGenreInput.value = '';
    renderGenreTags();
    saveToServer();
    showNotification(`Added genre: ${name}`, 'success');
}

function addTheme() {
    const name = newThemeInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    if (allThemes.includes(name)) {
        showNotification('Theme already exists', 'error');
        return;
    }
    allThemes.push(name);
    selectedThemes.push(name);
    newThemeInput.value = '';
    renderThemeTags();
    saveToServer();
    showNotification(`Added theme: ${name}`, 'success');
}

newGenreInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addGenre(); }
});
addGenreBtn.addEventListener('click', addGenre);

newThemeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTheme(); }
});
addThemeBtn.addEventListener('click', addTheme);

// ==========================================================================
// Form Management
// ==========================================================================

function getFormData() {
    return {
        title: formTitle.value.trim(),
        path: formPath.value.trim(),
        slug: formSlug.value.trim(),
        date: formDate.value,
        mediaPath: formMedia.value.trim().replace(/\/+$/, ''),
        genres: [...selectedGenres],
        themes: [...selectedThemes],
        htmlContent: formHtml.value,
        published: formPublished.checked
    };
}

function setFormData(data) {
    formTitle.value = data.title || '';
    formPath.value = data.path || '';
    formSlug.value = data.slug || '';
    formDate.value = data.date || '';
    formMedia.value = data.mediaPath || '';
    selectedGenres = data.genres || [];
    selectedThemes = data.themes || [];
    formHtml.value = data.htmlContent || '';
    formPublished.checked = data.published !== false;
    renderGenreTags();
    renderThemeTags();
    updateUrlPreview();
}

function resetForm() {
    isEditing = false;
    editId = null;
    formHeading.textContent = 'New Piece';
    formEditId.value = '';
    formTitle.value = '';
    formPath.value = '';
    formSlug.value = '';
    formDate.value = '';
    formMedia.value = '';
    selectedGenres = [];
    selectedThemes = [];
    formHtml.value = '';
    formPublished.checked = true;
    submitBtn.style.display = 'block';
    downloadBtn.style.display = 'none';
    newPieceBtn.style.display = 'none';
    renderGenreTags();
    renderThemeTags();
    updateUrlPreview();
    document.querySelectorAll('.sort-item.editing').forEach(el => {
        el.classList.remove('editing');
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.style.borderStyle = '';
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
    });
}

function loadProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    isEditing = true;
    editId = id;
    formHeading.textContent = `Editing: ${project.title}`;
    formEditId.value = id;
    
    if (!project.htmlContent || project.htmlContent.trim() === '') {
        loadContentFromFile(project).then(content => {
            if (content) {
                project.htmlContent = content;
                saveToServer();
                showNotification(`Loaded content from ${project.slug}.html`, 'success');
            }
            setFormData(project);
        });
    } else {
        setFormData(project);
    }
    
    submitBtn.style.display = 'none';
    downloadBtn.style.display = 'block';
    newPieceBtn.style.display = 'inline-block';
    
    document.querySelectorAll('.sort-item.editing').forEach(el => {
        el.classList.remove('editing');
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.style.borderStyle = '';
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
    });
    const row = document.querySelector(`.sort-item[data-id="${id}"]`);
    if (row) {
        row.classList.add('editing');
        row.style.borderColor = 'var(--color-accent)';
        row.style.borderWidth = '2px';
        row.style.borderStyle = 'solid';
        row.style.boxShadow = '0 0 0 3px rgba(139, 90, 74, 0.15)';
        row.style.backgroundColor = 'var(--color-bg-card)';
    }
}

function newProject() {
    resetForm();
    formHeading.textContent = 'New Piece';
    submitBtn.style.display = 'block';
    downloadBtn.style.display = 'none';
    newPieceBtn.style.display = 'none';
    formTitle.focus();
}

// ==========================================================================
// Update Orders
// ==========================================================================

function updateOrders() {
    projects.forEach((p, index) => {
        p.order = index;
    });
}

// ==========================================================================
// Save & Load
// ==========================================================================

function saveToServer() {
    const data = {
        projects: projects,
        genres: allGenres,
        themes: allThemes
    };
    
    fetch('http://localhost:3000/api/save-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        if (!res.success) {
            showNotification('Save error: ' + res.error, 'error');
        }
    })
    .catch(() => {
        showNotification('Server not running. Run: node save-server.js', 'error');
    });
}

function loadFromServer() {
    fetch('http://localhost:3000/api/projects')
        .then(res => res.json())
        .then(data => {
            projects = data.projects || [];
            allGenres = data.genres || ['sci-fi', 'ya', 'article', 'poetry', 'essay', 'guide'];
            allThemes = data.themes || ['technology', 'writing', 'post-apocalyptic', 'publishing', 'autobiographical'];
            
            checkForExistingPieces();
            
            renderAll();
            showNotification(`Loaded ${projects.length} pieces`, 'success');
        })
        .catch(() => {
            showNotification('Could not load data. Server running?', 'error');
            projects = [];
            renderAll();
        });
}

// ==========================================================================
// Auto-detect Existing Pieces
// ==========================================================================

function checkForExistingPieces() {
    const knownPieces = [
        {
            id: 'threxil-pattern',
            title: 'The Threxil Pattern',
            path: 'shorts/',
            slug: 'threxil',
            date: '2026-05-20',
            dateDisplay: 'May 20, 2026',
            mediaPath: 'shorts/threxil',
            genres: ['sci-fi', 'ya'],
            themes: [],
            published: true,
            order: 0,
            htmlContent: ''
        },
        {
            id: 'written-formatted',
            title: 'Written & Formatted',
            path: 'articles/',
            slug: 'written-formatted',
            date: '2026-06-04',
            dateDisplay: 'June 4, 2026',
            mediaPath: 'articles/wf',
            genres: ['article'],
            themes: ['technology', 'writing', 'publishing'],
            published: true,
            order: 1,
            htmlContent: ''
        }
    ];
    
    let addedCount = 0;
    let totalToAdd = knownPieces.filter(p => !projects.some(existing => existing.id === p.id)).length;
    
    if (totalToAdd === 0) {
        // Still try to load content for existing pieces that have empty content
        projects.forEach(project => {
            if (!project.htmlContent || project.htmlContent.trim() === '') {
                loadContentFromFile(project).then(content => {
                    if (content) {
                        project.htmlContent = content;
                        saveToServer();
                        console.log(`✅ Loaded content for: ${project.title}`);
                    }
                });
            }
        });
        return;
    }
    
    knownPieces.forEach(piece => {
        const exists = projects.some(p => p.id === piece.id);
        if (!exists) {
            loadContentFromFile(piece).then(content => {
                if (content) {
                    piece.htmlContent = content;
                    console.log(`✅ Loaded content for: ${piece.title}`);
                }
                projects.push(piece);
                addedCount++;
                if (addedCount === totalToAdd) {
                    updateOrders();
                    saveToServer();
                    renderAll();
                    console.log(`✅ Auto-added ${addedCount} existing pieces`);
                }
            });
        }
    });
}

// ==========================================================================
// Render All
// ==========================================================================

function renderAll() {
    renderGenreTags();
    renderThemeTags();
    renderList();
    updatePieceCount();
}

function updatePieceCount() {
    const count = document.getElementById('piece-count');
    if (count) {
        count.textContent = `${projects.length} ${projects.length === 1 ? 'piece' : 'pieces'}`;
    }
}

// ==========================================================================
// Auto-save
// ==========================================================================

function autoSave() {
    if (!isEditing || editId === null) return;
    const data = getFormData();
    if (!data.title || !data.slug) return;
    
    const index = projects.findIndex(p => p.id === editId);
    if (index === -1) return;
    
    const dateDisplay = data.date ? formatDate(data.date) : '';
    projects[index] = {
        ...projects[index],
        ...data,
        id: editId,
        dateDisplay: dateDisplay,
        fullPath: `writing/${data.path}${data.slug}.html`
    };
    saveToServer();
    renderList();
    showNotification('Auto-saved', 'success');
}

function debouncedAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(autoSave, 1000);
}

// ==========================================================================
// Date Helpers
// ==========================================================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ==========================================================================
// List Rendering
// ==========================================================================

function renderList() {
    const search = currentSearchTerm.toLowerCase();
    const filtered = projects.filter(p => 
        p.title.toLowerCase().includes(search) ||
        p.slug.toLowerCase().includes(search) ||
        p.path.toLowerCase().includes(search)
    );
    
    sortableList.innerHTML = '';
    
    if (filtered.length === 0) {
        sortableList.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-folder-open"></i>
                <p>${projects.length === 0 ? 'No pieces yet. Add your first one!' : 'No pieces match your search.'}</p>
            </div>
        `;
        return;
    }
    
    filtered.forEach(project => {
        const li = document.createElement('li');
        li.className = 'sort-item';
        li.draggable = true;
        li.dataset.id = project.id;
        
        if (editId === project.id) {
            li.classList.add('editing');
            li.style.borderColor = 'var(--color-accent)';
            li.style.borderWidth = '2px';
            li.style.borderStyle = 'solid';
            li.style.boxShadow = '0 0 0 3px rgba(139, 90, 74, 0.15)';
            li.style.backgroundColor = 'var(--color-bg-card)';
        }
        
        const genreDisplay = project.genres && project.genres.length > 0 
            ? project.genres.slice(0, 3).join(', ') + (project.genres.length > 3 ? '…' : '')
            : 'No genres';
        
        const themeDisplay = project.themes && project.themes.length > 0
            ? ' · ' + project.themes.slice(0, 2).join(', ') + (project.themes.length > 2 ? '…' : '')
            : '';
        
        const publishedBadge = project.published === false 
            ? ' <span style="font-size:0.55rem; background:var(--color-border); color:var(--color-text-muted); padding:0.05rem 0.4rem; border-radius:100px; font-family:Plus Jakarta Sans,sans-serif;">Draft</span>'
            : '';
                
        li.innerHTML = `
            <div class="sort-content" data-id="${project.id}">
                <strong>${project.title}</strong>${publishedBadge}
                <span class="sort-meta">${project.path}${project.slug}.html</span>
                <span class="sort-meta">· ${project.dateDisplay || 'No date'}</span>
                <span class="sort-meta" style="color:var(--color-accent);font-weight:500;">${genreDisplay}${themeDisplay}</span>
            </div>
            <div class="sort-actions">
                <button class="row-btn move-top-btn" title="Move to top">⇈</button>
                <button class="row-btn move-up-btn" title="Move up">↑</button>
                <button class="row-btn move-down-btn" title="Move down">↓</button>
                <button class="row-btn move-bottom-btn" title="Move to bottom">⇊</button>
                <button class="row-btn delete-btn" data-id="${project.id}" title="Delete">✕</button>
                <span class="sort-handle" title="Drag to reorder">☰</span>
            </div>
        `;
        
        li.querySelector('.sort-content').addEventListener('click', () => {
            loadProject(project.id);
        });
        
        li.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${project.title}" permanently?`)) {
                projects = projects.filter(p => p.id !== project.id);
                if (editId === project.id) resetForm();
                updateOrders();
                saveToServer();
                renderList();
                updatePieceCount();
                showNotification(`Deleted: ${project.title}`, 'success');
            }
        });
        
        const moveProject = (fromId, direction) => {
            const index = projects.findIndex(p => p.id === fromId);
            if (index === -1) return;
            let newIndex = index + direction;
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= projects.length) newIndex = projects.length - 1;
            if (newIndex === index) return;
            const [item] = projects.splice(index, 1);
            projects.splice(newIndex, 0, item);
            updateOrders();
            saveToServer();
            renderList();
        };
        
        li.querySelector('.move-top-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const index = projects.findIndex(p => p.id === project.id);
            if (index <= 0) return;
            const [item] = projects.splice(index, 1);
            projects.unshift(item);
            updateOrders();
            saveToServer();
            renderList();
        });
        
        li.querySelector('.move-up-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            moveProject(project.id, -1);
        });
        
        li.querySelector('.move-down-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            moveProject(project.id, 1);
        });
        
        li.querySelector('.move-bottom-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const index = projects.findIndex(p => p.id === project.id);
            if (index >= projects.length - 1) return;
            const [item] = projects.splice(index, 1);
            projects.push(item);
            updateOrders();
            saveToServer();
            renderList();
        });
        
        li.addEventListener('dragstart', (e) => {
            li.classList.add('dragging');
            e.dataTransfer.setData('text/plain', project.id);
        });
        
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
        });
        
        sortableList.appendChild(li);
    });
}

sortableList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = document.querySelector('.sort-item.dragging');
    if (!dragging) return;
    const items = [...sortableList.querySelectorAll('.sort-item:not(.dragging)')];
    const after = items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
    if (after) {
        sortableList.insertBefore(dragging, after);
    } else {
        sortableList.appendChild(dragging);
    }
});

sortableList.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const items = [...sortableList.querySelectorAll('.sort-item')];
    const newOrder = items.map(el => el.dataset.id);
    projects.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    updateOrders();
    saveToServer();
    renderList();
    showNotification('Reordered', 'success');
});

// ==========================================================================
// Search
// ==========================================================================

adminSearch.addEventListener('input', () => {
    currentSearchTerm = adminSearch.value;
    adminSearchClear.style.display = currentSearchTerm ? 'flex' : 'none';
    renderList();
});

adminSearchClear.addEventListener('click', () => {
    adminSearch.value = '';
    currentSearchTerm = '';
    adminSearchClear.style.display = 'none';
    adminSearch.focus();
    renderList();
});

// ==========================================================================
// Form Submit
// ==========================================================================

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = formTitle.value.trim();
    const path = formPath.value.trim();
    const slug = formSlug.value.trim();
    const date = formDate.value;
    const html = formHtml.value.trim();
    
    if (!title || !path || !slug || !date || !html) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    const cleanPath = path.endsWith('/') ? path : path + '/';
    const id = slug;
    const dateDisplay = formatDate(date);
    const fullPath = `writing/${cleanPath}${slug}.html`;
    
    const data = {
        id,
        title,
        path: cleanPath,
        slug,
        fullPath,
        date,
        dateDisplay,
        mediaPath: formMedia.value.trim().replace(/\/+$/, ''),
        genres: [...selectedGenres],
        themes: [...selectedThemes],
        htmlContent: html,
        published: formPublished.checked,
        order: projects.length
    };
    
    if (isEditing && editId) {
        const index = projects.findIndex(p => p.id === editId);
        if (index !== -1) {
            projects[index] = { ...projects[index], ...data };
            showNotification(`Updated: ${title}`, 'success');
        }
    } else {
        if (projects.find(p => p.id === id)) {
            showNotification('A piece with this slug already exists', 'error');
            return;
        }
        projects.push(data);
        updateOrders();
        showNotification(`Added: ${title}`, 'success');
    }
    
    saveToServer();
    resetForm();
    renderList();
    updatePieceCount();
    formTitle.focus();
});

// ==========================================================================
// Download HTML - Save As dialog with full metadata
// ==========================================================================

downloadBtn.addEventListener('click', async () => {
    if (!isEditing || !editId) {
        showNotification('No piece loaded to download', 'error');
        return;
    }
    
    const project = projects.find(p => p.id === editId);
    if (!project) {
        showNotification('Project not found', 'error');
        return;
    }
    
    if (!project.htmlContent || project.htmlContent.trim() === '') {
        showNotification('No HTML content to download. Please upload or paste content first.', 'error');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/templates/template.html');
        if (!response.ok) {
            showNotification('Could not load template.html', 'error');
            return;
        }
        let template = await response.text();
        
        // Build genre and theme pills
        const allTags = [...(project.genres || []), ...(project.themes || [])];
        const allPills = allTags.length > 0 
            ? allTags.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join('\n                        ')
            : '';
        
        // ============================================
        // Extract first image from content
        // ============================================
        let ogImage = 'https://samoff.com/wbts_icon.png';
        let hasImage = false;
        let imagePath = null;
        
        // Look for img tags in the content
        const imgMatch = project.htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
            imagePath = imgMatch[1];
            hasImage = true;
            
            // Handle different path types
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                ogImage = imagePath;
            } else if (imagePath.startsWith('/')) {
                ogImage = `https://samoff.com${imagePath}`;
            } else {
                // Build path based on piece location
                // Remove leading ./ or ../
                let cleanPath = imagePath.replace(/^\.\.?\//, '');
                
                // Check if the path already contains the media folder
                const mediaFolder = project.mediaPath || project.path.replace(/\/$/, '');
                const folderName = mediaFolder.split('/').pop();
                
                if (cleanPath.includes(folderName)) {
                    // Already has the folder, use as-is
                    ogImage = `https://samoff.com/written/writing/${project.path}${cleanPath}`;
                } else {
                    // Add the media folder
                    ogImage = `https://samoff.com/written/writing/${mediaFolder}/${cleanPath}`;
                }
            }
        }
        
        // ============================================
        // Title
        // ============================================
        const title = project.title || 'Untitled';
        const fullTitle = `${title} @ Written by Tim Samoff`;
        const metaDesc = project.title || '';
        
        // Replace title placeholder in meta tags
        template = template.replace(/<!-- TITLE: .*? -->/g, `<!-- TITLE: ${title} -->`);
        
        // Replace title tag
        template = template.replace(/<title>.*?<\/title>/, `<title>${fullTitle}</title>`);
        
        // Replace all meta tags
        template = template.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${metaDesc}">`);
        template = template.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${fullTitle}">`);
        template = template.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${metaDesc}">`);
        template = template.replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${ogImage}">`);
        template = template.replace(/<meta name="twitter:title" content=".*?">/, `<meta name="twitter:title" content="${fullTitle}">`);
        template = template.replace(/<meta name="twitter:description" content=".*?">/, `<meta name="twitter:description" content="${metaDesc}">`);
        template = template.replace(/<meta name="twitter:image" content=".*?">/, `<meta name="twitter:image" content="${ogImage}">`);
        
        // Twitter card type
        const twitterCard = hasImage ? 'summary_large_image' : 'summary';
        template = template.replace(/<meta name="twitter:card" content=".*?">/, `<meta name="twitter:card" content="${twitterCard}">`);
        
        // Date
        template = template.replace(/<span class="date">.*?<\/span>/, `<span class="date">${project.dateDisplay || ''}</span>`);
        
        // Title in header - replace the TITLE_PLACEHOLDER
        template = template.replace(/TITLE_PLACEHOLDER/g, title);
        
        // Also handle any leftover <!-- TITLE: --> in the h1
        template = template.replace(/<h1 class="story-title"[^>]*>.*?<\/h1>/, `<h1 class="story-title" id="story-title">${title}</h1>`);
        
        // Pills
        template = template.replace(/<div class="pill-container">[\s\S]*?<\/div>/, `<div class="pill-container">\n                        ${allPills}\n                    </div>`);
        
        // ============================================
        // Clean and replace article content
        // ============================================
        let cleanContent = project.htmlContent;
        
        // If the content has nested article tags, extract the inner one
        const nestedArticle = cleanContent.match(/<article[^>]*class="story-content[^>]*>([\s\S]*?)<\/article>/i);
        if (nestedArticle) {
            // Check if there's another article inside
            const innerArticle = nestedArticle[1].match(/<article[^>]*>([\s\S]*?)<\/article>/i);
            if (innerArticle) {
                cleanContent = innerArticle[0].trim();
            } else {
                cleanContent = nestedArticle[0].trim();
            }
        }
        
        // Replace the article in the template
        const articleMatch = template.match(/<article class="story-content ls-2">[\s\S]*?<\/article>/);
        if (articleMatch) {
            const articleTag = articleMatch[0];
            const newArticle = `<article class="story-content ls-2">\n${cleanContent}\n</article>`;
            template = template.replace(articleTag, newArticle);
        } else {
            const genericArticle = template.match(/<article[^>]*>[\s\S]*?<\/article>/);
            if (genericArticle) {
                const articleTag = genericArticle[0];
                const newArticle = `<article class="story-content ls-2">\n${cleanContent}\n</article>`;
                template = template.replace(articleTag, newArticle);
            } else {
                template = template.replace(/<!-- REPLACED BY ADMIN -->/g, cleanContent);
            }
        }
        
        // ============================================
        // Save As dialog
        // ============================================
        if ('showSaveFilePicker' in window) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: `${project.slug || 'untitled'}.html`,
                    types: [{
                        description: 'HTML File',
                        accept: { 'text/html': ['.html', '.htm'] }
                    }]
                });
                const writable = await fileHandle.createWritable();
                await writable.write(template);
                await writable.close();
                showNotification(`Saved: ${project.slug || 'untitled'}.html`, 'success');
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    return;
                }
                console.warn('File System API failed, falling back to download:', err);
            }
        }
        
        // Fallback download
        const blob = new Blob([template], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.slug || 'untitled'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => { URL.revokeObjectURL(url); }, 100);
        showNotification(`Downloaded: ${project.slug || 'untitled'}.html`, 'success');
        
    } catch (err) {
        console.error('Download error:', err);
        showNotification('Error downloading: ' + err.message, 'error');
    }
});

// ==========================================================================
// Notification System
// ==========================================================================

let notificationTimeout = null;

function showNotification(message, type = 'success') {
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();
    if (notificationTimeout) clearTimeout(notificationTimeout);
    
    const div = document.createElement('div');
    div.className = `admin-notification ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    
    notificationTimeout = setTimeout(() => {
        div.style.opacity = '0';
        div.style.transform = 'translateX(100%)';
        div.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 2500);
}

// ==========================================================================
// New Piece Button
// ==========================================================================

newPieceBtn.addEventListener('click', newProject);

// ==========================================================================
// Auto-save on form changes
// ==========================================================================

formTitle.addEventListener('input', debouncedAutoSave);
formPath.addEventListener('input', debouncedAutoSave);
formSlug.addEventListener('input', debouncedAutoSave);
formDate.addEventListener('input', debouncedAutoSave);
formMedia.addEventListener('input', debouncedAutoSave);
formHtml.addEventListener('input', debouncedAutoSave);

// ==========================================================================
// Init
// ==========================================================================

loadFromServer();
updateUrlPreview();