/**
 * HTML Sanitization Utility
 * Prevents XSS attacks by sanitizing user input before inserting into DOM
 */

/**
 * Sanitize HTML string - escapes all special characters
 * Use this when you need to display user content as plain text
 */
function sanitizeHTML(str) {
    if (str === undefined || str === null) return '';
    
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Sanitize HTML but allow specific safe tags
 * Use this when you need to preserve some HTML formatting
 */
function sanitizeHTMLWithTags(html, allowedTags = []) {
    if (html === undefined || html === null) return '';
    
    const div = document.createElement('div');
    div.innerHTML = String(html);
    
    // If no tags allowed, just escape everything
    if (allowedTags.length === 0) {
        return sanitizeHTML(html);
    }
    
    // Walk through all elements and remove disallowed tags/attributes
    const walk = (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            
            // Remove disallowed tags
            if (!allowedTags.includes(tagName)) {
                const textNode = document.createTextNode(node.textContent);
                node.parentNode.replaceChild(textNode, node);
                return;
            }
            
            // Remove all attributes (except 'class' and 'style' if explicitly allowed)
            const attrs = Array.from(node.attributes);
            for (const attr of attrs) {
                if (attr.name !== 'class' && attr.name !== 'style') {
                    node.removeAttribute(attr.name);
                }
            }
        }
        
        // Recursively walk children
        const children = Array.from(node.childNodes);
        for (const child of children) {
            walk(child);
        }
    };
    
    walk(div);
    return div.innerHTML;
}

/**
 * Create a safe DOM element with text content
 * Use this instead of innerHTML when possible
 */
function createSafeElement(tagName, textContent, className = '') {
    const element = document.createElement(tagName);
    element.textContent = textContent;
    if (className) {
        element.className = className;
    }
    return element;
}

/**
 * Safely set innerHTML by sanitizing first
 * Use this when you must use innerHTML (e.g., for alerts with icons)
 */
function safeSetInnerHTML(element, html) {
    if (!element) return;
    element.innerHTML = sanitizeHTMLWithTags(html, ['div', 'span', 'p', 'strong', 'em', 'br']);
}
