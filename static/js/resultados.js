document.addEventListener('DOMContentLoaded', function() {
    const materia = window.resultsConfig.materia;
    const chartCtx = document.getElementById('resultsChart').getContext('2d');
    
    let globalQuestions = [];
    let currentFilter = 'all'; // Filtro actual (all, correcta, incorrecta, sin_responder)

    // --- Cargar Datos ---
    fetch(`/api/get-exam-results?materia=${encodeURIComponent(materia)}`)
        .then(res => {
            if (!res.ok) throw new Error("No se encontraron resultados");
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.message);
            // Guardamos las preguntas con su índice original para no perder la referencia al filtrar
            globalQuestions = data.details.map((q, idx) => ({ ...q, originalIndex: idx }));
            
            renderSummary(data.summary);
            renderChart(data.summary);
            setupFilters();
            renderNavigation(); // Renderiza la barra inicial (Todas)
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
        document.getElementById('count-total').textContent = summary.total;
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
                    legend: { display: false } 
                },
                cutout: '65%' 
            }
        });
    }

    // --- Configurar los clics de los Filtros ---
    function setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                // Quitar clase activa a todos
                filterBtns.forEach(b => b.classList.remove('active-filter'));
                // Poner clase activa al clickeado
                this.classList.add('active-filter');
                
                // Actualizar la variable de filtro
                currentFilter = this.getAttribute('data-filter');
                
                // Re-renderizar la botonera derecha
                renderNavigation();
            });
        });
    }

    // --- Renderizado de la barra de navegación (Aplica Filtros) ---
    function renderNavigation() {
        const navContainer = document.getElementById('questions-nav');
        navContainer.innerHTML = ''; 
        
        // Filtrar las preguntas según el botón clickeado en la izquierda
        const filteredQuestions = globalQuestions.filter(q => currentFilter === 'all' || q.status === currentFilter);

        // Si no hay preguntas en este filtro
        if (filteredQuestions.length === 0) {
            navContainer.innerHTML = '<div style="color:#7f8c8d; padding:10px; width: 100%; text-align: center;">No hay preguntas en esta categoría.</div>';
            document.getElementById('single-question-container').innerHTML = '';
            return;
        }

        // Crear los botones
        filteredQuestions.forEach((item) => {
            const btn = document.createElement('div');
            
            let statusClass = 'unanswered';
            if(item.status === 'correcta') statusClass = 'correct';
            if(item.status === 'incorrecta') statusClass = 'incorrect';

            btn.className = `nav-item ${statusClass}`;
            btn.textContent = item.numero;
            
            // Usamos el originalIndex para que siempre muestre la pregunta correcta
            btn.onclick = () => showQuestion(item.originalIndex);
            
            // Identificador en el DOM para poder pintar la clase active más adelante
            btn.setAttribute('data-target-index', item.originalIndex);
            
            navContainer.appendChild(btn);
        });

        // Mostrar automáticamente la PRIMERA pregunta de la lista filtrada
        showQuestion(filteredQuestions[0].originalIndex);
    }

    // --- Mostrar una pregunta individual ---
    function showQuestion(originalIndex) {
        // 1. Actualizar el estado visual del botón activo en la barra
        const navButtons = document.querySelectorAll('.nav-item');
        navButtons.forEach(btn => {
            if(parseInt(btn.getAttribute('data-target-index')) === originalIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 2. Obtener los datos de la pregunta
        const item = globalQuestions[originalIndex];
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