const el = document.createElement('div');
el.textContent = __APP_VERSION__;
el.style.cssText = 'position:fixed;bottom:4px;right:8px;font-size:11px;color:rgba(255,255,255,0.25);pointer-events:none;z-index:9999;font-family:monospace';
document.body.appendChild(el);
