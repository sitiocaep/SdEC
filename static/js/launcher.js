// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    const examCardsContainer = document.getElementById('exam-cards-container');
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
            renderExamCards();
            setInterval(updateExamStatuses, 1000);
        })
        .catch(error => {
            console.error('Error fetching exams:', error);
            showMessage('Error al cargar exámenes. Intenta recargar la página.', 'error');
            if(examCardsContainer) examCardsContainer.innerHTML = '<p>Error al cargar los exámenes.</p>';
        });

    // --- FUNCIONES DE REDIRECCIÓN DIRECTA ---
    window.executeExamAction = function(actionType, examKey, examName) {
        if (actionType === 'start') {
            const examUrl = `/examen?materia=${encodeURIComponent(examKey)}`;
            const testUrl = `/test?next=${encodeURIComponent(examUrl)}`;
            window.location.href = testUrl;
        } else if (actionType === 'results') {
            window.location.href = `/resultados?materia=${encodeURIComponent(examName)}`;
        }
    };

    // --- CONFIGURACIÓN DINÁMICA DE LA TARJETA Y PIE ---
    function getCardConfig(exam, statusText, examKey) {
        let config = {
            text: "SELECCIONAR",
            footerClass: "footer-pending",
            actionOnClick: "",
            isClickable: false,
            borderStateClass: "state-pending"
        };

        if (exam.taken) {
            let resultsAvailable = false;
            let resultDateText = "";
            
            if (exam.results_date && exam.results_time) {
                try {
                    const resStr = `${exam.results_date.trim()}T${exam.results_time.trim()}`;
                    const resDateTime = new Date(resStr);
                    if (!isNaN(resDateTime.getTime()) && new Date() >= resDateTime) {
                        resultsAvailable = true;
                    } else {
                        const compactDate = formatDatePretty(exam.results_date).replace(/\s-\s/g, '-');
                        resultDateText = `${compactDate} ${exam.results_time.substring(0, 5)}`;
                    }
                } catch(e) {}
            }

            if (resultsAvailable) {
                config.text = "VER RESULTADOS";
                config.footerClass = "footer-results";
                config.borderStateClass = "state-results"; 
                config.actionOnClick = `executeExamAction('results', '${examKey}', '${exam.name || exam.code || ''}')`;
                config.isClickable = true;
            } else {
                config.text = resultDateText ? resultDateText : "PRÓX. RESULTADOS";
                config.footerClass = "footer-scheduled";
                config.borderStateClass = "state-scheduled"; 
            }
        } else if (statusText === 'Disponible') {
            config.text = "EMPEZAR EXAMEN";
            config.footerClass = "footer-start";
            config.borderStateClass = "state-available"; 
            config.actionOnClick = `executeExamAction('start', '${examKey}', '')`;
            config.isClickable = true;
        } else if (statusText === 'Finalizado') {
            config.text = "NO PRESENTÓ";
            config.footerClass = "footer-finished"; 
            config.borderStateClass = "state-finished"; 
        } else {
            config.text = "PRÓXIMAMENTE";
            config.footerClass = "footer-pending"; 
            config.borderStateClass = "state-pending"; 
        }

        return config;
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

        const logoRef = document.getElementById('reference-logo-box');
        const logoHTML = logoRef ? logoRef.innerHTML.trim() : '<span>LOGO</span>';

        const examsArray = examKeys.map(key => ({ key: key, ...examData[key] }));
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

        examsArray.forEach(exam => {
            const examKey = exam.key;
            const newStatusInfo = calculateExamStatus(exam);
            const statusText = exam.taken ? 'Finalizado' : newStatusInfo.status;
            
            const config = getCardConfig(exam, statusText, examKey);
            const clickableClass = config.isClickable ? 'is-clickable' : '';
            
            let pillClass = 'status-not-started';
            if (exam.taken || statusText === 'Finalizado') pillClass = 'status-finished';
            else if (statusText === 'Disponible') pillClass = 'pill-green';
            
            const card = document.createElement('div');
            card.className = `exam-preview-card ${config.borderStateClass} ${clickableClass}`;
            card.setAttribute('data-key', examKey);
            if (config.isClickable) {
                card.setAttribute('onclick', config.actionOnClick);
            }
            
            card.innerHTML = `
                <div class="card-body-content">
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
                </div>
                <div class="card-action-footer ${config.footerClass}">
                    ${config.text}
                </div>
            `;
            examCardsContainer.appendChild(card);
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

    // --- ACTUALIZACIÓN DINÁMICA DE ESTADOS POR SEGUNDO ---
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
                
                const config = getCardConfig(exam, statusText, examKey);
                
                if (config.isClickable) {
                    previewCard.className = `exam-preview-card ${config.borderStateClass} is-clickable`;
                    previewCard.setAttribute('onclick', config.actionOnClick);
                } else {
                    previewCard.className = `exam-preview-card ${config.borderStateClass}`;
                    previewCard.removeAttribute('onclick');
                }

                const footer = previewCard.querySelector('.card-action-footer');
                if (footer) {
                    footer.textContent = config.text;
                    footer.className = `card-action-footer ${config.footerClass}`;
                }
            }
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