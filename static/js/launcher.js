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
    const changeExamLink = document.getElementById('change-exam');
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
            
            // Poblar selector
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
            
            // Mostrar selector
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
    
    // --- BOTÓN CAMBIAR EXAMEN ---
    if(changeExamLink) {
        changeExamLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            if(examInfoContainer) examInfoContainer.style.display = 'none';
            if(examSelector) examSelector.style.display = 'block'; 
            if(examSelect) examSelect.value = ''; // Reiniciar select

            showMessage('Puedes seleccionar otro examen', 'info');
        });
    }

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
                    
                    // --- AQUÍ ESTÁ EL CAMBIO DE FORMATO ---
                    // Se usa " - " para separar también la hora
                    const dateFormatted = formatDatePretty(exam.results_date);
                    const timeFormatted = exam.results_time.substring(0, 5); // HH:MM
                    
                    resultDateText = `${dateFormatted} - ${timeFormatted}`;
                    // -------------------------------------

                    if (!isNaN(resDateTime.getTime())) {
                        if (today >= resDateTime) {
                            resultsAvailable = true;
                        }
                    }
                } catch(e) { console.error("Error parsing result date", e); }
            }

            if(viewResultsBtn) {
                viewResultsBtn.style.display = 'flex';
                
                if (resultsAvailable) {
                    // Muestra botón normal de ver resultados
                    viewResultsBtn.textContent = "Ver Resultados";
                    viewResultsBtn.classList.remove('disabled');
                    
                    // Redirección
                    viewResultsBtn.onclick = () => { 
                        const materiaParam = encodeURIComponent(exam.name || exam.code);
                        window.location.href = `/resultados?materia=${materiaParam}`; 
                    };
                    
                } else {
                    // Muestra botón informativo con fecha y hora separadas uniformemente
                    viewResultsBtn.textContent = `Fecha de resultados: ${resultDateText}`;
                    viewResultsBtn.classList.add('disabled');
                    viewResultsBtn.style.cursor = 'default';
                    viewResultsBtn.style.backgroundColor = '#f39c12'; // Color ambar informativo
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
                // Se acabó el tiempo y no lo hizo
                statusText = "Finalizado";
                colorClass = "status-finished";
                
                if(notPresentedBtn) {
                    notPresentedBtn.style.display = 'flex';
                }
            } else {
                // Aún no empieza
                statusText = "Aún no empieza";
                colorClass = "status-not-started";
                // Ningún botón se muestra
            }
        }

        // Actualizar UI del Pill
        if (examStatusPill) {
            examStatusPill.textContent = statusText;
            examStatusPill.className = 'detail-pill ' + colorClass;
        }
        
        // Sincronizar colores de Fecha y Hora con el status
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