// Archivo: perfil.js (Actualizado para mostrar/ocultar el botón de copiar)

document.addEventListener('DOMContentLoaded', () => {

    /**
     * Función reutilizable para configurar un botón de Ocultar/Mostrar.
     * @param {string} toggleButtonId - El ID del botón de ojo (ej: 'toggleUsernameBtn')
     * @param {string} displayId - El ID del <span> que contiene el texto (ej: 'username-display')
     * @param {string} copyButtonId - El ID del botón de copiar (ej: 'copyUsernameBtn')
     */
    function setupToggle(toggleButtonId, displayId, copyButtonId) {
        const toggleButton = document.getElementById(toggleButtonId);
        const display = document.getElementById(displayId);
        const copyButton = document.getElementById(copyButtonId); // <-- Obtenemos el botón de copiar

        if (!toggleButton || !display || !copyButton) { // <-- Verificamos los 3
            console.warn(`Elemento no encontrado para ${toggleButtonId}, ${displayId} o ${copyButtonId}`);
            return;
        }

        toggleButton.addEventListener('click', () => {
            const isHidden = display.style.webkitTextSecurity === 'disc';

            if (isHidden) {
                // Estado actual: OCULTA. Acción: MOSTRAR
                display.style.webkitTextSecurity = 'none';
                display.style.textSecurity = 'none';
                toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
                toggleButton.title = 'Ocultar';
                copyButton.style.display = 'flex'; // <-- MOSTRAR BOTÓN DE COPIAR
            } else {
                // Estado actual: MOSTRADA. Acción: OCULTAR
                display.style.webkitTextSecurity = 'disc';
                display.style.textSecurity = 'disc';
                toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
                toggleButton.title = 'Mostrar';
                copyButton.style.display = 'none'; // <-- OCULTAR BOTÓN DE COPIAR
            }
        });
    }

    /**
     * Función reutilizable para configurar un botón de Copiar al Portapapeles.
     * (Esta función no necesita cambios)
     */
    function setupCopy(buttonId, displayId) {
        const copyButton = document.getElementById(buttonId);
        const display = document.getElementById(displayId);
        
        if (!copyButton || !display) {
            console.warn(`Elemento no encontrado para ${buttonId} o ${displayId}`);
            return;
        }

        const originalTitle = copyButton.title;

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(display.innerText).then(() => {
                
                const originalIcon = copyButton.innerHTML;
                copyButton.innerHTML = '<i class="fas fa-check"></i>';
                copyButton.title = '¡Copiado!';
                
                setTimeout(() => {
                    copyButton.innerHTML = originalIcon;
                    copyButton.title = originalTitle;
                }, 2000);

            }).catch(err => {
                console.error('Error al copiar: ', err);
                copyButton.title = 'Error al copiar';
            });
        });
    }

    // --- INICIALIZAR TODOS LOS BOTONES ---

    // Configurar botones de Ocultar/Mostrar (Ahora pasamos el ID del botón de copiar)
    setupToggle('toggleUsernameBtn', 'username-display', 'copyUsernameBtn');
    setupToggle('togglePasswordBtn', 'password-display', 'copyPasswordBtn');
    
    // Configurar botones de Copiar (Sin cambios en la llamada)
    setupCopy('copyUsernameBtn', 'username-display');
    setupCopy('copyPasswordBtn', 'password-display');

});