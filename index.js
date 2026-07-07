/**
 * Written by Tim Samoff - Index Page Logic
 * Handles dynamic loading of projects and filter system
 */

// Check if data is available from data.js or fetch
let projectsData = null;
let seriesData = null;
let genresData = [];
let themesData = [];

function loadData() {
    return new Promise((resolve, reject) => {
        // First check if data was loaded from data.js
        if (typeof window.__WRITTEN_DATA__ !== 'undefined' && window.__WRITTEN_DATA__) {
            const data = window.__WRITTEN_DATA__;
            projectsData = data.projects || [];
            seriesData = data.series || [];
            genresData = data.genres || [];
            themesData = data.themes || [];
            resolve(data);
            return;
        }
        
        // Fallback: fetch from server
        fetch('/data/projects.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Could not load projects.json');
                }
                return response.json();
            })
            .then(data => {
                projectsData = data.projects || [];
                seriesData = data.series || [];
                genresData = data.genres || [];
                themesData = data.themes || [];
                resolve(data);
            })
            .catch(reject);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const tbody = document.getElementById('toc-body');
    
    loadData()
        .then(() => {
            renderTable(projectsData, seriesData);
            // Re-initialize filters after rendering
            setTimeout(() => {
                // Update filter buttons first
                updateFilterButtons();
                // Then initialize the filter system
                initFilterSystem();
            }, 50);
        })
        .catch(error => {
            console.error('Error loading projects:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; padding:2rem; color:var(--color-text-muted);">
                        <p>Could not load projects. Please make sure the server is running.</p>
                        <p style="font-size:0.8rem; margin-top:0.5rem;">Error: ${error.message}</p>
                    </td>
                </tr>
            `;
        });
});

function renderTable(projects, series) {
    const tbody = document.getElementById('toc-body');

    // Filter: only show published pieces
    const publishedProjects = projects.filter(p => p.published !== false);
    
    if (!publishedProjects || publishedProjects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; padding:2rem; color:var(--color-text-muted);">
                    <p>No published pieces yet. Check back soon!</p>
                </td>
            </tr>
        `;
        return;
    }

    // Group by series
    const seriesMap = {};
    const standalone = [];
    
    publishedProjects.forEach(p => {
        if (p.series_id && series && series.some(s => s.id === p.series_id)) {
            if (!seriesMap[p.series_id]) seriesMap[p.series_id] = [];
            seriesMap[p.series_id].push(p);
        } else {
            standalone.push(p);
        }
    });

    // Sort series by name
    const sortedSeriesIds = Object.keys(seriesMap).sort((a, b) => {
        const sa = series.find(s => s.id === a);
        const sb = series.find(s => s.id === b);
        return (sa ? sa.name : a).localeCompare(sb ? sb.name : b);
    });

    let html = '';
    let rowCount = 0;

    // Render series groups
    sortedSeriesIds.forEach(seriesId => {
        const s = series.find(s => s.id === seriesId);
        const groupItems = seriesMap[seriesId].sort((a, b) => {
            if (a.part !== undefined && b.part !== undefined) return a.part - b.part;
            return (a.order || 0) - (b.order || 0);
        });

        // Series header row
        html += `
            <tr class="series-header-row">
                <td colspan="3" class="series-header">
                    <span class="series-icon">📚</span>
                    <span class="series-name">${s ? escapeHtml(s.name) : escapeHtml(seriesId)}</span>
                    <span class="series-count">(${groupItems.length} part${groupItems.length !== 1 ? 's' : ''})</span>
                    ${s && s.description ? `<span class="series-description">— ${escapeHtml(s.description)}</span>` : ''}
                </td>
            </tr>
        `;

        groupItems.forEach(project => {
            html += createRow(project, true);
            rowCount++;
        });
    });

    // Render standalone
    if (standalone.length > 0) {
        html += `
            <tr class="series-header-row">
                <td colspan="3" class="series-header standalone-header">
                    <span class="series-icon">📄</span>
                    <span class="series-name">Standalone</span>
                    <span class="series-count">(${standalone.length} piece${standalone.length !== 1 ? 's' : ''})</span>
                </td>
            </tr>
        `;
        standalone.forEach(project => {
            html += createRow(project, false);
            rowCount++;
        });
    }

    if (rowCount === 0) {
        html = `
            <tr>
                <td colspan="3" style="text-align:center; padding:2rem; color:var(--color-text-muted);">
                    <p>No published pieces yet. Check back soon!</p>
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
}

function createRow(project, isSeries) {
    const genres = project.genres || [];
    const themes = project.themes || [];
    const allTags = [...genres, ...themes];
    
    const pills = allTags.map(tag => 
        `<span class="pill">${escapeHtml(tag)}</span>`
    ).join('\n                                ');
    
    const dateDisplay = project.dateDisplay || formatDate(project.date);
    const fullPath = project.fullPath || `writing/${project.path}${project.slug}.html`;
    
    // Part badge comes AFTER the title
    const partBadge = project.part 
        ? ` <span class="part-badge">Part ${project.part}</span>`
        : '';
    
    return `
        <tr data-genres='${JSON.stringify(genres)}' data-themes='${JSON.stringify(themes)}' class="${isSeries ? 'series-article' : ''}">
            <td class="toc-date">${dateDisplay}</td>
            <td class="toc-title">
                <a href="${fullPath}">${escapeHtml(project.title)}</a>${partBadge}
            </td>
            <td class="toc-tags">
                <div class="pill-container">
                    ${pills}
                </div>
            </td>
        </tr>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ==========================================================================
// Update filter buttons dynamically from themes and genres
// ==========================================================================

function updateFilterButtons() {
    // Update genre filters
    const genreContainer = document.getElementById('genre-filters');
    const themeContainer = document.getElementById('theme-filters');
    
    // Get current active filters by checking existing buttons
    const existingGenreActive = genreContainer.querySelector('.filter-chip.active');
    const existingThemeActive = themeContainer.querySelector('.filter-chip.active');
    const activeGenreValue = existingGenreActive ? existingGenreActive.dataset.filter : 'all';
    const activeThemeValue = existingThemeActive ? existingThemeActive.dataset.filter : 'all';
    
    // Rebuild genre buttons
    if (genresData && genresData.length > 0) {
        genreContainer.innerHTML = '';
        
        // Add "All" button
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-chip' + (activeGenreValue === 'all' ? ' active' : '');
        allBtn.dataset.filter = 'all';
        allBtn.textContent = 'All';
        genreContainer.appendChild(allBtn);
        
        // Add genre buttons
        const sortedGenres = [...genresData].sort();
        sortedGenres.forEach(genre => {
            const btn = document.createElement('button');
            btn.className = 'filter-chip' + (activeGenreValue === genre ? ' active' : '');
            btn.dataset.filter = genre;
            btn.textContent = genre;
            genreContainer.appendChild(btn);
        });
    }
    
    // Rebuild theme buttons
    if (themesData && themesData.length > 0) {
        themeContainer.innerHTML = '';
        
        // Add "All" button
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-chip' + (activeThemeValue === 'all' ? ' active' : '');
        allBtn.dataset.filter = 'all';
        allBtn.textContent = 'All';
        themeContainer.appendChild(allBtn);
        
        // Add theme buttons
        const sortedThemes = [...themesData].sort();
        sortedThemes.forEach(theme => {
            const btn = document.createElement('button');
            btn.className = 'filter-chip' + (activeThemeValue === theme ? ' active' : '');
            btn.dataset.filter = theme;
            btn.textContent = theme;
            themeContainer.appendChild(btn);
        });
    }
}