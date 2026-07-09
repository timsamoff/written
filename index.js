/**
 * Written by Tim Samoff - Index Page Logic
 * Handles dynamic loading of projects and filter system
 */

// Use a unique namespace to avoid conflicts
var WrittenApp = WrittenApp || {};

(function() {
    'use strict';
    
    // Check if data is available from data.js or fetch
    var projectsData = null;
    var seriesData = null;
    var genresData = [];
    var themesData = [];
    var seriesState = {};
    
    function loadData() {
        return new Promise(function(resolve, reject) {
            // First check if data was loaded from data.js
            if (typeof window.__WRITTEN_DATA__ !== 'undefined' && window.__WRITTEN_DATA__) {
                var data = window.__WRITTEN_DATA__;
                projectsData = data.projects || [];
                seriesData = data.series || [];
                
                // Filter to only published projects
                var publishedProjects = projectsData.filter(function(p) { 
                    return p.published !== false; 
                });
                
                // Group by series to handle inheritance
                var seriesMap = {};
                var standalone = [];
                
                publishedProjects.forEach(function(p) {
                    if (p.series_id && seriesData.some(function(s) { return s.id === p.series_id; })) {
                        if (!seriesMap[p.series_id]) seriesMap[p.series_id] = [];
                        seriesMap[p.series_id].push(p);
                    } else {
                        standalone.push(p);
                    }
                });
                
                // Collect all genres and themes actually used
                var usedGenres = new Set();
                var usedThemes = new Set();
                
                // Add genres/themes from standalone projects
                standalone.forEach(function(p) {
                    (p.genres || []).forEach(function(g) { usedGenres.add(g); });
                    (p.themes || []).forEach(function(t) { usedThemes.add(t); });
                });
                
                // For series, collect from all articles AND the series header
                Object.keys(seriesMap).forEach(function(seriesId) {
                    var groupItems = seriesMap[seriesId];
                    var allGenres = new Set();
                    var allThemes = new Set();
                    
                    // Collect from each article in the series
                    groupItems.forEach(function(p) {
                        (p.genres || []).forEach(function(g) { allGenres.add(g); });
                        (p.themes || []).forEach(function(t) { allThemes.add(t); });
                    });
                    
                    // Add all series genres/themes to the used collections
                    allGenres.forEach(function(g) { usedGenres.add(g); });
                    allThemes.forEach(function(t) { usedThemes.add(t); });
                });
                
                // Convert to arrays and sort
                genresData = Array.from(usedGenres).sort();
                themesData = Array.from(usedThemes).sort();
                
                resolve(data);
                return;
            }
            
            // Fallback: fetch from server (for local development)
            fetch('/api/projects')
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Could not load projects from server');
                    }
                    return response.json();
                })
                .then(function(data) {
                    projectsData = data.projects || [];
                    seriesData = data.series || [];
                    
                    // Same logic as above...
                    var publishedProjects = projectsData.filter(function(p) { 
                        return p.published !== false; 
                    });
                    
                    var seriesMap = {};
                    var standalone = [];
                    
                    publishedProjects.forEach(function(p) {
                        if (p.series_id && seriesData.some(function(s) { return s.id === p.series_id; })) {
                            if (!seriesMap[p.series_id]) seriesMap[p.series_id] = [];
                            seriesMap[p.series_id].push(p);
                        } else {
                            standalone.push(p);
                        }
                    });
                    
                    var usedGenres = new Set();
                    var usedThemes = new Set();
                    
                    standalone.forEach(function(p) {
                        (p.genres || []).forEach(function(g) { usedGenres.add(g); });
                        (p.themes || []).forEach(function(t) { usedThemes.add(t); });
                    });
                    
                    Object.keys(seriesMap).forEach(function(seriesId) {
                        var groupItems = seriesMap[seriesId];
                        var allGenres = new Set();
                        var allThemes = new Set();
                        
                        groupItems.forEach(function(p) {
                            (p.genres || []).forEach(function(g) { allGenres.add(g); });
                            (p.themes || []).forEach(function(t) { allThemes.add(t); });
                        });
                        
                        allGenres.forEach(function(g) { usedGenres.add(g); });
                        allThemes.forEach(function(t) { usedThemes.add(t); });
                    });
                    
                    genresData = Array.from(usedGenres).sort();
                    themesData = Array.from(usedThemes).sort();
                    
                    resolve(data);
                })
                .catch(function(error) {
                    console.error('Error loading data:', error);
                    reject(error);
                });
        });
    }
    
    document.addEventListener('DOMContentLoaded', function() {
        var tbody = document.getElementById('toc-body');
        
        loadData()
            .then(function() {
                renderTable(projectsData, seriesData);
                // Initialize filter system after rendering
                setTimeout(function() {
                    updateFilterButtons();
                    // Call initFilterSystem from filter-system.js
                    if (typeof window.initFilterSystem === 'function') {
                        window.initFilterSystem();
                    } else {
                        console.error('initFilterSystem not found');
                    }
                    restoreSeriesState();
                    applyDefaultSeriesState();
                }, 100);
            })
            .catch(function(error) {
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
        var tbody = document.getElementById('toc-body');

        // Filter: only show published pieces
        var publishedProjects = projects.filter(function(p) { return p.published !== false; });
        
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
        var seriesMap = {};
        var standalone = [];
        
        publishedProjects.forEach(function(p) {
            if (p.series_id && series && series.some(function(s) { return s.id === p.series_id; })) {
                if (!seriesMap[p.series_id]) seriesMap[p.series_id] = [];
                seriesMap[p.series_id].push(p);
            } else {
                standalone.push(p);
            }
        });

        // Sort series by name
        var sortedSeriesIds = Object.keys(seriesMap).sort(function(a, b) {
            var sa = series.find(function(s) { return s.id === a; });
            var sb = series.find(function(s) { return s.id === b; });
            return (sa ? sa.name : a).localeCompare(sb ? sb.name : b);
        });

        var html = '';
        var rowCount = 0;

        // Series section header
        if (sortedSeriesIds.length > 0) {
            html += `
                <tr class="section-header-row">
                    <td colspan="3" class="section-header">
                        <span class="section-icon">📚</span>
                        <span class="section-name">Series</span>
                        <span class="section-count">(${sortedSeriesIds.length} series)</span>
                    </td>
                </tr>
            `;
        }

        // Render series groups
        sortedSeriesIds.forEach(function(seriesId) {
            var s = series.find(function(s) { return s.id === seriesId; });
            var groupItems = seriesMap[seriesId].sort(function(a, b) {
                if (a.part !== undefined && b.part !== undefined) return a.part - b.part;
                return (a.order || 0) - (b.order || 0);
            });

            // Collect all unique genres and themes from the series
            var allGenres = new Set();
            var allThemes = new Set();
            groupItems.forEach(function(p) {
                (p.genres || []).forEach(function(g) { allGenres.add(g); });
                (p.themes || []).forEach(function(t) { allThemes.add(t); });
            });
            
            // Convert to arrays for JSON serialization
            var seriesGenres = Array.from(allGenres);
            var seriesThemes = Array.from(allThemes);
            
            // Build series-level pills
            var seriesTags = [];
            seriesGenres.forEach(function(g) { seriesTags.push(g); });
            seriesThemes.forEach(function(t) { seriesTags.push(t); });
            var seriesPillsHtml = seriesTags.length > 0 
                ? seriesTags.map(function(tag) {
                    return `<span class="pill">${escapeHtml(tag)}</span>`;
                }).join('\n                                ')
                : '';

            // Get date range for the series
            var dates = groupItems.map(function(p) { return p.date; }).filter(function(d) { return d; }).sort();
            var dateDisplay = 'Multiple';
            if (dates.length === 1) {
                dateDisplay = formatDate(dates[0]);
            } else if (dates.length > 1) {
                var firstDate = formatDate(dates[0]);
                var lastDate = formatDate(dates[dates.length - 1]);
                var firstYear = dates[0].split('-')[0];
                var lastYear = dates[dates.length - 1].split('-')[0];
                if (firstYear === lastYear) {
                    var firstMonthDay = formatDate(dates[0]).replace(/, \d{4}$/, '');
                    var lastFull = formatDate(dates[dates.length - 1]);
                    dateDisplay = `<span class="date-line">${firstMonthDay} –</span><span class="date-line">${lastFull}</span>`;
                } else {
                    dateDisplay = `<span class="date-line">${formatDate(dates[0])} –</span><span class="date-line">${formatDate(dates[dates.length - 1])}</span>`;
                }
            }

            // Get saved state for this series - default to false (collapsed)
            var isExpanded = seriesState[seriesId] === true;
            var toggleIcon = isExpanded ? '▼' : '▶';

            // Series header row
            var descriptionHtml = s && s.description ? `<div class="series-description">${escapeHtml(s.description)}</div>` : '';
            
            html += `
                <tr class="series-header-row" data-series-id="${seriesId}" data-expanded="${isExpanded}">
                    <td class="toc-date series-date">
                        <span class="toggle-icon">${toggleIcon}</span>
                        <span class="date-range">${dateDisplay}</span>
                    </td>
                    <td class="toc-title series-title-cell">
                        <div class="series-title-wrapper">
                            <span class="series-name">${s ? escapeHtml(s.name) : escapeHtml(seriesId)}</span>
                            <span class="series-count">(${groupItems.length} part${groupItems.length !== 1 ? 's' : ''})</span>
                            ${descriptionHtml}
                        </div>
                    </td>
                    <td class="toc-tags series-tags-cell">
                        <div class="pill-container series-pills">
                            ${seriesPillsHtml}
                        </div>
                    </td>
                </tr>
            `;

            // Individual pieces in the series - now with inherited genres and themes
            groupItems.forEach(function(project) {
                // Each article inherits the series genres and themes for filtering
                html += createRow(project, true, isExpanded, seriesGenres, seriesThemes);
                rowCount++;
            });
        });

        // Standalone section header
        if (standalone.length > 0) {
            html += `
                <tr class="section-header-row">
                    <td colspan="3" class="section-header">
                        <span class="section-icon">📄</span>
                        <span class="section-name">Standalone</span>
                        <span class="section-count">(${standalone.length} piece${standalone.length !== 1 ? 's' : ''})</span>
                    </td>
                </tr>
            `;
            standalone.forEach(function(project) {
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

        // Add click handlers for series headers
        document.querySelectorAll('.series-header-row').forEach(function(header) {
            header.addEventListener('click', function(e) {
                if (e.target.closest('a')) return;
                var seriesId = this.dataset.seriesId;
                if (!seriesId) return;
                toggleSeries(seriesId);
            });
        });

        // Setup Expand All / Collapse All buttons
        setupExpandButtons(series);
    }
    
    function createRow(project, isSeries, isExpanded, seriesGenres, seriesThemes) {
        if (isExpanded === undefined) isExpanded = true;
        var fullPath = project.fullPath || 'writing/' + project.path + project.slug + '.html';
        
        var partBadge = project.part ? ' <span class="part-badge">Part ' + project.part + '</span>' : '';
        
        if (isSeries) {
            var dateDisplay = project.dateDisplay || formatDate(project.date);
            var collapsedClass = isExpanded ? '' : 'collapsed';
            
            // Use the series genres and themes for filtering (data attributes only)
            var genres = seriesGenres || [];
            var themes = seriesThemes || [];
            
            // NO pills for series articles - they only appear on the series header
            return `
                <tr class="series-article-row ${collapsedClass}" data-genres='${JSON.stringify(genres)}' data-themes='${JSON.stringify(themes)}'>
                    <td class="toc-date">${dateDisplay}</td>
                    <td class="toc-title">
                        <a href="${fullPath}">${escapeHtml(project.title)}${partBadge}</a>
                    </td>
                    <td class="toc-tags">
                        <!-- Series articles inherit tags from series header, no pills shown -->
                    </td>
                </tr>
            `;
        } else {
            var dateDisplay = project.dateDisplay || formatDate(project.date);
            var genres = project.genres || [];
            var themes = project.themes || [];
            var allTags = genres.concat(themes);
            
            var pills = allTags.map(function(tag) {
                return `<span class="pill">${escapeHtml(tag)}</span>`;
            }).join('\n                                ');
            
            return `
                <tr data-genres='${JSON.stringify(genres)}' data-themes='${JSON.stringify(themes)}'>
                    <td class="toc-date">${dateDisplay}</td>
                    <td class="toc-title">
                        <a href="${fullPath}">${escapeHtml(project.title)}</a>
                    </td>
                    <td class="toc-tags">
                        <div class="pill-container">
                            ${pills}
                        </div>
                    </td>
                </tr>
            `;
        }
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    
    // ==========================================================================
    // Series Toggle Functions
    // ==========================================================================
    
    function toggleSeries(seriesId) {
        var header = document.querySelector('.series-header-row[data-series-id="' + seriesId + '"]');
        if (!header) return;
        
        var isExpanded = header.dataset.expanded === 'true';
        var newState = !isExpanded;
        
        header.dataset.expanded = newState;
        
        var icon = header.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = newState ? '▼' : '▶';
        }
        
        var next = header.nextElementSibling;
        while (next && !next.classList.contains('series-header-row') && !next.classList.contains('section-header-row')) {
            // Toggle the collapsed class for series article rows
            if (next.classList.contains('series-article-row') || next.tagName === 'TR') {
                next.classList.toggle('collapsed', !newState);
            }
            next = next.nextElementSibling;
        }
        
        seriesState[seriesId] = newState;
        saveSeriesState();
        updateExpandAllButton();
    }
    
    function expandAllSeries() {
        var headers = document.querySelectorAll('.series-header-row[data-series-id]');
        headers.forEach(function(header) {
            var seriesId = header.dataset.seriesId;
            if (header.dataset.expanded === 'false') {
                toggleSeries(seriesId);
            }
        });
    }
    
    function collapseAllSeries() {
        var headers = document.querySelectorAll('.series-header-row[data-series-id]');
        headers.forEach(function(header) {
            var seriesId = header.dataset.seriesId;
            if (header.dataset.expanded === 'true') {
                toggleSeries(seriesId);
            }
        });
    }
    
    function applyDefaultSeriesState() {
        var headers = document.querySelectorAll('.series-header-row[data-series-id]');
        headers.forEach(function(header) {
            var seriesId = header.dataset.seriesId;
            if (seriesState[seriesId] === undefined) {
                seriesState[seriesId] = false;
                header.dataset.expanded = 'false';
                var icon = header.querySelector('.toggle-icon');
                if (icon) {
                    icon.textContent = '▶';
                }
                var next = header.nextElementSibling;
                while (next && !next.classList.contains('series-header-row') && !next.classList.contains('section-header-row')) {
                    if (next.classList.contains('series-article-row') || next.tagName === 'TR') {
                        next.classList.add('collapsed');
                    }
                    next = next.nextElementSibling;
                }
            }
        });
        saveSeriesState();
        updateExpandAllButton();
    }
    
    function setupExpandButtons(series) {
        var existingBtn = document.querySelector('.expand-btn');
        if (existingBtn) existingBtn.remove();
        
        if (!series || series.length === 0) return;
        
        var container = document.querySelector('.expand-control');
        if (!container) return;
        
        var btn = document.createElement('button');
        btn.className = 'expand-btn';
        btn.id = 'expand-all-btn';
        btn.textContent = 'Expand All';
        btn.addEventListener('click', function() {
            if (this.textContent === 'Expand All') {
                expandAllSeries();
            } else {
                collapseAllSeries();
            }
        });
        container.appendChild(btn);
        
        updateExpandAllButton();
    }
    
    function updateExpandAllButton() {
        var btn = document.getElementById('expand-all-btn');
        if (!btn) return;
        
        var headers = document.querySelectorAll('.series-header-row[data-series-id]');
        if (headers.length === 0) {
            btn.style.display = 'none';
            return;
        }
        
        btn.style.display = 'inline-block';
        
        var allExpanded = true;
        var allCollapsed = true;
        headers.forEach(function(header) {
            if (header.dataset.expanded === 'true') {
                allCollapsed = false;
            } else {
                allExpanded = false;
            }
        });
        
        if (allExpanded) {
            btn.textContent = 'Collapse All';
        } else if (allCollapsed) {
            btn.textContent = 'Expand All';
        } else {
            btn.textContent = 'Expand All';
        }
    }
    
    // ==========================================================================
    // Series State Persistence (localStorage)
    // ==========================================================================
    
    function saveSeriesState() {
        try {
            localStorage.setItem('written_series_state', JSON.stringify(seriesState));
        } catch (e) {
            // localStorage not available or full
        }
    }
    
    function restoreSeriesState() {
        try {
            var saved = localStorage.getItem('written_series_state');
            if (saved) {
                var parsed = JSON.parse(saved);
                seriesState = parsed;
            }
        } catch (e) {
            // Ignore
        }
    }
    
    // ==========================================================================
    // Update filter buttons dynamically from themes and genres
    // ==========================================================================
    
    function updateFilterButtons() {
        console.log('updateFilterButtons called');
        
        var genreContainer = document.getElementById('genre-filters');
        var themeContainer = document.getElementById('theme-filters');
        
        if (!genreContainer || !themeContainer) {
            console.error('Filter containers not found');
            return;
        }
        
        genreContainer.innerHTML = '';
        themeContainer.innerHTML = '';
        
        var allGenreBtn = document.createElement('button');
        allGenreBtn.className = 'filter-chip active';
        allGenreBtn.dataset.filter = 'all';
        allGenreBtn.textContent = 'All';
        genreContainer.appendChild(allGenreBtn);
        
        if (genresData && genresData.length > 0) {
            var sortedGenres = genresData.slice().sort();
            sortedGenres.forEach(function(genre) {
                var btn = document.createElement('button');
                btn.className = 'filter-chip';
                btn.dataset.filter = genre;
                btn.textContent = genre;
                genreContainer.appendChild(btn);
            });
        }
        
        var allThemeBtn = document.createElement('button');
        allThemeBtn.className = 'filter-chip active';
        allThemeBtn.dataset.filter = 'all';
        allThemeBtn.textContent = 'All';
        themeContainer.appendChild(allThemeBtn);
        
        if (themesData && themesData.length > 0) {
            var sortedThemes = themesData.slice().sort();
            sortedThemes.forEach(function(theme) {
                var btn = document.createElement('button');
                btn.className = 'filter-chip';
                btn.dataset.filter = theme;
                btn.textContent = theme;
                themeContainer.appendChild(btn);
            });
        }
        
        console.log('Filter buttons updated:', genreContainer.children.length, 'genre buttons,', themeContainer.children.length, 'theme buttons');
    }
    
    // Expose functions that need to be called from elsewhere
    window.toggleSeries = toggleSeries;
    window.expandAllSeries = expandAllSeries;
    window.collapseAllSeries = collapseAllSeries;
    window.applyDefaultSeriesState = applyDefaultSeriesState;
    window.restoreSeriesState = restoreSeriesState;
    window.updateFilterButtons = updateFilterButtons;
    window.seriesState = seriesState;
    
})();