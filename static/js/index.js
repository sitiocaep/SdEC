document.addEventListener('DOMContentLoaded', function() {
    // Inicializar Flatpickr
    flatpickr("#fecha_nacimiento", { dateFormat: "Y-m-d", locale: "es", maxDate: "today", allowInput: true });
    flatpickr("#reset-fecha-nacimiento", { dateFormat: "Y-m-d", locale: "es", maxDate: "today", allowInput: true });

    // Lógica Modales
    setupModalLogic('about-btn', 'about-modal', 'modal-close-btn');
    setupModalLogic('help-btn', 'help-modal', 'help-modal-close-btn');

    // Lógica de Cierre Paneles Setup
    const registerCloseBtn = document.getElementById('register-close-btn');
    if (registerCloseBtn) registerCloseBtn.addEventListener('click', showBlankState);
    const recoverCloseBtn = document.getElementById('recover-close-btn');
    if (recoverCloseBtn) recoverCloseBtn.addEventListener('click', showBlankState);

    // Poblar Cursos
    populateCourses();

    // Lógica Cambio de Curso
    const cursoSelect = document.getElementById('curso');
    if (cursoSelect) {
        cursoSelect.addEventListener('change', handleCourseChange);
        handleCourseChange(); // Llamada inicial
    }

    // Manejadores Botones Navegación Principal
    const navShowRegister = document.getElementById('nav-show-register');
    if (navShowRegister) navShowRegister.addEventListener('click', showRegisterForm);
    const navShowReset = document.getElementById('nav-show-reset');
    if (navShowReset) navShowReset.addEventListener('click', showResetForm);

    // Links Internos (Volver)
    const showLoginLink1 = document.getElementById('show-login');
    if (showLoginLink1) showLoginLink1.addEventListener('click', (e) => { 
        e.preventDefault(); 
        showBlankState(); 
        highlightNavbarLogin();
    });
    const showLoginLink2 = document.getElementById('show-login-from-reset');
    if (showLoginLink2) showLoginLink2.addEventListener('click', (e) => { 
        e.preventDefault(); 
        showBlankState(); 
        highlightNavbarLogin();
    });

    // Envío de Formularios
    const navbarLoginForm = document.getElementById('navbar-login-form');
    if (navbarLoginForm) navbarLoginForm.addEventListener('submit', handleLogin);
    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    const recoverCredBtn = document.getElementById('recover-credentials-btn');
    if (recoverCredBtn) recoverCredBtn.addEventListener('click', handleRecoverCredentials);

    // Botón Copiar
    document.body.addEventListener('click', handleCopyClick);

    // Inicializar Lógica del Asistente (Wizard)
    setupStepLogic();
    // ===== NUEVO: Inicializar campos condicionales =====
    setupConditionalFields(); 

    // ===== NUEVO: Inicializar formato de teléfono =====
    const telParticular = document.getElementById('tel_particular');
    if (telParticular) telParticular.addEventListener('input', formatPhoneNumber);
    const telCelular = document.getElementById('tel_celular');
    if (telCelular) telCelular.addEventListener('input', formatPhoneNumber);

    // ===== NUEVO: Inicializar campos de promedio =====
    setupPromedioFields();

    // Listener para ocultar prompts al escribir
    const registerPanelRight = document.querySelector('#register-screen .setup-panel-right');
    if (registerPanelRight) {
        registerPanelRight.addEventListener('input', hideLoginPromptRegister, { once: true });
    }
    const recoverPanelRight = document.querySelector('#recover-screen .setup-panel-right');
     if (recoverPanelRight) {
         recoverPanelRight.addEventListener('input', hideLoginPromptRecover, { once: true });
     }
});

// --- Funciones Auxiliares ---

function setupModalLogic(btnId, modalId, closeBtnId) {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);

    if (btn && modal && closeBtn) {
        btn.addEventListener('click', () => modal.style.display = 'flex');
        closeBtn.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
}

function handleCopyClick(e) {
    const copyBtn = e.target.closest('.btn-copy');
    if (copyBtn) {
        const targetId = copyBtn.dataset.copyTarget;
        const textElement = document.getElementById(targetId);
        if (textElement) {
            copyToClipboard(textElement.textContent, copyBtn);
        }
    }
}

function handleCourseChange() {
    const cursoSelect = document.getElementById('curso');
    const ecoemsFields = document.getElementById('ecoems-fields');
    const conditionalSteps = document.querySelectorAll('#register-screen .step-conditional');
    const selectedCourseValue = cursoSelect.value;
    const selectedCourseClean = selectedCourseValue.trim().toLowerCase();

    const registerTitle = document.querySelector('#register-screen .setup-panel-left .setup-title');
    if(registerTitle){
         if(selectedCourseValue) {
             registerTitle.textContent = `Inscripción ${selectedCourseValue.trim()}`;
         } else {
             registerTitle.textContent = 'Inscripción C.A.E.P.';
         }
         const panelRight = document.querySelector('#register-screen .setup-panel-right');
         if(panelRight) panelRight.setAttribute('data-title', registerTitle.textContent);
    }

    const logoImg = document.getElementById('dynamic-logo');
    if (logoImg) {
        const defaultLogo = '/static/img/logo_caep.png';
        const ecoemsLogo = '/static/img/logo_ecoems.png';
        const licLogo = '/static/img/logo_licenciatura.png';

        if (selectedCourseClean.includes('ecoems')) logoImg.src = ecoemsLogo;
        else if (selectedCourseClean.includes('licenciatura')) logoImg.src = licLogo;
        else logoImg.src = defaultLogo;
    }

    // --- NUEVO: Lógica para cambiar etiquetas de promedio ---
    const labelPromedio1 = document.getElementById('label_promedio_primero');
    const labelPromedio2 = document.getElementById('label_promedio_segundo');

    if (labelPromedio1 && labelPromedio2) {
        if (selectedCourseClean.includes('licenciatura')) {
            labelPromedio1.textContent = 'Promedio 1er año preparatoria';
            labelPromedio2.textContent = 'Promedio 2do año preparatoria';
        } else {
            // Default (ECOEMS o cualquier otro)
            labelPromedio1.textContent = 'Promedio 1er grado secundaria';
            labelPromedio2.textContent = 'Promedio 2do grado secundaria';
        }
    }
    // --- FIN Lógica de etiquetas ---

    isEcoems = (selectedCourseClean === 'ecoems 2026' || selectedCourseClean === 'licenciatura 2026');
    if (isEcoems) {
        const introText = document.getElementById('pdf-form-intro');
        if (introText) introText.textContent = `Completa los siguientes datos para tu ficha de inscripción (${selectedCourseValue.trim()}).`;
        if (ecoemsFields) ecoemsFields.style.display = 'block';
        conditionalSteps.forEach(step => step.style.display = 'flex');
    } else {
        if (ecoemsFields) ecoemsFields.style.display = 'none';
        conditionalSteps.forEach(step => step.style.display = 'none');
    }

    currentStep = 1;
    showStep(1); 
}

