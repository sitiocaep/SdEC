// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // --- REFERENCIAS A ELEMENTOS ---
    const examSelector = document.getElementById('exam-selector');
    const examCardsContainer = document.getElementById('exam-cards-container');
    const examInfoContainer = document.getElementById('exam-info-container');
    
    // Elementos de la tarjeta estilo "Captura"
    const examNameTitle = document.getElementById('exam-name-title'); 
    const examStatusPill = document.getElementById('exam-status-pill'); 
    const examDatePill = document.getElementById('exam-date-pill');     
    const examTimePill = document.getElementById('exam-time-pill');     
    
    // Botones y Selectores
    const headerExamSelect = document.getElementById('header-exam-select');
    const closeExamCardBtn = document.getElementById('close-exam-card');
    const startExamBtn = document.getElementById('start-exam-btn');
    const viewResultsBtn = document.getElementById('view-results-btn');
    const notPresentedBtn = document.getElementById('not-presented-btn');
    
    // Almacenamiento de datos
    let examData = {}; 
    window.selectedExamKey = null;

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
            
            // Generar las tarjetas de la pantalla principal
            renderExamCards();
            
            if(examSelector) examSelector.style.display = 'block';
            setInterval(updateExamStatuses, 1000);
        })
        .catch(error => {
            console.error('Error fetching exams:', error);
            showMessage('Error al cargar exámenes. Intenta recargar la página.', 'error');
            if(examCardsContainer) examCardsContainer.innerHTML = '<p>Error al cargar los exámenes.</p>';
            if(examSelector) examSelector.style.display = 'block'; 
        });

    // --- FUNCIÓN PARA DETERMINAR COLOR DE TARJETA SEGÚN ESTADO ---
    function getCardStatusClass(exam, statusText) {
        if (exam.taken || statusText === 'Finalizado') return 'status-card-finished';
        if (statusText === 'Disponible') return 'status-card-available';
        return 'status-card-pending'; // Aún no empieza
    }

    // --- RENDERIZAR TARJETAS ORDENADAS ---
    function renderExamCards() {
        if(!examCardsContainer) return;
        examCardsContainer.innerHTML = '';
        
        const examKeys = Object.keys(examData);
        if (examKeys.length === 0) {
            examCardsContainer.innerHTML = '<p style="text-align:center; color:#7f8c8d; grid-column: 1/-1;">No hay exámenes disponibles en este momento.</p>';
            return;
        }

        // Extracción limpia del HTML del logo para usarlo en las tarjetas
        const logoRef = document.getElementById('reference-logo-box');
        const logoHTML = logoRef ? logoRef.innerHTML.trim() : '<span>LOGO</span>';

        // Convertir el objeto a Array para poder ordenarlo
        const examsArray = examKeys.map(key => ({
            key: key,
            ...examData[key]
        }));

        // Ordenar el Array de fechas (del más antiguo al más reciente)
        examsArray.sort((a, b) => {
            const getTimestamp = (exam) => {
                if (!exam.raw_date) return Number.MAX_SAFE_INTEGER; 
                const timeStr = exam.raw_start ? exam.raw_start.trim() : '00:00:00';
                const dateStr = `${exam.raw_date.trim()}T${timeStr}`;
                const timestamp = new Date(dateStr).getTime();
                return isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
            };
            return getTimestamp(a) - getTimestamp(b);
        });

        // Dibujar las tarjetas ya ordenadas
        examsArray.forEach(exam => {
            const examKey = exam.key;
            const newStatusInfo = calculateExamStatus(exam);
            const statusText = exam.taken ? 'Finalizado' : newStatusInfo.status;
            
            const statusClass = getCardStatusClass(exam, statusText);
            
            let pillClass = 'status-not-started';
            if (exam.taken || statusText === 'Finalizado') pillClass = 'status-finished';
            else if (statusText === 'Disponible') pillClass = 'pill-green';
            
            const card = document.createElement('div');
            card.className = `exam-preview-card ${statusClass}`;
            card.setAttribute('data-key', examKey);
            
            card.innerHTML = `
                <div class="card-logo-container">
                    ${logoHTML}
                </div>
                <div class="card-details">
                    <div class="card-title-row">
                        <h4 class="card-title">${exam.name || examKey}</h4>
                        <span class="card-status-badge ${pillClass}">${statusText}</span>
                    </div>
                    <p class="card-detail-text">${formatDatePretty(exam.raw_date)}</p>
                    <p class="card-detail-text">${formatTime(exam.raw_start)} - ${formatTime(exam.raw_end)}</p>
                </div>
                <div class="card-actions">
                    <button class="btn-select-card" onclick="selectExam('${examKey}')">Seleccionar Examen</button>
                </div>
            `;
            examCardsContainer.appendChild(card);
        });
    }

    // --- FUNCIÓN GLOBAL PARA SELECCIONAR UN EXAMEN ---
    window.selectExam = function(examKey) {
        const exam = examData[examKey];
        if (!exam) return;
        
        window.selectedExamKey = examKey;

        if(examNameTitle) examNameTitle.textContent = exam.name || examKey;
        updateStatusUI(exam);
        if(examDatePill) examDatePill.textContent = formatDatePretty(exam.raw_date);
        if(examTimePill) examTimePill.textContent = `${formatTime(exam.raw_start)} - ${formatTime(exam.raw_end)}`;
        
        if(examSelector) examSelector.style.display = 'none';
        if(examInfoContainer) examInfoContainer.style.display = 'block';

        showMessage(`Examen seleccionado: ${exam.name}`, 'success');
        examInfoContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // --- MANEJO DEL DESPLEGABLE EN LA CABECERA ---
    if(headerExamSelect) {
        headerExamSelect.addEventListener('change', function() {
            if (this.value) {
                selectExam(this.value);
                this.value = ''; 
            }
        });
    }

    // --- FUNCIÓN REUTILIZABLE PARA COLAPSAR LA TARJETA ---
    function collapseExamCard() {
        if(examInfoContainer) examInfoContainer.style.display = 'none';
        if(examSelector) examSelector.style.display = 'block'; 
        window.selectedExamKey = null;
    }

    if(closeExamCardBtn) {
        closeExamCardBtn.addEventListener('click', function(e) {
            e.preventDefault();
            collapseExamCard();
            showMessage('Puedes seleccionar otro examen', 'info'); 
        });
    }

    document.addEventListener('click', function(e) {
        if (examInfoContainer && examInfoContainer.style.display === 'block') {
            if (!examInfoContainer.contains(e.target)) {
                if (!e.target.closest('.btn-select-card')) {
                    collapseExamCard();
                }
            }
        }
    });

    if (startExamBtn) {
        startExamBtn.addEventListener('click', function() {
            if (!this.disabled && this.style.display !== 'none') {
                const examKey = window.selectedExamKey;
                if (!examKey) return;

                const examUrl = `/examen?materia=${encodeURIComponent(examKey)}`;
                const testUrl = `/test?next=${encodeURIComponent(examUrl)}`;
                window.location.href = testUrl;
            }
        });
    }

    function formatTime(timeStr) {
        return timeStr ? timeStr.substring(0, 5) : "--:--";
    }

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

    function updateStatusUI(exam) {
        if(startExamBtn) { startExamBtn.style.display = 'none'; startExamBtn.disabled = true; }
        if(viewResultsBtn) { viewResultsBtn.style.display = 'none'; viewResultsBtn.textContent = 'Ver resultados'; viewResultsBtn.onclick = null; viewResultsBtn.classList.remove('disabled'); viewResultsBtn.style.cursor = 'pointer'; viewResultsBtn.style.backgroundColor = ''; }
        if(notPresentedBtn) { notPresentedBtn.style.display = 'none'; }

        let statusText = exam.status;
        let colorClass = 'status-not-started'; 

        const isAdmin = document.body.getAttribute('data-is-admin') === 'true';

        if (exam.taken) {
            statusText = "Finalizado";
            colorClass = "status-finished";

            const today = new Date();
            let resultsAvailable = false;
            let resultDateText = "Próximamente";

            if (exam.results_date && exam.results_time) {
                try {
                    const resStr = `${exam.results_date.trim()}T${exam.results_time.trim()}`;
                    const resDateTime = new Date(resStr);
                    const dateFormatted = formatDatePretty(exam.results_date);
                    const timeFormatted = exam.results_time.substring(0, 5); 
                    resultDateText = `${dateFormatted} - ${timeFormatted}`;

                    if (!isNaN(resDateTime.getTime()) && today >= resDateTime) {
                        resultsAvailable = true;
                    }
                } catch(e) { console.error("Error parsing result date", e); }
            }

            if(viewResultsBtn) {
                viewResultsBtn.style.display = 'flex';
                if (resultsAvailable || isAdmin) {
                    viewResultsBtn.textContent = (isAdmin && !resultsAvailable) ? "Ver Resultados (Admin)" : "Ver Resultados";
                    viewResultsBtn.classList.remove('disabled');
                    viewResultsBtn.onclick = () => { 
                        window.location.href = `/resultados?materia=${encodeURIComponent(exam.name || exam.code)}`; 
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
                if(notPresentedBtn) { notPresentedBtn.style.display = 'flex'; }
            } else {
                statusText = "Aún no empieza";
                colorClass = "status-not-started";
            }
            
            if (isAdmin && viewResultsBtn) {
                viewResultsBtn.style.display = 'flex';
                viewResultsBtn.textContent = "Ver Resultados (Admin)";
                viewResultsBtn.classList.remove('disabled');
                viewResultsBtn.style.cursor = 'pointer';
                viewResultsBtn.style.backgroundColor = ''; 
                viewResultsBtn.onclick = () => { 
                    window.location.href = `/resultados?materia=${encodeURIComponent(exam.name || exam.code)}`; 
                };
            }
        }

        if (examStatusPill) {
            examStatusPill.textContent = statusText;
            examStatusPill.className = 'detail-pill ' + colorClass;
        }
        if(examDatePill) examDatePill.className = 'detail-pill ' + colorClass;
        if(examTimePill) examTimePill.className = 'detail-pill ' + colorClass;
    }

    function updateExamStatuses() {
        if (!examData) return;

        for (const examKey in examData) {
            const exam = examData[examKey];
            const newStatusInfo = calculateExamStatus(exam);
            exam.status = newStatusInfo.status;
            exam.available = newStatusInfo.available;

            const previewCard = document.querySelector(`.exam-preview-card[data-key="${examKey}"]`);
            if (previewCard) {
                const statusText = exam.taken ? "Finalizado" : exam.status;
                const statusBadge = previewCard.querySelector('.card-status-badge');
                
                if (statusBadge) {
                    statusBadge.textContent = statusText;
                    let newPillClass = 'status-not-started';
                    if (exam.taken || statusText === 'Finalizado') newPillClass = 'status-finished';
                    else if (statusText === 'Disponible') newPillClass = 'pill-green';
                    
                    statusBadge.className = `card-status-badge ${newPillClass}`;
                }
                
                const newClass = `exam-preview-card ${getCardStatusClass(exam, statusText)}`;
                if (previewCard.className !== newClass) {
                    previewCard.className = newClass;
                }
            }
        }

        if (window.selectedExamKey && examData[window.selectedExamKey]) {
            updateStatusUI(examData[window.selectedExamKey]);
        }
    }

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

window.showConfirm = function(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('confirm-modal-title').innerHTML = `<i class="fas fa-sign-out-alt"></i> ${title}`;
        document.getElementById('confirm-modal-message').innerHTML = message;
        modal.style.display = 'flex'; 

        const btnOk = document.getElementById('confirm-modal-ok');
        const btnCancel = document.getElementById('confirm-modal-cancel');

        const cleanup = () => {
            btnOk.replaceWith(btnOk.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
            modal.style.display = 'none';
        };

        document.getElementById('confirm-modal-ok').addEventListener('click', () => {
            cleanup(); resolve(true);
        });
        
        document.getElementById('confirm-modal-cancel').addEventListener('click', () => {
            cleanup(); resolve(false);
        });
    });
};