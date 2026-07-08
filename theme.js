/**
 * Written by Tim Samoff - Universal Theme Switcher System
 * Handles localStorage management and system preference overrides.
 */
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector('i') : null;

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const isDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
    
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    updateIcon(isDark);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateIcon(newTheme === 'dark');
        });
    }

    function updateIcon(isDarkState) {
        if (!themeIcon) return;
        if (isDarkState) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
});

/**
 * Calculate reading time and track page scroll progress.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Estimated Reading Time Calculation
    const articleContent = document.querySelector('.story-content');
    if (articleContent) {
        const text = articleContent.innerText.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const readingTime = Math.max(1, Math.ceil(words / 200)); // 200 Words Per Minute baseline, minimum 1 minute
        
        const metaContainer = document.querySelector('.card-meta');
        if (metaContainer) {
            // Check if reading time already exists to prevent duplicates
            const existingTime = metaContainer.querySelector('.reading-time');
            if (!existingTime) {
                // Separator dot
                const separator = document.createElement('span');
                separator.className = 'meta-separator';
                separator.textContent = '·';
                
                // Reading time text element
                const timeSpan = document.createElement('span');
                timeSpan.className = 'reading-time';
                timeSpan.textContent = `${readingTime} min read`;
                
                // Append them
                metaContainer.appendChild(separator);
                metaContainer.appendChild(timeSpan);
            }
        }
    }

    // Scroll Progress Bar
    const progressBar = document.getElementById('scroll-progress');
    if (progressBar) {
        window.addEventListener('scroll', () => {
            const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
            progressBar.style.width = scrolled + '%';
        });
    }
});