function hideLoginPromptRegister() {
    const prompt = document.getElementById('login-prompt-register');
    if (prompt) {
        prompt.classList.add('hidden');
    }
}
function hideLoginPromptRecover() {
    const prompt = document.getElementById('login-prompt-recover');
    if (prompt) {
         prompt.classList.add('hidden');
    }
}

/**
 * NUEVA FUNCIÓN: Resalta los campos de login del navbar
 */
function highlightNavbarLogin() {
    const usernameInput = document.getElementById('nav-username');
    const passwordInput = document.getElementById('nav-password');
    // Duración total = 1.2s por ciclo * 2 ciclos = 2400ms
    const animationDuration = 2400; 

    if (usernameInput && passwordInput) {
        // 1. Añadir la clase para iniciar la animación
        usernameInput.classList.add('highlight-login-field');
        passwordInput.classList.add('highlight-login-field');

        // 2. Poner el foco (cursor) en el campo de usuario - ELIMINADO POR SOLICITUD
        // usernameInput.focus(); 

        // 3. Quitar la clase después de que termine la animación
        //    Esto es importante para que la animación pueda volver a ejecutarse
        setTimeout(() => {
            usernameInput.classList.remove('highlight-login-field');
            passwordInput.classList.remove('highlight-login-field');
        }, animationDuration);
    }
}

// ===== NUEVA FUNCIÓN: setupConditionalFields =====
/**
 * Añade listeners a todos los <select> condicionales para mostrar/ocultar campos.
 */
function setupConditionalFields() {
    const selects = document.querySelectorAll('.conditional-select');
    selects.forEach(select => {
        // Ejecutar al cargar para ocultar los que tengan "No" o "" por defecto
        toggleConditionalField(select); 
        
        // Ejecutar al cambiar
        select.addEventListener('change', () => {
            toggleConditionalField(select);
            // Re-validar el paso actual para mostrar/ocultar el botón "Continuar"
            checkStepCompleteness(currentStep); 
        });
    });
}

/**
 * Muestra/oculta un campo condicional basado en el valor de su <select> controlador.
 * @param {HTMLSelectElement} select - El <select> que controla la visibilidad.
 */
function toggleConditionalField(select) {
    const targetGroupId = select.dataset.targetGroup;
    const targetGroup = document.getElementById(targetGroupId);
    if (!targetGroup) return;

    const targetInput = targetGroup.querySelector('input, select, textarea');
    
    if (select.value === 'Sí') {
        targetGroup.style.display = 'block';
    } else {
        targetGroup.style.display = 'none';
        // Limpiar el valor del campo oculto para que no falle la validación final
        if (targetInput) {
            targetInput.value = '';
        }
    }
}

// ===== NUEVA FUNCIÓN: formatPhoneNumber =====
/**
 * Formatea automáticamente los campos de teléfono (ej: 55 5555 5555)
 * @param {Event} e - El evento 'input'
 */
function formatPhoneNumber(e) {
    let input = e.target;
    let value = input.value.replace(/\D/g, ''); // Quitar todo lo que no sea dígito
    let formattedValue = '';

    if (value.length > 0) {
        formattedValue = value.substring(0, 2);
    }
    if (value.length > 2) {
        formattedValue += ' ' + value.substring(2, 6);
    }
    if (value.length > 6) {
        formattedValue += ' ' + value.substring(6, 10);
    }
    input.value = formattedValue;
}

// ===== NUEVAS FUNCIONES: setupPromedioFields y handlePromedioChange =====
/**
 * Configura los listeners para los campos de promedio (entero y decimal)
 */
function setupPromedioFields() {
    const selects = document.querySelectorAll('.promedio-select-entero, .promedio-select-decimal');
    selects.forEach(select => {
        select.addEventListener('change', handlePromedioChange);
    });
}

/**
 * Maneja el cambio en un selector de promedio y actualiza el campo oculto
 * @param {Event} e - El evento 'change'
 */
function handlePromedioChange(e) {
    const targetId = e.target.dataset.targetHidden;
    if (!targetId) return;

    const hiddenInput = document.getElementById(targetId);
    const enteroSelect = document.getElementById(targetId + '_entero');
    const decimalSelect = document.getElementById(targetId + '_decimal');

    if (!hiddenInput || !enteroSelect || !decimalSelect) return;

    const enteroVal = enteroSelect.value;
    const decimalVal = decimalSelect.value;

    // Solo combinar si ambos valores han sido seleccionados
    if (enteroVal && decimalVal) {
        hiddenInput.value = `${enteroVal}.${decimalVal}`;
    } else {
        hiddenInput.value = ''; // Borrar si falta uno
    }
    
    // Re-validar el paso actual
    checkStepCompleteness(currentStep);
}


// --- Funciones de Carga de Cursos y PDF ---
function populateCourses() {
    const cursoSelect = document.getElementById('curso');
    if (!cursoSelect) return;
    const previousValue = cursoSelect.value;

    fetch('/api/get-courses')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.courses) {
                cursoSelect.innerHTML = '<option value="" disabled selected>Selecciona un curso...</option>';
                data.courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course;
                    option.textContent = course;
                    cursoSelect.appendChild(option);
                });
                 if (previousValue && data.courses.includes(previousValue)) {
                    cursoSelect.value = previousValue;
                    setTimeout(() => cursoSelect.dispatchEvent(new Event('change')), 0); 
                } else {
                    handleCourseChange();
                }
            } else {
                cursoSelect.innerHTML = '<option value="" disabled selected>Error al cargar cursos</option>';
            }
        })
        .catch(err => {
            console.error('Error al cargar cursos:', err);
            cursoSelect.innerHTML = '<option value="" disabled selected>Error de conexión</option>';
        });
}

