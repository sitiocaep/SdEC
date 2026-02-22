document.addEventListener('DOMContentLoaded', function() {
    const materia = window.resultsConfig.materia;
    const chartCtx = document.getElementById('resultsChart').getContext('2d');
    
    // Variable global para almacenar las preguntas y poder navegar
    let globalQuestions = [];

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
            renderNavigation(data.details); // Renderiza la barra de botones
        })
        .catch(err => {
            console.error(err);
            document.getElementById('questions-nav').innerHTML = '';
            document.getElementById('single-question-container').innerHTML = `<div style="text-align:center; color:#e74c3c; padding:20px;">
                <i class="fas fa-exclamation-triangle"></i> Error: ${err.message}
            </div>`;
        });

    // --- Renderizado del Resumen ---
    function renderSummary(summary) {
        document.getElementById('score-number').textContent = summary.calificacion;
        document.getElementById('count-correct').textContent = summary.correctas;
        document.getElementById('count-incorrect').textContent = summary.incorrectas;
        document.getElementById('count-unanswered').textContent = summary.sin_responder;
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
                    legend: { display: false } // Oculto leyenda para un look más limpio como tu boceto
                },
                cutout: '65%' // Qué tan grueso es el anillo
            }
        });
    }

    // --- Renderizado de la barra de navegación ---
    function renderNavigation(details) {
        globalQuestions = details;
        const navContainer = document.getElementById('questions-nav');
        navContainer.innerHTML = ''; 
        
        details.forEach((item, index) => {
            const btn = document.createElement('div');
            
            // Asignar clase de estado (correct, incorrect, unanswered)
            let statusClass = 'unanswered';
            if(item.status === 'correcta') statusClass = 'correct';
            if(item.status === 'incorrecta') statusClass = 'incorrect';

            btn.className = `nav-item ${statusClass}`;
            btn.textContent = item.numero;
            
            // Evento click para mostrar la pregunta
            btn.onclick = () => showQuestion(index);
            
            navContainer.appendChild(btn);
        });

        // Mostrar automáticamente la pregunta 1 al cargar
        if(details.length > 0) {
            showQuestion(0);
        }
    }

    // --- Mostrar una pregunta individual ---
    function showQuestion(index) {
        // 1. Actualizar el estado visual del botón activo en la barra
        const navButtons = document.querySelectorAll('.nav-item');
        navButtons.forEach((btn, i) => {
            if(i === index) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // 2. Obtener los datos de la pregunta
        const item = globalQuestions[index];
        const container = document.getElementById('single-question-container');

        // 3. Generar el estado de la pregunta (icono y color)
        let statusText = '';
        if (item.status === 'correcta') statusText = '<span style="color:#27ae60"><i class="fas fa-check-circle"></i> Respondida Correctamente</span>';
        else if (item.status === 'incorrecta') statusText = '<span style="color:#e74c3c"><i class="fas fa-times-circle"></i> Respondida Incorrectamente</span>';
        else statusText = '<span style="color:#f39c12"><i class="fas fa-minus-circle"></i> No se respondió</span>';

        // 4. Construir el HTML
        let html = `
            <div class="q-header">
                <span>PREGUNTA ${item.numero}</span>
                <span>${statusText}</span>
            </div>
            <div class="q-text">${item.pregunta}</div>
            <div class="options-grid">
        `;

        ['A', 'B', 'C', 'D'].forEach(optKey => {
            const optText = item.opciones[optKey];
            if (!optText) return; 

            let rowClass = 'option-row';
            let icon = optKey;

            if (item.correcta === optKey) {
                rowClass += ' correct-answer';
                icon = '<i class="fas fa-check"></i>';
            }
            
            if (item.seleccionada === optKey && item.seleccionada !== item.correcta) {
                rowClass += ' user-selected';
                icon = '<i class="fas fa-times"></i>';
            } else if (item.seleccionada === optKey && item.seleccionada === item.correcta) {
                icon = '<i class="fas fa-check-double"></i>';
            }

            html += `
                <div class="${rowClass}">
                    <div class="option-icon">${icon}</div>
                    <div>${optText}</div>
                </div>
            `;
        });

        html += `</div>`; 
        container.innerHTML = html;
    }
});