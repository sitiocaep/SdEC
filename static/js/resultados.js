document.addEventListener('DOMContentLoaded', function() {
    const materia = window.resultsConfig.materia;
    const detailsContainer = document.getElementById('details-container');
    const toggleBtn = document.getElementById('toggle-details-btn');
    const chartCtx = document.getElementById('resultsChart').getContext('2d');
    
    // --- Cargar Datos ---
    fetch(`/api/get-exam-results?materia=${encodeURIComponent(materia)}`)
        .then(res => {
            if (!res.ok) throw new Error("No se encontraron resultados");
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.message);
            renderSummary(data.summary);
            renderChart(data.summary);
            renderDetails(data.details);
        })
        .catch(err => {
            console.error(err);
            detailsContainer.innerHTML = `<div style="text-align:center; color:#e74c3c; padding:20px;">
                <i class="fas fa-exclamation-triangle"></i> Error: ${err.message}
            </div>`;
        });

    // --- Renderizado del Resumen ---
    function renderSummary(summary) {
        document.getElementById('score-number').textContent = summary.calificacion;
        document.getElementById('count-correct').textContent = summary.correctas;
        document.getElementById('count-incorrect').textContent = summary.incorrectas;
        document.getElementById('count-unanswered').textContent = summary.sin_responder;
        
        // Color del círculo de calificación
        const scoreCircle = document.querySelector('.score-circle');
        if (summary.calificacion >= 6) scoreCircle.style.borderColor = '#27ae60';
        else scoreCircle.style.borderColor = '#e74c3c';
    }

    // --- Gráfica Chart.js ---
    function renderChart(summary) {
        new Chart(chartCtx, {
            type: 'doughnut',
            data: {
                labels: ['Correctas', 'Incorrectas', 'Sin Responder'],
                datasets: [{
                    data: [summary.correctas, summary.incorrectas, summary.sin_responder],
                    backgroundColor: ['#27ae60', '#e74c3c', '#95a5a6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // --- Renderizado de Detalles ---
    function renderDetails(details) {
        detailsContainer.innerHTML = ''; // Limpiar loader
        
        details.forEach(item => {
            // Crear tarjeta
            const card = document.createElement('div');
            card.className = `question-card status-${item.status}`;
            
            // Determinar texto de estado
            let statusText = '';
            if (item.status === 'correcta') statusText = '<span style="color:#27ae60">Correcta</span>';
            else if (item.status === 'incorrecta') statusText = '<span style="color:#e74c3c">Incorrecta</span>';
            else statusText = '<span style="color:#f39c12">No respondida</span>';

            let html = `
                <div class="q-header">
                    <span>Pregunta ${item.numero}</span>
                    <span>${statusText}</span>
                </div>
                <div class="q-text">${item.pregunta}</div>
                <div class="options-grid">
            `;

            // Opciones (A, B, C, D)
            ['A', 'B', 'C', 'D'].forEach(optKey => {
                const optText = item.opciones[optKey];
                if (!optText) return; // Si no hay texto (ej. preguntas de 3 opciones)

                let rowClass = 'option-row';
                let icon = optKey;

                // Lógica de coloreado
                if (item.correcta === optKey) {
                    rowClass += ' correct-answer';
                    icon = '<i class="fas fa-check"></i>';
                }
                
                // Si el usuario seleccionó esta y es incorrecta
                if (item.seleccionada === optKey && item.seleccionada !== item.correcta) {
                    rowClass += ' user-selected';
                    icon = '<i class="fas fa-times"></i>';
                }
                // Si el usuario seleccionó esta y es correcta (ya tiene correct-answer, pero aseguramos)
                else if (item.seleccionada === optKey && item.seleccionada === item.correcta) {
                    // Ya tiene el estilo verde por ser la correcta
                    icon = '<i class="fas fa-check-double"></i>';
                }

                html += `
                    <div class="${rowClass}">
                        <div class="option-icon">${icon}</div>
                        <div>${optText}</div>
                    </div>
                `;
            });

            html += `</div>`; // Cierre grid
            card.innerHTML = html;
            detailsContainer.appendChild(card);
        });
    }

    // --- Evento Toggle ---
    toggleBtn.addEventListener('click', function() {
        const isHidden = detailsContainer.style.display === 'none';
        detailsContainer.style.display = isHidden ? 'flex' : 'none';
        this.innerHTML = isHidden 
            ? 'Ocultar Detalles <i class="fas fa-chevron-up"></i>' 
            : 'Ver Detalles por Pregunta <i class="fas fa-chevron-down"></i>';
    });
});