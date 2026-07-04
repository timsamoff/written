/**
 * Written by Tim Samoff - Index Page Logic
 * Handles dynamic loading of projects and filter system
 */

document.addEventListener('DOMContentLoaded', function() {
    const tbody = document.getElementById('toc-body');
    
    // Fetch the projects data
    fetch('/data/projects.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Could not load projects.json');
            }
            return response.json();
        })
        .then(data => {
            const projects = data.projects || [];
            renderTable(projects);
            // Re-initialize filters after rendering
            setTimeout(() => {
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

function renderTable(projects) {
    const tbody = document.getElementById('toc-body');

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

    // Sort by order if available, otherwise by date
    const sorted = [...publishedProjects].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
        }
        return new Date(b.date) - new Date(a.date);
    });

    let html = '';
    sorted.forEach(project => {
        const genres = project.genres || [];
        const themes = project.themes || [];
        const allTags = [...genres, ...themes];
        
        const pills = allTags.map(tag => 
            `<span class="pill">${escapeHtml(tag)}</span>`
        ).join('\n                                ');
        
        const dateDisplay = project.dateDisplay || formatDate(project.date);
        const fullPath = project.fullPath || `writing/${project.path}${project.slug}.html`;
        
        html += `
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
    });
    
    tbody.innerHTML = html;
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