function downloadPDF(b64Data, filename) {
    try {
        const byteCharacters = atob(b64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: 'application/pdf'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (e) {
        console.error("Error al decodificar o descargar el PDF:", e);
        showMessage("Registro exitoso, pero falló la descarga automática del PDF.", "error");
    }
}

// --- Función Copiar al Portapapeles ---
function copyToClipboard(text, buttonElement) {
    if (!navigator.clipboard) {
        showMessage('Tu navegador no soporta la función de copiado.', 'error');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        const originalIconHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-check" style="color: green;"></i>';
        buttonElement.disabled = true;

        setTimeout(() => {
            buttonElement.innerHTML = originalIconHTML;
            buttonElement.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('Error al copiar texto: ', err);
        showMessage('No se pudo copiar al portapapeles.', 'error');
    });
}


// ==================================
// === JS ASISTENTE (WIZARD) ===
// ==================================
let currentStep = 1;
let formSteps = [];
let stepIcons = [];
let isEcoems = false;
let totalSteps = 2;

function setupStepLogic() {
    const regForm = document.getElementById('register-form');
    if (!regForm) return;

    formSteps = Array.from(regForm.querySelectorAll('.form-step'));
    stepIcons = Array.from(regForm.closest('.setup-screen').querySelectorAll('.form-stepper .step'));

    const nextBtn = regForm.querySelector('.btn-step-next');
    const prevBtn = regForm.querySelector('.btn-step-prev');

    if (nextBtn) nextBtn.addEventListener('click', handleNext);
    if (prevBtn) prevBtn.addEventListener('click', handlePrev);

    // Listener para validación en tiempo real
    regForm.addEventListener('input', () => {
        checkStepCompleteness(currentStep);
    });
}

function checkStepCompleteness(stepNumber) {
    const regForm = document.getElementById('register-form');
    if (!regForm) return;
    const nextBtn = regForm.querySelector('.btn-step-next');
    const submitBtn = regForm.querySelector('.btn-submit-form');
    if (!nextBtn || !submitBtn) return;

    const isValid = validateStep(stepNumber, { silent: true }); // Validación silenciosa
    totalSteps = isEcoems ? 6 : 2; 

    if (stepNumber === 6) { // Siempre mostrar Submit en paso 6 (Revisar)
        submitBtn.style.display = 'inline-flex';
        nextBtn.style.display = 'none';
    } else { // Pasos 1 a 5
        nextBtn.style.display = isValid ? 'inline-flex' : 'none'; // Mostrar si es válido
        submitBtn.style.display = 'none';
    }
}


function handleNext() {
    if (!validateStep(currentStep)) return; // Validación con mensaje al hacer clic

    totalSteps = isEcoems ? 6 : 2;
    let nextStep = currentStep;

    if (currentStep === 1) {
        nextStep = isEcoems ? 2 : 6;
    } else if (currentStep < 5 && isEcoems) { // Pasos 2, 3, 4 -> Siguiente
        nextStep++;
    } else if ((currentStep === 5 && isEcoems) ) { // Paso 5 -> 6 (Revisar)
        nextStep = 6;
    }
    
    // Si estamos en el paso 1 y NO es Ecoems, el próximo paso es 6
    if(currentStep === 1 && !isEcoems) {
        nextStep = 6;
    }

    // Poblar revisión solo cuando el *próximo* paso sea 6
    if (nextStep === 6) {
        populateReview();
    }

    if (nextStep > 6) nextStep = 6; // Límite superior
    currentStep = nextStep;
    showStep(currentStep);
}


function handlePrev() {
    let prevStep = currentStep;
    if (currentStep === 6) {
        prevStep = isEcoems ? 5 : 1;
    } else if (currentStep === 2 && isEcoems) {
         prevStep = 1;
    } else if (currentStep > 2 && isEcoems) {
        prevStep--;
    }
    
    currentStep = prevStep;
    showStep(currentStep);
}


function showStep(stepNumber) {
    const regForm = document.getElementById('register-form');
    if (!regForm) return;

    const nextBtn = regForm.querySelector('.btn-step-next');
    const prevBtn = regForm.querySelector('.btn-step-prev');
    const submitBtn = regForm.querySelector('.btn-submit-form');
    if (!nextBtn || !prevBtn || !submitBtn) return;

    totalSteps = isEcoems ? 6 : 2;

    formSteps.forEach(step => step.classList.remove('active'));
    const currentStepContent = regForm.querySelector(`.form-step[data-step-content="${stepNumber}"]`);
    if (currentStepContent) {
        currentStepContent.classList.add('active');
        const panelRight = regForm.closest('.setup-panel-right');
        if(panelRight) panelRight.scrollTop = 0;
    }

    stepIcons.forEach((icon) => {
        const stepData = parseInt(icon.dataset.step);
        if (icon.classList.contains('step-conditional')) {
            icon.style.display = isEcoems ? 'flex' : 'none';
        }
        icon.classList.remove('active', 'completed');
        if (stepData < stepNumber) icon.classList.add('completed');
        else if (stepData === stepNumber) icon.classList.add('active');
    });

    // Lógica botones
    prevBtn.style.display = (stepNumber === 1) ? 'none' : 'inline-flex';
    nextBtn.style.display = 'none'; // Ocultar por defecto
    submitBtn.style.display = 'none'; // Ocultar por defecto

    // Establecer texto correcto del botón Next (aunque esté oculto inicialmente)
    if ((stepNumber === 5 && isEcoems) || (stepNumber === 1 && !isEcoems) ) {
         const cursoSelect = document.getElementById('curso');
         // Solo mostrar "Revisar" si el curso ya está seleccionado
         if (cursoSelect && cursoSelect.value) { 
             nextBtn.innerHTML = 'Revisar Datos <i class="fas fa-search"></i>';
         } else {
             nextBtn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
         }
     } else {
         nextBtn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
     }

     checkStepCompleteness(stepNumber); // Comprobar si se deben mostrar
}


// ===== FUNCIÓN VALIDATESTEP MODIFICADA (COMPLETA Y ESTRICTA) =====
/**
 * Valida los campos del paso actual.
 * @param {number} stepNumber - El paso a validar.
 * @param {object} options - Opciones.
 * @param {boolean} [options.silent=false] - Si es true, no muestra mensajes de error.
 * @returns {boolean} - True si es válido, false si no.
 */
function validateStep(stepNumber, options = {}) {
    const { silent = false } = options; 
    
    const stepContent = document.querySelector(`#register-form .form-step[data-step-content="${stepNumber}"]`);
    if (!stepContent) {
        if (!silent) console.error(`Contenido del paso ${stepNumber} no encontrado.`);
        return false;
    }
    
    // Paso 6 (Revisión) no tiene campos para validar
    if (stepNumber === 6) {
        return true; 
    }

    // Obtener TODOS los campos 'input', 'select' que están
    // VISIBLES dentro del paso actual.
    // Usamos :scope para buscar solo dentro de stepContent
    const fieldsToValidate = stepContent.querySelectorAll(
        ':scope .form-group input, :scope .form-group select, :scope .form-group textarea, ' +
        ':scope .form-group-conditional input, :scope .form-group-conditional select, :scope .form-group-conditional textarea'
    );
    
    for (const field of fieldsToValidate) {
        // 1. Omitir botones
        if (field.type === 'button' || field.type === 'submit' || field.type === 'reset') {
            continue;
        }

        // 2. Comprobar visibilidad real (si el campo o su .form-group padre están ocultos)
        const parentGroup = field.closest('.form-group, .form-group-conditional');
        // offsetParent es null si el elemento o un ancestro tiene display: none
        if (field.offsetParent === null || (parentGroup && getComputedStyle(parentGroup).display === 'none')) {
            continue; // Saltar validación de campos ocultos
        }
        
        // 3. Validar si está vacío
        // (Excepción: no validar selectores de promedio individuales, solo el oculto)
        if (field.classList.contains('promedio-select-entero') || field.classList.contains('promedio-select-decimal')) {
            // No validar los selectores individuales, solo el campo 'hidden'
        } else if (!field.value.trim()) {
             if (!silent) { // Mostrar error solo si no es validación silenciosa
                let labelText = `el campo "${field.id || field.name}"`;
                // Tratar de encontrar la etiqueta (label)
                const label = field.labels?.[0] || field.closest('.form-group, .form-group-conditional')?.querySelector('label');
                if (label) {
                    labelText = label.textContent;
                }
                
                showMessage(`Por favor, completa: ${labelText}`, 'error');
                if (field) field.focus();
             }
            return false; // Campo obligatorio visible está vacío
        }
    }

    // --- Validaciones Específicas Adicionales (Email, Teléfono) ---
    if (stepNumber === 1) {
        const email = document.getElementById('reg-email').value;
        const confirmEmail = document.getElementById('confirm-email').value;
        if (email !== confirmEmail) {
            if (!silent) {
                showMessage('Los correos electrónicos no coinciden', 'error');
                document.getElementById('confirm-email').focus();
            }
            return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
             if (!silent) {
                showMessage('El formato del correo electrónico no es válido', 'error');
                document.getElementById('reg-email').focus();
             }
             return false;
        }
    }

    // ===== VALIDACIÓN DE TELÉFONO MODIFICADA =====
    if (stepNumber === 2 && isEcoems) {
        // Modificado: Obtener el valor y limpiarlo de no-dígitos para validación
        const telParticular = document.getElementById('tel_particular').value;
        const telCelular = document.getElementById('tel_celular').value;
        const telParticularValue = telParticular.replace(/\D/g, ''); // Limpiar espacios y otros
        const telCelularValue = telCelular.replace(/\D/g, ''); // Limpiar espacios y otros
        
        const phoneRegex = /^\d{10}$/; 

        // Teléfonos ahora son obligatorios
        if (!phoneRegex.test(telParticularValue)) { // Validar valor limpio
             if (!silent) {
                showMessage('El teléfono particular debe tener 10 dígitos', 'error');
                document.getElementById('tel_particular').focus();
             }
             return false;
        }
         if (!phoneRegex.test(telCelularValue)) { // Validar valor limpio
             if (!silent) {
                showMessage('El teléfono celular debe tener 10 dígitos', 'error');
                document.getElementById('tel_celular').focus();
             }
             return false;
        }
    }
    
    // Si pasó todas las validaciones
    return true;
}


function populateReview() {
    const reviewContainer = document.getElementById('step-review-content');
    const form = document.getElementById('register-form');
    
    // ===== MODIFICACIÓN PARA ETIQUETAS DINÁMICAS =====
    const cursoSelect = document.getElementById('curso'); 
    if (!reviewContainer || !form || !cursoSelect) return; 

    const selectedCourseClean = cursoSelect.value.trim().toLowerCase(); 
    const formData = new FormData(form);
    reviewContainer.innerHTML = '';

    // --- Lógica de etiquetas dinámicas para Revisión ---
    let promedio1Label = 'Promedio 1° Secundaria';
    let promedio2Label = 'Promedio 2° Secundaria';
    if (selectedCourseClean.includes('licenciatura')) {
        promedio1Label = 'Promedio 1° Año Preparatoria';
        promedio2Label = 'Promedio 2° Año Preparatoria';
    }

    const fieldLabels = { 
        curso: 'Curso', nombre: 'Nombre(s)', apellido_paterno: 'Apellido Paterno', apellido_materno: 'Apellido Materno', email: 'Correo Electrónico', fecha_nacimiento: 'Fecha de Nacimiento', 
        edad: 'Edad', nombre_tutor: 'Nombre del Tutor', domicilio: 'Domicilio', ocupacion_tutor: 'Ocupación del Tutor', tel_particular: 'Teléfono Particular', tel_celular: 'Teléfono Celular', 
        si_no_trabajar: '¿Trabaja?', trabajar_donde: 'Lugar de trabajo', si_no_estudiar: '¿Estudia actualmente?', estudiar_donde: 'Lugar de estudio', si_no_dejar: '¿Ha dejado de estudiar?', dejar_donde: 'Motivo', si_no_leer: '¿Le gusta leer?', leer_que: 'Tipo de lectura', materias_agrado: 'Materias de agrado', materias_complejas: 'Materias complejas', materias_desagrado: 'Materias de desagrado', materias_por_que: 'Motivo desagrado', motivar_estudiar: 'Motivación para estudiar', horas_tareas: 'Horas dedicadas a tareas', horas_estudiar: 'Horas dedicadas a estudiar', 
        si_no_estudiar_solo: '¿Estudia por sí mismo?', si_no_papas_tarea: '¿Padres indican tarea?', papas_tarea_cuando: 'Cuándo indican tarea', 
        promedio_primero: promedio1Label, // <--- CAMBIO
        promedio_segundo: promedio2Label, // <--- CAMBIO
        promedio_actual: 'Promedio Actual', 
        si_no_deporte: '¿Practica deporte?', deporte_cual: 'Deporte que practica', escuela_objetivo: 'Escuela objetivo', estudiar_objetivo: '¿Qué quiere estudiar?', curso_objetivo: 'Expectativas del curso', comprometer_estudiar: 'Compromiso en el curso', corto_plazo: 'Aspiraciones (Corto Plazo)', mediano_plazo: 'Aspiraciones (Mediano Plazo)', largo_plazo: 'Aspiraciones (Largo Plazo)', 
        si_no_enfermedad: '¿Presenta enfermedad?', enfermedad_cual: 'Enfermedad', si_no_medicamento: '¿Toma medicamento?', medicamento_cual: 'Medicamento', si_no_seguro: '¿Tiene seguro social?', seguro_cual: 'Seguro(s)', 
    };
    // --- Fin Lógica de etiquetas ---
    // ===== FIN DE MODIFICACIÓN =====

    const sections = { 'Datos Personales': ['curso', 'nombre', 'apellido_paterno', 'apellido_materno', 'email', 'fecha_nacimiento'], 'Datos de Tutor': ['edad', 'nombre_tutor', 'domicilio', 'ocupacion_tutor', 'tel_particular', 'tel_celular'], 'Antecedentes': ['si_no_trabajar', 'trabajar_donde', 'si_no_estudiar', 'estudiar_donde', 'si_no_dejar', 'dejar_donde', 'si_no_leer', 'leer_que', 'materias_agrado', 'materias_complejas', 'materias_desagrado', 'materias_por_que', 'motivar_estudiar', 'horas_tareas', 'horas_estudiar'], 'Seguimiento': ['si_no_estudiar_solo', 'si_no_papas_tarea', 'papas_tarea_cuando', 'promedio_primero', 'promedio_segundo', 'promedio_actual', 'si_no_deporte', 'deporte_cual', 'escuela_objetivo', 'estudiar_objetivo', 'curso_objetivo', 'comprometer_estudiar', 'corto_plazo', 'mediano_plazo', 'largo_plazo'], 'Datos Importantes de Salud': ['si_no_enfermedad', 'enfermedad_cual', 'si_no_medicamento', 'medicamento_cual', 'si_no_seguro', 'seguro_cual'], };

    for (const [sectionTitle, fieldNames] of Object.entries(sections)) {
        if (sectionTitle === 'Datos Personales' || isEcoems) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'review-section';
            sectionDiv.innerHTML = `<h4 class="review-title">${sectionTitle}</h4>`;
            let sectionHasContent = false;

            fieldNames.forEach(fieldName => {
                // (Modificación: Usar form.elements[fieldName] para obtener el campo oculto de promedio)
                if (form.elements[fieldName]) {
                    const value = formData.get(fieldName);
                    if (value && fieldLabels[fieldName]) {
                        let displayValue = value;
                        const detailFieldsMap = { 'si_no_trabajar': 'trabajar_donde', 'si_no_estudiar': 'estudiar_donde', 'si_no_dejar': 'dejar_donde', 'si_no_leer': 'leer_que', 'si_no_papas_tarea': 'papas_tarea_cuando', 'si_no_deporte': 'deporte_cual', 'si_no_enfermedad': 'enfermedad_cual', 'si_no_medicamento': 'medicamento_cual', 'si_no_seguro': 'seguro_cual' };
                        
                        if (fieldName.startsWith('si_no_')) {
                            // No hacer nada, el valor "Sí" o "No" se mostrará
                        } else if (Object.values(detailFieldsMap).includes(fieldName)) {
                            // Este es un campo de detalle, verificar si debe mostrarse
                            const correspondingSiNoField = Object.keys(detailFieldsMap).find(key => detailFieldsMap[key] === fieldName);
                            // Ocultar si el campo "Sí/No" correspondiente no es "Sí"
                            if(!form.elements[correspondingSiNoField] || formData.get(correspondingSiNoField)?.toLowerCase() !== 'sí'){
                                return; // No añadir este item
                            }
                        }

                        const item = document.createElement('p');
                        item.className = 'review-item';
                        item.innerHTML = `<span class="review-label">${fieldLabels[fieldName]}:</span> <span class="review-value">${displayValue}</span>`;
                        sectionDiv.appendChild(item);
                        sectionHasContent = true;
                    }
                }
            });

            if (sectionHasContent) {
                reviewContainer.appendChild(sectionDiv);
            }
        }
    }
}
// --- Fin Lógica del Asistente ---


// --- Funciones showBlankState, showRegisterForm, showResetForm ---
function showBlankState() {
    const registerScreen = document.getElementById('register-screen');
    if (registerScreen) registerScreen.style.display = 'none';
    const recoverScreen = document.getElementById('recover-screen');
    if (recoverScreen) recoverScreen.style.display = 'none';
    const registerTitle = document.querySelector('#register-screen .setup-panel-left .setup-title');
    if(registerTitle) registerTitle.textContent = 'Inscripción C.A.E.P.';
     const panelRightReg = document.querySelector('#register-screen .setup-panel-right');
     if(panelRightReg) panelRightReg.removeAttribute('data-title');
    
    // Volver a mostrar prompts
    const loginPromptReg = document.getElementById('login-prompt-register');
    if (loginPromptReg) loginPromptReg.classList.remove('hidden');
    const loginPromptRec = document.getElementById('login-prompt-recover');
    if (loginPromptRec) loginPromptRec.classList.remove('hidden');

     // Reactivar listeners para ocultar prompts
     const registerPanelRight = document.querySelector('#register-screen .setup-panel-right');
     if (registerPanelRight) {
         registerPanelRight.removeEventListener('input', hideLoginPromptRegister);
         registerPanelRight.addEventListener('input', hideLoginPromptRegister, { once: true });
     }
     const recoverPanelRight = document.querySelector('#recover-screen .setup-panel-right');
     if (recoverPanelRight) {
          recoverPanelRight.removeEventListener('input', hideLoginPromptRecover);
         recoverPanelRight.addEventListener('input', hideLoginPromptRecover, { once: true });
     }
}
function showRegisterForm() {
    clearForms();
    document.getElementById('register-screen').style.display = 'grid';
    document.getElementById('recover-screen').style.display = 'none';
    showStep(1);
    currentStep = 1;
     const registerTitle = document.querySelector('#register-screen .setup-panel-left .setup-title');
     const panelRightReg = document.querySelector('#register-screen .setup-panel-right');
     if(registerTitle && panelRightReg) panelRightReg.setAttribute('data-title', registerTitle.textContent);
     // Mostrar prompt
     const loginPromptReg = document.getElementById('login-prompt-register');
    if (loginPromptReg) loginPromptReg.classList.remove('hidden');
}
function showResetForm() {
    clearForms();
    document.getElementById('recover-screen').style.display = 'grid';
    document.getElementById('register-screen').style.display = 'none';
     const panelRightRec = document.querySelector('#recover-screen .setup-panel-right');
     if(panelRightRec) panelRightRec.setAttribute('data-title', 'Recuperar Credenciales');
      // Mostrar prompt
     const loginPromptRec = document.getElementById('login-prompt-recover');
    if (loginPromptRec) loginPromptRec.classList.remove('hidden');
}

// --- Función clearForms ---
function clearForms() {
    const regForm = document.getElementById('register-form');
    if (regForm) {
        regForm.reset();
         const screen = regForm.closest('.setup-screen');
         const stepper = screen?.querySelector('.form-stepper');
         const navigation = regForm.querySelector('.form-navigation');
         const title = screen?.querySelector('.setup-panel-left .setup-title');
         if(stepper) stepper.style.display = 'flex';
         if(navigation) navigation.style.display = 'flex';
         if(title) title.textContent = 'Inscripción C.A.E.P.';
         const passwordResult = document.getElementById('password-result');
         if(passwordResult) passwordResult.style.display = 'none';
         
         // --- INICIO DE MODIFICACIÓN: Limpiar sección de PDF ---
         const pdfSection = document.getElementById('pdf-download-section');
         if (pdfSection) {
             pdfSection.remove(); // Elimina la sección de descarga si existe
         }
         // --- FIN DE MODIFICACIÓN ---

         const panelRight = screen?.querySelector('.setup-panel-right');
         if(panelRight) panelRight.removeAttribute('data-title');
         
         const loginPromptReg = document.getElementById('login-prompt-register');
         if(loginPromptReg) loginPromptReg.classList.remove('hidden');

         if (panelRight) {
             panelRight.removeEventListener('input', hideLoginPromptRegister);
             panelRight.addEventListener('input', hideLoginPromptRegister, { once: true });
         }
         
         // Ocultar todos los campos condicionales
         document.querySelectorAll('.form-group-conditional').forEach(group => {
            group.style.display = 'none';
         });
         
         // Limpiar campos ocultos de promedio
         document.querySelectorAll('input[type="hidden"][name^="promedio_"]').forEach(input => {
            input.value = '';
         });
    }
    const resForm = document.getElementById('reset-form');
    if (resForm) {
        resForm.reset();
         const panelRightRec = resForm.closest('.setup-panel-right');
         if(panelRightRec) panelRightRec.removeAttribute('data-title');
         const loginPromptRec = document.getElementById('login-prompt-recover');
        if(loginPromptRec) loginPromptRec.classList.remove('hidden');

         if (panelRightRec) {
              panelRightRec.removeEventListener('input', hideLoginPromptRecover);
             panelRightRec.addEventListener('input', hideLoginPromptRecover, { once: true });
         }
    }

    document.getElementById('recovery-result').style.display = 'none';

    const ecoemsFields = document.getElementById('ecoems-fields');
    if (ecoemsFields) ecoemsFields.style.display = 'none';
    const conditionalSteps = document.querySelectorAll('#register-screen .step-conditional');
    conditionalSteps.forEach(step => step.style.display = 'none');

    const logoImg = document.getElementById('dynamic-logo');
    if (logoImg) logoImg.src = '/static/img/logo_caep.png';

    const recoverBtn = document.getElementById('recover-credentials-btn');
    if (recoverBtn) recoverBtn.disabled = false;

    isEcoems = false;
    totalSteps = 2;
    currentStep = 1;
    showStep(1); // Esto llamará a checkStepCompleteness(1) y ocultará el botón
}

// --- Funciones de Login ---
function handleLogin(e) { e.preventDefault(); const formData = new FormData(this); const username = formData.get('username')?.trim(); const password = formData.get('password')?.trim(); if (!username || !password) { showMessage('Por favor, completa todos los campos', 'error'); return; } const submitBtn = this.querySelector('button[type="submit"]'); const originalText = submitBtn.innerHTML; if (this.id === 'navbar-login-form') { submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; } else { submitBtn.textContent = 'Iniciando sesión...'; } submitBtn.disabled = true; fetch('/login', { method: 'POST', body: formData }) .then(response => response.json()) .then(data => { if (data.success) { showMessage(data.message, 'success'); if (data.redirect) { setTimeout(() => { window.location.href = data.redirect; }, 1000); } } else { if (data.session_active) { showSessionActiveMessage(data.message, formData, submitBtn); } else { showMessage(data.message, 'error'); } } }) .catch(error => { console.error('Error en fetch /login:', error); showMessage('Error al iniciar sesión', 'error'); }) .finally(() => { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }); }
function showSessionActiveMessage(message, formData, submitBtn) { const existingMessage = document.querySelector('.message-alert.message-warning'); if (existingMessage) existingMessage.remove(); const messageDiv = document.createElement('div'); messageDiv.className = 'message-alert message-warning'; messageDiv.innerHTML = `<div style="margin-bottom: 15px;">${message}</div><div style="display: flex; gap: 10px; justify-content: flex-end;"><button id="cancel-force" class="btn-action-small">Cancelar</button><button id="confirm-force" class="btn-action-small-danger">Cerrar sesión anterior e iniciar</button></div>`; document.body.appendChild(messageDiv); const cancelBtn = document.getElementById('cancel-force'); const confirmBtn = document.getElementById('confirm-force'); if(cancelBtn) cancelBtn.addEventListener('click', () => messageDiv.remove()); if(confirmBtn) confirmBtn.addEventListener('click', () => { forceLogin(formData, submitBtn); messageDiv.remove(); }); }
function forceLogin(formData, submitBtn) { const originalText = submitBtn.innerHTML; const formId = submitBtn.closest('form')?.id; if (formId === 'navbar-login-form') { submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; } else { submitBtn.textContent = 'Forzando inicio...'; } submitBtn.disabled = true; fetch('/force-login', { method: 'POST', body: formData }) .then(response => response.json()) .then(data => { if (data.success) { showMessage(data.message, 'success'); if (data.redirect) { setTimeout(() => { window.location.href = data.redirect; }, 1000); } } else { showMessage(data.message, 'error'); } }) .catch(error => { console.error('Error en fetch /force-login:', error); showMessage('Error al forzar inicio de sesión', 'error'); }) .finally(() => { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }); }

// --- Funciones de Registro y Recuperación ---
function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    
    // ===== MODIFICADO: Asegurarse que los campos de promedio ocultos estén actualizados =====
    // (Esto es por si el usuario usa autocompletar y no dispara el evento 'change')
    document.querySelectorAll('input[type="hidden"][name^="promedio_"]').forEach(hiddenInput => {
        const targetId = hiddenInput.id;
        const enteroSelect = document.getElementById(targetId + '_entero');
        const decimalSelect = document.getElementById(targetId + '_decimal');
        if (enteroSelect && decimalSelect && enteroSelect.value && decimalSelect.value) {
            hiddenInput.value = `${enteroSelect.value}.${decimalSelect.value}`;
        } else {
             hiddenInput.value = ''; // Asegurar que esté vacío si no está completo
        }
    });
    // ===================================================================================

    const formData = new FormData(form);

    // Correr la validación final con todos los campos
    // (Esta es una validación de "submit", no silenciosa)
    if (!validateStep(1) || 
        (isEcoems && !validateStep(2)) ||
        (isEcoems && !validateStep(3)) ||
        (isEcoems && !validateStep(4)) ||
        (isEcoems && !validateStep(5))) 
    {
        showMessage('Error: Faltan campos obligatorios. Revisa todos los pasos.', 'error');
        // Opcional: enviar al primer paso con error
        for(let i = 1; i <= 5; i++) {
            if (i > 1 && !isEcoems) continue;
            if (!validateStep(i, { silent: true })) {
                currentStep = i;
                showStep(i);
                // La validación no silenciosa se disparará, mostrando el error específico
                validateStep(i); 
                return;
            }
        }
        return; // Por si acaso
    }

    const submitBtn = form.querySelector('.btn-submit-form');
    if (!submitBtn) return;

    submitBtn.textContent = 'Creando cuenta...';
    submitBtn.disabled = true;

    fetch('/register', { method: 'POST', body: formData })
        .then(response => {
             if (!response.ok) {
                 return response.json().then(errData => { throw new Error(errData.message || `Error del servidor: ${response.status}`); })
                 .catch(() => { throw new Error(`Error del servidor: ${response.status}`); });
             }
             return response.json();
        })
        .then(data => {
            if (data.success) {
                const resultDiv = document.getElementById('password-result');
                const usernameEl = document.getElementById('generated-username');
                const passwordEl = document.getElementById('generated-password');
                
                // --- INICIO DE MODIFICACIÓN: Insertar sección de PDF y botones ---
                if(resultDiv && usernameEl && passwordEl) {
                    
                    // 1. Crear la nueva sección de descarga
                    // Usamos los nombres de archivo de los datos, con un fallback
                    const pdf1_name = data.pdf_name || 'Ficha_de_Registro.pdf';
                    const pdf2_name = data.pdf_comprobante_name || 'Comprobante_Inscripcion.pdf';

                    const pdfSectionHTML = `
                    <div id="pdf-download-section" style="text-align: center; margin-bottom: 25px; border-bottom: 1px solid #eee; padding-bottom: 25px;">
                        <p style="margin: 0 0 20px 0; font-size: 0.9rem; color: #555;">Descarga tus documentos:</p>
                        
                        <div style="display: flex; justify-content: space-around; gap: 20px; flex-wrap: wrap;">
                    
                            <div class="pdf-download-item" style="display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 150px;">
                                <i class="fas fa-file-pdf" style="font-size: 3.5rem; color: #ae2a2a;"></i>
                                <p style="margin: 0; font-size: 0.8rem; color: #333; word-wrap: break-word;" title="${pdf1_name}">
                                    ${pdf1_name}
                                </p>
                                <button id="btn-download-registro" class="btn-action-small" style="background-color: #3498db; border: none; color: white; font-size: 0.8rem; padding: 8px 15px;">
                                    <i class="fas fa-download"></i> Descargar
                                </button>
                            </div>
                    
                            <div class="pdf-download-item" style="display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 150px;">
                                <i class="fas fa-file-pdf" style="font-size: 3.5rem; color: #ae2a2a;"></i>
                                <p style="margin: 0; font-size: 0.8rem; color: #333; word-wrap: break-word;" title="${pdf2_name}">
                                    ${pdf2_name}
                                </p>
                                <button id="btn-download-comprobante" class="btn-action-small" style="background-color: #3498db; border: none; color: white; font-size: 0.8rem; padding: 8px 15px;">
                                    <i class="fas fa-download"></i> Descargar
                                </button>
                            </div>
                    
                        </div>
                    </div>
                    `;
                    
                    // 2. Insertar la sección al principio del div 'password-result'
                    resultDiv.insertAdjacentHTML('afterbegin', pdfSectionHTML);

                    // 3. Poblar los campos de usuario y contraseña (que ya existen en el HTML)
                    usernameEl.textContent = data.username;
                    passwordEl.textContent = data.password;
                    
                    // 4. Mostrar el contenedor 'password-result'
                    resultDiv.style.display = 'block';

                    // 5. Añadir listeners a los NUEVOS botones de descarga
                    const downloadBtnRegistro = document.getElementById('btn-download-registro');
                    if (downloadBtnRegistro && data.pdf_b64) { // Comprobar si existe el b64
                        downloadBtnRegistro.addEventListener('click', () => {
                            downloadPDF(data.pdf_b64, pdf1_name);
                            // Deshabilitar botón después del clic
                            downloadBtnRegistro.innerHTML = '<i class="fas fa-check"></i> Descargado';
                            downloadBtnRegistro.disabled = true;
                            downloadBtnRegistro.style.backgroundColor = '#2ecc71'; // Verde
                        }, { once: true }); // Solo permitir un clic
                    } else if (downloadBtnRegistro) {
                        // Si no hay PDF, ocultar el item
                        downloadBtnRegistro.closest('.pdf-download-item').style.display = 'none';
                    }
                    
                    const downloadBtnComprobante = document.getElementById('btn-download-comprobante');
                    if (downloadBtnComprobante && data.pdf_comprobante_b64) { // Comprobar si existe el b64
                        downloadBtnComprobante.addEventListener('click', () => {
                            downloadPDF(data.pdf_comprobante_b64, pdf2_name);
                            // Deshabilitar botón después del clic
                            downloadBtnComprobante.innerHTML = '<i class="fas fa-check"></i> Descargado';
                            downloadBtnComprobante.disabled = true;
                            downloadBtnComprobante.style.backgroundColor = '#2ecc71'; // Verde
                        }, { once: true }); // Solo permitir un clic
                    } else if (downloadBtnComprobante) {
                        // Si no hay PDF, ocultar el item
                        downloadBtnComprobante.closest('.pdf-download-item').style.display = 'none';
                    }
                }
                // --- FIN DE MODIFICACIÓN ---

                showMessage(data.message, 'success');

                const screen = form.closest('.setup-screen');
                const stepper = screen?.querySelector('.form-stepper');
                const navigation = form.querySelector('.form-navigation');
                const title = screen?.querySelector('.setup-panel-left .setup-title');
                const loginPrompt = document.getElementById('login-prompt-register');

                if(stepper) stepper.style.display = 'none';
                if(navigation) navigation.style.display = 'none';
                if(loginPrompt) loginPrompt.style.display = 'none';
                if(title) title.textContent = "¡Inscripción Exitosa!";
                formSteps.forEach(step => step.style.display = 'none');

            } else {
                 showMessage(data.message || 'Error desconocido durante el registro.', 'error');
            }
        })
        .catch(error => {
            console.error('Error en fetch /register:', error);
            showMessage(error.message || 'Error en el registro. Intenta de nuevo.', 'error');
        })
        .finally(() => {
            const finalSubmitBtn = document.getElementById('register-form')?.querySelector('.btn-submit-form');
             if (finalSubmitBtn) {
                const resultDiv = document.getElementById('password-result');
                if(!resultDiv || resultDiv.style.display === 'none') {
                    finalSubmitBtn.textContent = 'Finalizar Inscripción';
                    finalSubmitBtn.disabled = false;
                }
             }
        });
}

function handleRecoverCredentials(e) { 
    e.preventDefault(); 
    const form = document.getElementById('reset-form'); 
    if (!form) return; 
    const formData = new FormData(form); 
    const recoverBtn = document.getElementById('recover-credentials-btn'); 
    
    if (!formData.get('email')?.trim() || !formData.get('confirm_email')?.trim() || !formData.get('fecha_nacimiento')?.trim()) { 
        showMessage('Por favor, completa todos los campos', 'error'); 
        return; 
    } 
    
    if (formData.get('email') !== formData.get('confirm_email')) { 
        showMessage('Los correos electrónicos no coinciden', 'error'); 
        return; 
    } 
    
    if (recoverBtn) { 
        recoverBtn.textContent = 'Recuperando...'; 
        recoverBtn.disabled = true; 
    } 
    
    fetch('/recover-credentials', { method: 'POST', body: formData }) 
        .then(response => response.json()) 
        .then(data => { 
            const resultDiv = document.getElementById('recovery-result'); 
            if (!resultDiv) return; 
            
            if (data.success) {
                // --- INICIO DE MODIFICACIÓN: Cambiar texto "nueva contraseña" ---
                resultDiv.innerHTML = `<div class="credential-container"><p>Tu usuario es: <strong id="recovered-username" class="recovered-credential">${data.username}</strong></p><button type="button" class="btn-copy" data-copy-target="recovered-username" title="Copiar usuario"><i class="far fa-copy"></i></button></div><div class="credential-container"><p>Tu contraseña es: <strong id="recovered-password" class="recovered-credential">${data.password}</strong></p><button type="button" class="btn-copy" data-copy-target="recovered-password" title="Copiar contraseña"><i class="far fa-copy"></i></button></div><p class="info-text">Estas son tus credenciales de acceso.</p>`;
                // --- FIN DE MODIFICACIÓN ---
                
                resultDiv.style.display = 'block'; 
                resultDiv.scrollIntoView({ behavior: 'smooth' }); 
                showMessage(data.message, 'success'); 
            } else { 
                showMessage(data.message, 'error'); 
                resultDiv.style.display = 'none'; 
                if (recoverBtn) recoverBtn.disabled = false; 
            } 
        }) 
        .catch(error => { 
            console.error('Error en fetch /recover-credentials:', error); 
            showMessage('Error al procesar la solicitud', 'error'); 
            if (recoverBtn) recoverBtn.disabled = false; 
        }) 
        .finally(() => { 
            if (recoverBtn && !recoverBtn.disabled) { 
                recoverBtn.textContent = 'Recuperar Credenciales'; 
            } 
        }); 
}

// --- Funciones showMessage y logout ---
function showMessage(message, type = 'info') { const existingMessage = document.querySelector('.message-alert'); if (existingMessage) existingMessage.remove(); const messageDiv = document.createElement('div'); messageDiv.className = `message-alert message-alert-${type}`; messageDiv.textContent = message; document.body.appendChild(messageDiv); setTimeout(() => { if (messageDiv.parentNode) { messageDiv.style.animation = 'slideOut 0.3s ease forwards'; messageDiv.addEventListener('animationend', () => messageDiv.remove(), { once: true }); } }, 5000); }
function logout() { if (confirm('¿Estás seguro de que quieres cerrar sesión?')) { window.location.href = '/logout'; } }

// --- Estilos CSS dinámicos ---
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    .message-alert { position: fixed; top: 80px; right: 20px; padding: 15px 20px; border-radius: 4px; color: white; font-weight: 500; z-index: 1050; animation: slideIn 0.3s ease forwards; max-width: 300px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
    .message-alert-success { background-color: #27ae60; }
    .message-alert-error { background-color: #e74c3c; }
    .message-alert-info { background-color: #3498db; }
    .message-alert-warning { background-color: #f39c12; padding: 20px; border-radius: 8px; }
    .btn-action-small { padding: 8px 16px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,0.5); color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
    .btn-action-small-danger { padding: 8px 16px; background: #c0392b; border: none; color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
    .btn-action-small:hover { background: rgba(255,255,255,0.3); }
    .btn-action-small-danger:hover { background: #e74c3c; }
`;
document.head.appendChild(style);