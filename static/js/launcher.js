// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // --- REFERENCIAS A ELEMENTOS ---
    const examSelect = document.getElementById('exam-select');
    const examSelector = document.getElementById('exam-selector');
    const examInfoContainer = document.getElementById('exam-info-container');
    
    // Nuevos elementos de la tarjeta estilo "Captura"
    const examNameTitle = document.getElementById('exam-name-title'); 
    const examStatusPill = document.getElementById('exam-status-pill'); 
    const examDatePill = document.getElementById('exam-date-pill');     
    const examTimePill = document.getElementById('exam-time-pill');     
    
    // Botones
    const headerExamSelect = document.getElementById('header-exam-select');
    const closeExamCardBtn = document.getElementById('close-exam-card');
    const startExamBtn = document.getElementById('start-exam-btn');
    const viewResultsBtn = document.getElementById('view-results-btn');
    const notPresentedBtn = document.getElementById('not-presented-btn');
    
    // Almacenamiento de datos
    let examData = {}; 

    // --- FETCH DE DATOS ---
    fetch('/api/courses')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    showMessage('Sesión expirada. Redirigiendo al inicio...', 'error');
                    setTimeout(() => window.location.href = '/', 3000);
                }
                if (response.status === 400) {
                     showMessage('Error: No se encontró un curso asociado a tu cuenta.', 'error');
                }
                throw new Error('No se pudo cargar la información de los exámenes.');
            }
            return response.json();
        })
        .then(data => {
            examData = data;
            
            // Poblar selector principal
            if(examSelect) {
                examSelect.innerHTML = '<option value="">-- Selecciona un examen --</option>'; 
                
                if (Object.keys(examData).length === 0) {
                    examSelect.innerHTML = '<option value="">-- No hay exámenes disponibles --</option>';
                } else {
                    for (const examKey in examData) {
                        const exam = examData[examKey];
                        const option = document.createElement('option');
                        option.value = examKey; 
                        const code = exam.code || examKey;
                        option.textContent = `${code} - ${exam.name}`;
                        examSelect.appendChild(option);
                    }
                }
            }

            // Poblar selector de la cabecera
            if(headerExamSelect) {
                headerExamSelect.innerHTML = '<option value="">-- Cambiar examen --</option>'; 
                if (Object.keys(examData).length > 0) {
                    for (const examKey in examData) {
                        const exam = examData[examKey];
                        const option = document.createElement('option');
                        option.value = examKey; 
                        const code = exam.code || examKey;
                        option.textContent = `${code} - ${exam.name}`;
                        headerExamSelect.appendChild(option);
                    }
                }
            }
            
            // Mostrar selector principal
            if(examSelector) examSelector.style.display = 'block';
            
            // Iniciar timer para actualizar estado en tiempo real
            setInterval(updateExamStatuses, 1000);
        })
        .catch(error => {
            console.error('Error fetching exams:', error);
            showMessage('Error al cargar exámenes. Intenta recargar la página.', 'error');
            if(examSelect) examSelect.innerHTML = '<option value="">-- Error al cargar --</option>';
            if(examSelector) examSelector.style.display = 'block'; 
        });

    // --- MANEJO DE SELECCIÓN DE EXAMEN ---
    if(examSelect) {
        examSelect.addEventListener('change', function() {
            const selectedExam = this.value; 
            
            if (selectedExam && examData[selectedExam]) {
                const exam = examData[selectedExam];
                
                // 1. Actualizar Título
                if(examNameTitle) examNameTitle.textContent = exam.name || selectedExam;
                
                // 2. Actualizar UI (Colores y Botones)
                updateStatusUI(exam);

                // 3. Actualizar Pastilla de Fecha
                if(examDatePill) {
                    examDatePill.textContent = formatDatePretty(exam.raw_date);
                }

                // 4. Actualizar Pastilla de Horario
                if(examTimePill) {
                    const start = exam.raw_start ? exam.raw_start.substring(0, 5) : "--:--";
                    const end = exam.raw_end ? exam.raw_end.substring(0, 5) : "--:--";
                    examTimePill.textContent = `${start} - ${end}`;
                }
                
                // 5. Cambiar visibilidad de contenedores
                if(examSelector) examSelector.style.display = 'none';
                if(examInfoContainer) examInfoContainer.style.display = 'block';

                showMessage(`Examen seleccionado: ${exam.name}`, 'success');
            } else {
                if(examInfoContainer) examInfoContainer.style.display = 'none';
            }
        });
    }
    
    // --- MANEJO DEL DESPLEGABLE EN LA CABECERA ---
    if(headerExamSelect) {
        headerExamSelect.addEventListener('change', function() {
            if (this.value && examSelect) {
                // Sincronizar el valor con el select principal y disparar el evento
                examSelect.value = this.value;
                examSelect.dispatchEvent(new Event('change'));
                
                // Reiniciar el desplegable superior para que se quede en "-- Cambiar examen --"
                this.value = ''; 
            }
        });
    }

    // --- FUNCIÓN REUTILIZABLE PARA COLAPSAR LA TARJETA ---
    function collapseExamCard() {
        if(examInfoContainer) examInfoContainer.style.display = 'none';
        if(examSelector) examSelector.style.display = 'block'; 
        if(examSelect) examSelect.value = ''; // Reiniciar select principal
    }

    // --- BOTÓN CERRAR/COLAPSAR TARJETA ("X") ---
    if(closeExamCardBtn) {
        closeExamCardBtn.addEventListener('click', function(e) {
            e.preventDefault();
            collapseExamCard();
            // Restauramos el mensaje exactamente original
            showMessage('Puedes seleccionar otro examen', 'info'); 
        });
    }

    // --- CERRAR AL HACER CLIC FUERA DE LA TARJETA ---
    document.addEventListener('click', function(e) {
        // Solo actuar si la tarjeta de examen está visible
        if (examInfoContainer && examInfoContainer.style.display === 'block') {
            // Verificar que el clic NO fue dentro del contenedor de la tarjeta 
            // y tampoco fue en el selector de exámenes principal
            if (!examInfoContainer.contains(e.target) && examSelector && !examSelector.contains(e.target)) {
                collapseExamCard();
                // Colapso silencioso, sin alerta, para no interrumpir al usuario
            }
        }
    });

    // --- LOGICA DEL BOTÓN COMENZAR EXAMEN ---
    if (startExamBtn) {
        startExamBtn.addEventListener('click', function() {
            if (!this.disabled && this.style.display !== 'none') {
                const examKey = examSelect.value;
                if (!examKey) return;

                const examUrl = `/examen?materia=${encodeURIComponent(examKey)}`;
                const testUrl = `/test?next=${encodeURIComponent(examUrl)}`;
                window.location.href = testUrl;
            }
        });
    }

    // --- FUNCIONES DE UTILIDAD Y FORMATO ---

    function formatDatePretty(dateString) {
        if (!dateString) return "---";
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        try {
            const parts = dateString.split('-');
            if(parts.length === 3) {
                const year = parts[0];
                const monthIndex = parseInt(parts[1]) - 1; 
                const day = parts[2];
                return `${day} - ${meses[monthIndex]} - ${year}`;
            }
            return dateString;
        } catch(e) { return dateString; }
    }

    function calculateExamStatus(exam) {
        try {
            if (!exam.raw_date || !exam.raw_start || !exam.raw_end) {
                return { status: exam.status, available: exam.available };
            }

            const today = new Date();
            const examDateStr = exam.raw_date.trim(); 
            
            const startStr = `${examDateStr}T${exam.raw_start.trim()}`;
            const endStr = `${examDateStr}T${exam.raw_end.trim()}`;
            
            const startDateTime = new Date(startStr);
            const endDateTime = new Date(endStr);

            if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
                return { status: exam.status, available: exam.available }; 
            }
            
            if (today < startDateTime) {
                return { status: "Aún no empieza", available: false };
            } else if (today >= startDateTime && today <= endDateTime) {
                return { status: "Disponible", available: true };
            } else {
                return { status: "Finalizado", available: false };
            }
        } catch (e) {
            console.error("Error calculating status:", e);
            return { status: "Error", available: false };
        }
    }

    // --- LÓGICA PRINCIPAL DE ESTADOS ---
    function updateStatusUI(exam) {
        // Reset botones
        if(startExamBtn) { startExamBtn.style.display = 'none'; startExamBtn.disabled = true; }
        if(viewResultsBtn) { viewResultsBtn.style.display = 'none'; viewResultsBtn.textContent = 'Ver resultados'; viewResultsBtn.onclick = null; viewResultsBtn.classList.remove('disabled'); viewResultsBtn.style.cursor = 'pointer'; viewResultsBtn.style.backgroundColor = ''; }
        if(notPresentedBtn) { notPresentedBtn.style.display = 'none'; }

        // Definir clases y texto para status pill
        let statusText = exam.status;
        let colorClass = 'status-not-started'; // Default

        // Obtener bandera de si es Admin desde el HTML
        const isAdmin = document.body.getAttribute('data-is-admin') === 'true';

        // LÓGICA 1: ¿YA SE PRESENTÓ?
        if (exam.taken) {
            statusText = "Finalizado";
            colorClass = "status-finished";

            // Verificar fecha de resultados
            const today = new Date();
            let resultsAvailable = false;
            let resultDateText = "Próximamente";

            if (exam.results_date && exam.results_time) {
                try {
                    const resStr = `${exam.results_date.trim()}T${exam.results_time.trim()}`;
                    const resDateTime = new Date(resStr);
                    
                    const dateFormatted = formatDatePretty(exam.results_date);
                    const timeFormatted = exam.results_time.substring(0, 5); // HH:MM
                    
                    resultDateText = `${dateFormatted} - ${timeFormatted}`;

                    if (!isNaN(resDateTime.getTime())) {
                        if (today >= resDateTime) {
                            resultsAvailable = true;
                        }
                    }
                } catch(e) { console.error("Error parsing result date", e); }
            }

            if(viewResultsBtn) {
                viewResultsBtn.style.display = 'flex';
                
                // Si ya es fecha de resultados O es Administrador
                if (resultsAvailable || isAdmin) {
                    viewResultsBtn.textContent = (isAdmin && !resultsAvailable) ? "Ver Resultados (Admin)" : "Ver Resultados";
                    viewResultsBtn.classList.remove('disabled');
                    
                    // Redirección
                    viewResultsBtn.onclick = () => { 
                        const materiaParam = encodeURIComponent(exam.name || exam.code);
                        window.location.href = `/resultados?materia=${materiaParam}`; 
                    };
                    
                } else {
                    viewResultsBtn.textContent = `Fecha de resultados: ${resultDateText}`;
                    viewResultsBtn.classList.add('disabled');
                    viewResultsBtn.style.cursor = 'default';
                    viewResultsBtn.style.backgroundColor = '#f39c12';
                    viewResultsBtn.onclick = (e) => { e.preventDefault(); };
                }
            }

        } else {
            // LÓGICA 2: NO SE HA PRESENTADO
            
            if (exam.status === 'Disponible') {
                statusText = "Disponible";
                colorClass = "pill-green";
                
                if(startExamBtn) {
                    startExamBtn.style.display = 'flex';
                    startExamBtn.disabled = false;
                    startExamBtn.classList.remove('disabled');
                }
            } else if (exam.status === 'Finalizado') {
                statusText = "Finalizado";
                colorClass = "status-finished";
                
                if(notPresentedBtn) {
                    notPresentedBtn.style.display = 'flex';
                }
            } else {
                statusText = "Aún no empieza";
                colorClass = "status-not-started";
            }
            
            // --- NUEVO: SI ES ADMIN, SIEMPRE MOSTRAR BOTÓN DE RESULTADOS ---
            if (isAdmin && viewResultsBtn) {
                viewResultsBtn.style.display = 'flex';
                viewResultsBtn.textContent = "Ver Resultados (Admin)";
                viewResultsBtn.classList.remove('disabled');
                viewResultsBtn.style.cursor = 'pointer';
                viewResultsBtn.style.backgroundColor = ''; // Limpiar color naranja si lo tuviera
                
                viewResultsBtn.onclick = () => { 
                    const materiaParam = encodeURIComponent(exam.name || exam.code);
                    window.location.href = `/resultados?materia=${materiaParam}`; 
                };
            }
        }

        // Actualizar UI del Pill
        if (examStatusPill) {
            examStatusPill.textContent = statusText;
            examStatusPill.className = 'detail-pill ' + colorClass;
        }
        
        if(examDatePill) examDatePill.className = 'detail-pill ' + colorClass;
        if(examTimePill) examTimePill.className = 'detail-pill ' + colorClass;
    }

    // Loop que corre cada segundo para verificar horas
    function updateExamStatuses() {
        if (!examData) return;

        let hasChanged = false;
        const selectedExamKey = examSelect ? examSelect.value : null;

        for (const examKey in examData) {
            const exam = examData[examKey];
            const oldStatus = exam.status;
            
            const newStatusInfo = calculateExamStatus(exam);
            
            exam.status = newStatusInfo.status;
            exam.available = newStatusInfo.available;

            if (oldStatus !== exam.status) hasChanged = true;
        }

        // Si el estado del examen seleccionado cambió, actualizar UI
        if (selectedExamKey && examData[selectedExamKey]) {
            const exam = examData[selectedExamKey];
            updateStatusUI(exam);
        }
    }

    // --- SISTEMA DE MENSAJES FLOTANTES ---
    function showMessage(message, type) {
        const existingMessage = document.querySelector('.message-alert');
        if (existingMessage) existingMessage.remove();
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-alert message-${type}`;
        messageDiv.textContent = message;
        
        messageDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            padding: 15px 20px; border-radius: 4px;
            color: white; font-weight: 500; z-index: 1000;
            animation: slideIn 0.3s ease; max-width: 300px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        
        if (type === 'success') messageDiv.style.backgroundColor = '#27ae60';
        else if (type === 'info') messageDiv.style.backgroundColor = '#3498db';
        else if (type === 'warning') messageDiv.style.backgroundColor = '#f39c12';
        else messageDiv.style.backgroundColor = '#e74c3c';
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => messageDiv.remove(), 300);
            }
        }, 5000);
    }

    // Inyección de estilos de animación
    if (!document.querySelector('#message-styles')) {
        const style = document.createElement('style');
        style.id = 'message-styles';
        style.textContent = `
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(style);
    }
});

// ==========================================
// FUNCIÓN GLOBAL DE CONFIRMACIÓN PARA LOGOUT
// ==========================================
window.showConfirm = function(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('confirm-modal-title').innerHTML = `<i class="fas fa-sign-out-alt"></i> ${title}`;
        document.getElementById('confirm-modal-message').innerHTML = message;
        modal.style.display = 'flex'; 

        const btnOk = document.getElementById('confirm-modal-ok');
        const btnCancel = document.getElementById('confirm-modal-cancel');

        // Función para limpiar los event listeners clonando los nodos
        const cleanup = () => {
            btnOk.replaceWith(btnOk.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
            modal.style.display = 'none';
        };

        document.getElementById('confirm-modal-ok').addEventListener('click', () => {
            cleanup(); 
            resolve(true);
        });
        
        document.getElementById('confirm-modal-cancel').addEventListener('click', () => {
            cleanup(); 
            resolve(false);
        });
    });
};